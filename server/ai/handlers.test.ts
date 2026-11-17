import { describe, expect, it, vi } from 'vitest'
import { envFrom } from '../env'
import { createGuard } from './guard'
import { createAiHandlers, firstSentences, runTask, TASK_DEFS } from './handlers'
import { PROFESSOR_NAME_TOKENS } from './filter'
import { estimateCostUsd, type Task } from './models'
import { ProviderError, ZERO_USAGE, type AiProvider, type FailureReason, type GenerateJsonParams } from './providers/types'
import { samples } from './samples'

type Answer = { text: string } | { fail: FailureReason } | { throws: ProviderError }

function fakeProvider(answer: Answer | ((p: GenerateJsonParams) => Answer)): AiProvider & { calls: GenerateJsonParams[] } {
  const calls: GenerateJsonParams[] = []
  return {
    name: 'anthropic',
    calls,
    async generateJson(p) {
      calls.push(p)
      const a = typeof answer === 'function' ? answer(p) : answer
      const usage = { ...ZERO_USAGE, inputTokens: 3000, outputTokens: 120 }
      const meta = { provider: 'anthropic' as const, model: 'claude-haiku-5-5', usage, costUsd: estimateCostUsd('claude-haiku-5-5', usage), ms: 5, stop: 'end_turn' }
      if ('throws' in a) throw a.throws
      if ('fail' in a) return { ok: false, reason: a.fail, ...meta }
      return { ok: true, text: a.text, ...meta }
    },
  }
}

const NARRATION = JSON.stringify({
  text: 'PM is already at the board, chalk squeaking, and the seat you left empty last week is still very visible. Your head is foggy from the sète. Malo is pulling on a hoodie.',
  choiceLabels: [
    { id: 'go', label: 'Drag yourself to row three' },
    { id: 'nope', label: 'Not a real choice' },
    { id: 'skip', label: 'x'.repeat(60) },
  ],
})

function handlers(provider: AiProvider, extraEnv: Record<string, string> = {}) {
  const env = envFrom({ ANTHROPIC_API_KEY: 'test-key', RESPAWN_RATE_BURST: '1000', ...extraEnv })
  return createAiHandlers({ env, guard: createGuard({ env }), provider: () => ({ ok: true, provider }), log: vi.fn() })
}

function post(task: Task, body: unknown) {
  return new Request(`http://localhost/api/ai/${task}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-respawn-life': 'life_test_0001' },
    body: JSON.stringify(body),
  })
}

async function run(task: Task, provider: AiProvider) {
  return runTask(task, TASK_DEFS[task].input.parse(samples[task]), provider)
}

describe('runTask', () => {
  it('narration: keeps valid labels only (known id, ≤ 40 chars)', async () => {
    const o = await run('narrate', fakeProvider({ text: NARRATION }))
    expect(o.ok).toBe(true)
    if (o.ok) {
      expect(o.data).toMatchObject({ choiceLabels: { go: 'Drag yourself to row three' } })
      expect(Object.keys((o.data as { choiceLabels: object }).choiceLabels)).toEqual(['go'])
    }
  })

  it('sends the cached bible + task block and a JSON schema', async () => {
    const p = fakeProvider({ text: NARRATION })
    await run('narrate', p)
    const call = p.calls[0]
    expect(call.system.bible).toContain('only ever called "PM"')
    expect(call.system.task).toContain('Task: narrate')
    expect(call.schema).toMatchObject({ type: 'object', additionalProperties: false })
    expect(call.user).toContain('<game_state>')
    expect(call.tier).toBe('narrator')
  })

  it('invalid JSON → rejected', async () => {
    const o = await run('narrate', fakeProvider({ text: '{"text": "unterminated' }))
    expect(o).toMatchObject({ ok: false, reason: 'invalid_json' })
  })

  it('Zod failure → rejected', async () => {
    const o = await run('narrate', fakeProvider({ text: JSON.stringify({ text: 'too short', choiceLabels: [] }) }))
    expect(o).toMatchObject({ ok: false, reason: 'invalid_output' })
  })

  it('refusal → rejected', async () => {
    expect(await run('narrate', fakeProvider({ fail: 'refusal' }))).toMatchObject({ ok: false, reason: 'refusal' })
  })

  it("professor's full name → filtered", async () => {
    const text = JSON.stringify({
      text: `${PROFESSOR_NAME_TOKENS[0]} is already writing on the board when you slide into row three, still smelling of the sète.`,
      choiceLabels: [],
    })
    expect(await run('narrate', fakeProvider({ text }))).toMatchObject({ ok: false, reason: 'filtered' })
  })

  it('real brand → filtered', async () => {
    const text = JSON.stringify({ text: 'You open TikTok instead of your notes while PM keeps writing on the board.', choiceLabels: [] })
    expect(await run('narrate', fakeProvider({ text }))).toMatchObject({ ok: false, reason: 'filtered' })
  })

  it('event: unknown templateId → filtered; valid → draft', async () => {
    const bad = JSON.stringify({
      title: 'The old asso friend',
      text: 'Your old Automatants friend calls with a wild startup idea and a suspiciously short deadline.',
      choices: [
        { label: 'Jump in', templateId: 'big_risk_tech' },
        { label: 'Say no', templateId: 'made_up' },
      ],
    })
    expect(await run('event', fakeProvider({ text: bad }))).toMatchObject({ ok: false, reason: 'filtered' })
    const good = bad.replace('made_up', 'safe_small_gain')
    const o = await run('event', fakeProvider({ text: good }))
    expect(o).toMatchObject({ ok: true, data: { title: 'The old asso friend', choices: [{ templateId: 'big_risk_tech' }, { templateId: 'safe_small_gain' }] } })
  })

  it('surprise: the name must come from the menu (which fixes the path); pitch cut to 2 sentences', async () => {
    const offer = {
      employerName: 'microsift',
      tagline: 'Spreadsheets, clouds and a paperclip that judges you.',
      templateId: 'offer_mission_driven',
      pitch: 'Your lab internship caught our eye. We pay in impact and free coffee. Also, there is a ping-pong table.',
    }
    const o = await run('surprise', fakeProvider({ text: JSON.stringify(offer) }))
    expect(o).toMatchObject({
      ok: true,
      data: { employerName: 'Microsift', pathId: 'bigtech', pitch: 'Your lab internship caught our eye. We pay in impact and free coffee.' },
    })
    const invented = await run('surprise', fakeProvider({ text: JSON.stringify({ ...offer, employerName: 'Quillfeather Labs' }) }))
    expect(invented).toMatchObject({ ok: false, reason: 'filtered' })
  })

  it('epitaph: exactly 2 tips from the allowed sources', async () => {
    const epi = {
      obituary: 'Inès lived to 84, collected air miles like stamps and still found time to call Noor every Sunday. They built models that scaled, and a life that mostly did too.',
      linkedinPost: 'Humbled and honoured to announce my death. 🙏\n\nLesson learned: sleep is a growth mindset.\n#Legacy #Grateful',
      tips: [
        { text: 'Swap one long-haul holiday for a train trip.', source: 'Impact CO2 (ADEME)' },
        { text: 'Protect your weeks: stay under 55 hours.', source: 'WHO/ILO (2021)' },
      ],
    }
    const o = await run('epitaph', fakeProvider({ text: JSON.stringify(epi) }))
    expect(o).toMatchObject({ ok: true })
    if (o.ok) expect((o.data as { linkedinPost: string }).linkedinPost).toContain('🙏')
    const badSource = { ...epi, tips: [epi.tips[0], { text: 'Trust me.', source: 'My uncle' }] }
    expect(await run('epitaph', fakeProvider({ text: JSON.stringify(badSource) }))).toMatchObject({ ok: false, reason: 'invalid_output' })
    const tooLong = { ...epi, obituary: 'word '.repeat(95) }
    expect(await run('epitaph', fakeProvider({ text: JSON.stringify(tooLong) }))).toMatchObject({ ok: false, reason: 'invalid_output' })
  })

  it('firstSentences', () => {
    expect(firstSentences('One. Two! Three?', 2)).toBe('One. Two!')
    expect(firstSentences('No terminator', 2)).toBe('No terminator')
  })
})

describe('HTTP handlers', () => {
  it('503 when no provider is configured', async () => {
    const h = createAiHandlers({ env: envFrom({}), log: vi.fn() })
    const res = await h.narrate(post('narrate', samples.narrate))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'missing ANTHROPIC_API_KEY (or GEMINI_API_KEY)' })
  })

  it('503 "missing ANTHROPIC_API_KEY" when Anthropic is forced without a key', async () => {
    const h = createAiHandlers({ env: envFrom({ RESPAWN_AI_PROVIDER: 'anthropic' }), log: vi.fn() })
    const res = await h.narrate(post('narrate', samples.narrate))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'missing ANTHROPIC_API_KEY' })
  })

  it('200 { data } on success and logs a cost line', async () => {
    const log = vi.fn()
    const env = envFrom({ ANTHROPIC_API_KEY: 'k' })
    const provider = fakeProvider({ text: NARRATION })
    const h = createAiHandlers({ env, guard: createGuard({ env }), provider: () => ({ ok: true, provider }), log })
    const res = await h.narrate(post('narrate', samples.narrate))
    expect(res.status).toBe(200)
    expect((await res.json()).data.text).toContain('PM')
    expect(log.mock.calls[0][0]).toMatch(/\[ai\] narrate anthropic\/claude-haiku-5-5 ok .* ~\$0\.\d+/)
  })

  it('400 on invalid input, 502 on rejected output, mapped status on provider errors', async () => {
    expect((await handlers(fakeProvider({ text: NARRATION })).narrate(post('narrate', { nope: 1 }))).status).toBe(400)
    const rejected = await handlers(fakeProvider({ fail: 'refusal' })).narrate(post('narrate', samples.narrate))
    expect(rejected.status).toBe(502)
    expect(await rejected.json()).toEqual({ error: 'model_output_rejected', reason: 'refusal' })
    const timeout = await handlers(fakeProvider({ throws: new ProviderError(504, 'upstream_timeout', 't') })).narrate(post('narrate', samples.narrate))
    expect(timeout.status).toBe(504)
    const limited = await handlers(fakeProvider({ throws: new ProviderError(503, 'upstream_rate_limited', 'r', '7') })).narrate(post('narrate', samples.narrate))
    expect(limited.status).toBe(503)
    expect(limited.headers.get('retry-after')).toBe('7')
  })

  it('405 on GET', async () => {
    const res = await handlers(fakeProvider({ text: NARRATION })).narrate(new Request('http://localhost/api/ai/narrate'))
    expect(res.status).toBe(405)
  })
})
