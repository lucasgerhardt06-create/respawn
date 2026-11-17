import { describe, expect, it, vi } from 'vitest'
import { EpitaphSummarySchema, NarrateInput } from '../../server/ai/schemas'
import { sampleCtx, sampleScene } from '../../server/ai/samples'
import type { EndSummary } from '../engine/types'
import { clipContext, clipScene, compactSummary, createAIClient, LIFE_CALL_CAP } from './client'

const okNarration = () =>
  new Response(JSON.stringify({ data: { text: 'PM is already at the board.', choiceLabels: { go: 'Go' } } }), { status: 200 })

describe('AI client', () => {
  it('times out to null (never throws)', async () => {
    vi.useFakeTimers()
    const hanging = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const client = createAIClient({ baseUrl: '/api/ai', fetch: hanging })
    const p = client.narrateScene(sampleCtx, sampleScene)
    await vi.advanceTimersByTimeAsync(3600)
    await expect(p).resolves.toBeNull()
    vi.useRealTimers()
  })

  it('returns null on HTTP errors and network errors', async () => {
    const c1 = createAIClient({ fetch: async () => new Response('{"error":"x"}', { status: 503 }) })
    expect(await c1.narrateScene(sampleCtx, sampleScene)).toBeNull()
    const c2 = createAIClient({
      fetch: async () => {
        throw new TypeError('network down')
      },
    })
    expect(await c2.generateStartup(sampleCtx, { id: 'climate', label: 'Climate tech' })).toBeNull()
  })

  it('posts to <base>/<task> with the life header; caches per scene; resetLife changes the id', async () => {
    const f = vi.fn(async () => okNarration())
    let n = 0
    const client = createAIClient({ baseUrl: 'https://ref.supabase.co/functions/v1/respawn-ai/', fetch: f, newLifeId: () => `life_id_${++n}xxxx` })
    const a = await client.narrateScene(sampleCtx, sampleScene)
    const b = await client.narrateScene(sampleCtx, sampleScene)
    expect(a).toEqual({ text: 'PM is already at the board.', choiceLabels: { go: 'Go' } })
    expect(b).toBe(a)
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://ref.supabase.co/functions/v1/respawn-ai/narrate')
    expect((init.headers as Record<string, string>)['x-respawn-life']).toBe('life_id_1xxxx')
    expect(client.callsUsed).toBe(1)
    client.resetLife()
    expect(client.callsUsed).toBe(0)
    await client.narrateScene(sampleCtx, sampleScene)
    const [, init2] = f.mock.calls[1] as unknown as [string, RequestInit]
    expect((init2.headers as Record<string, string>)['x-respawn-life']).toBe('life_id_2xxxx')
  })

  it('skips scenes that should not be narrated', async () => {
    const f = vi.fn(async () => okNarration())
    const client = createAIClient({ fetch: f })
    expect(await client.narrateScene(sampleCtx, { ...sampleScene, narrate: false })).toBeNull()
    expect(await client.narrateScene(sampleCtx, { ...sampleScene, isAiEvent: true })).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('enforces the per-life cap and keeps 3 calls for the finale', async () => {
    const f = vi.fn(async () => okNarration())
    const client = createAIClient({ fetch: f })
    for (let i = 0; i < LIFE_CALL_CAP + 5; i++) await client.narrateScene(sampleCtx, { ...sampleScene, id: `s${i}` })
    expect(client.callsUsed).toBe(LIFE_CALL_CAP - 3)
    await client.generateStartup(sampleCtx, { id: 'x', label: 'X' })
    expect(client.callsUsed).toBe(LIFE_CALL_CAP - 2)
  })

  it('clipped payloads always pass the server schema', () => {
    const long = 'x'.repeat(500)
    const ctx = { ...sampleCtx, name: long, memories: Array.from({ length: 40 }, () => long) }
    const scene = { ...sampleScene, text: long.repeat(4), choices: sampleScene.choices.map((c) => ({ ...c, label: long })) }
    expect(NarrateInput.safeParse({ ctx: clipContext(ctx), scene: clipScene(scene) }).success).toBe(true)
  })

  it('compactSummary matches the server epitaph schema', () => {
    const summary = {
      name: 'Inès',
      deathAge: 84.4,
      title: { id: 'quiet_hero', title: 'Quiet Hero', description: 'Did good, quietly.', conditions: 'age > 0', priority: 1 },
      you: { money: 50.2, happiness: 60, social: 70, fame: 30, contribution: 80, footprint: 40 },
      earth: { scores: { temperature: 50, ocean: 50, biodiversity: 50, livability: 50, tech: 50, ai: 50 }, temperatureC: 2.71, oceanM: 0.56, insectsPct: 30, heatBillions: 2, techIndex: 50, aiIndex: 50 },
      F: 9.21,
      lifetimeT: 610.4,
      frenchAverageLifetimeT: 607,
      digitalShare: 0.04,
      screenYears: 7,
      workT: 6000,
      influenceT: 0,
      materialsT: 2,
      receipt: [
        { label: 'Just living in France', category: 'other', t: 580 },
        { label: 'Exchange flight', category: 'flights', t: 3.2, sceneId: 'c06_exchange' },
      ],
      topChoices: [{ historyIndex: 3, sceneId: 'c11', title: 'First job', chosenLabel: 'Doctors Without Orders', age: 22, impact: 9, alternatives: [] }],
      badges: [{ id: 'kept_it', label: 'Kept it', description: 'Kept the phone' }],
      stats: {},
      flags: [],
    } as unknown as EndSummary
    const compact = compactSummary(summary)
    expect(compact.receiptTop).toEqual([{ label: 'Exchange flight', t: 3.2 }])
    expect(EpitaphSummarySchema.safeParse(compact).success).toBe(true)
  })
})
