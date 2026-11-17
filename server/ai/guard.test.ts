import { describe, expect, it } from 'vitest'
import { envFrom } from '../env'
import { createGuard, LifeCounter, RateLimiter, readLifeId } from './guard'
import { NarrateInput } from './schemas'
import { samples } from './samples'

const LIFE = 'life_abcdef12'

function req(body: unknown, headers: Record<string, string> = {}, method = 'POST') {
  return new Request('http://localhost/api/ai/narrate', {
    method,
    headers: { 'content-type': 'application/json', 'x-respawn-life': LIFE, 'x-forwarded-for': '10.0.0.1', ...headers },
    body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('RateLimiter (token bucket)', () => {
  it('allows a burst, then refills over time', () => {
    let t = 0
    const rl = new RateLimiter(60, 3, () => t) // 1 token / second, burst 3
    expect(rl.take('ip').ok).toBe(true)
    expect(rl.take('ip').ok).toBe(true)
    expect(rl.take('ip').ok).toBe(true)
    const denied = rl.take('ip')
    expect(denied.ok).toBe(false)
    if (!denied.ok) expect(denied.retryAfterSec).toBeGreaterThanOrEqual(1)
    expect(rl.take('other-ip').ok).toBe(true)
    t += 1000
    expect(rl.take('ip').ok).toBe(true)
    expect(rl.take('ip').ok).toBe(false)
  })
})

describe('LifeCounter', () => {
  it('caps calls per life', () => {
    const lc = new LifeCounter(2)
    expect(lc.hit('a')).toBe(true)
    expect(lc.hit('a')).toBe(true)
    expect(lc.hit('a')).toBe(false)
    expect(lc.hit('b')).toBe(true)
  })
})

describe('readLifeId', () => {
  it('accepts safe ids only', () => {
    expect(readLifeId(req({}, { 'x-respawn-life': 'abc' }))).toBeNull()
    expect(readLifeId(req({}, { 'x-respawn-life': 'bad id with spaces' }))).toBeNull()
    expect(readLifeId(req({}))).toBe(LIFE)
  })
})

describe('guard.check', () => {
  const env = envFrom({ RESPAWN_RATE_PER_MIN: '600', RESPAWN_RATE_BURST: '3', RESPAWN_LIFE_CAP: '2', RESPAWN_MAX_BODY_BYTES: '20000' })

  it('accepts a valid narration payload and sanitises it', async () => {
    const guard = createGuard({ env })
    const r = await guard.check(req(samples.narrate), NarrateInput)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.scene.id).toBe('m_pm_8am_1')
  })

  it('rejects wrong method, bad JSON, missing header, oversize bodies', async () => {
    const guard = createGuard({ env })
    expect((await guard.check(req(null, {}, 'GET'), NarrateInput)) as { status: number }).toMatchObject({ status: 405 })
    expect(await guard.check(req('{not json'), NarrateInput)).toMatchObject({ ok: false, status: 400 })
    expect(await guard.check(req(samples.narrate, { 'x-respawn-life': '' }), NarrateInput)).toMatchObject({ ok: false, status: 400 })
    const big = { ...(samples.narrate as object), padding: 'x'.repeat(30_000) }
    expect(await guard.check(req(big, { 'x-forwarded-for': '10.0.0.9' }), NarrateInput)).toMatchObject({ ok: false, status: 413 })
  })

  it('rejects bad shapes and over-long fields', async () => {
    const guard = createGuard({ env: envFrom({ RESPAWN_RATE_BURST: '100' }) })
    const base = samples.narrate as { ctx: object; scene: object }
    const cases: unknown[] = [
      { ...base, ctx: { ...base.ctx, age: 'nineteen' } },
      { ...base, ctx: { ...base.ctx, name: 'x'.repeat(41) } },
      { ...base, scene: { ...base.scene, text: 'x'.repeat(1401) } },
      { ...base, scene: { ...base.scene, kind: 'boss' } },
      { ...base, extra: true }, // unknown top-level key
      { scene: base.scene }, // missing ctx
    ]
    for (const body of cases) {
      const r = await guard.check(req(body), NarrateInput)
      expect(r).toMatchObject({ ok: false, status: 400 })
    }
  })

  it('rate-limits per IP', async () => {
    const guard = createGuard({ env: envFrom({ RESPAWN_RATE_PER_MIN: '1', RESPAWN_RATE_BURST: '2', RESPAWN_LIFE_CAP: '50' }) })
    expect((await guard.check(req(samples.narrate), NarrateInput)).ok).toBe(true)
    expect((await guard.check(req(samples.narrate), NarrateInput)).ok).toBe(true)
    const third = await guard.check(req(samples.narrate), NarrateInput)
    expect(third).toMatchObject({ ok: false, status: 429 })
    if (!third.ok) expect(third.headers?.['retry-after']).toBeDefined()
    expect((await guard.check(req(samples.narrate, { 'x-forwarded-for': '10.9.9.9' }), NarrateInput)).ok).toBe(true)
  })

  it('caps calls per life', async () => {
    const guard = createGuard({ env: envFrom({ RESPAWN_RATE_BURST: '100', RESPAWN_LIFE_CAP: '2' }) })
    expect((await guard.check(req(samples.narrate), NarrateInput)).ok).toBe(true)
    expect((await guard.check(req(samples.narrate), NarrateInput)).ok).toBe(true)
    expect(await guard.check(req(samples.narrate), NarrateInput)).toMatchObject({ ok: false, status: 429, error: 'life call cap reached' })
  })
})
