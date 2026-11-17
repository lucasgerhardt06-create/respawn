/**
 * The five AI tasks as Web-standard handlers `(req: Request) => Promise<Response>`.
 *
 * Pipeline: provider configured? → guard (rate limit, life cap, body cap, strict Zod input) →
 * prompt → provider.generateJson (structured JSON) → JSON.parse → Zod output → post-filter →
 * 200 { data } | 502 { error: 'model_output_rejected', reason } | mapped upstream error.
 *
 * "AI narrates, the engine decides": outputs are text plus ids picked from menus the engine
 * provided (template ids, path ids, choice ids), all checked here.
 */
import type { z } from 'zod'
import type { AiEventDraft, SurpriseOfferDraft } from '../../src/engine/types.js'
import type { Epitaph, Narration, StartupMeta } from '../../src/ai/types.js'
import { getEnv, type EnvReader } from '../env.js'
import { errorJson, json } from '../http.js'
import { acceptText, professorTokensIn, type FilterOptions } from './filter.js'
import { createGuard, type Guard } from './guard.js'
import { toJsonSchema, type JsonSchema } from './jsonSchema.js'
import { formatUsd, tierOf, type Task } from './models.js'
import {
  epitaphUser,
  eventUser,
  narrateUser,
  startupUser,
  surpriseUser,
  systemFor,
} from './prompts.js'
import { resolveProvider, type ProviderResolution } from './providers/index.js'
import {
  ProviderError,
  type AiProvider,
  type FailureReason,
  type GenerateMeta,
} from './providers/types.js'
import {
  EpitaphInput,
  EpitaphOutput,
  EventInput,
  EventOutput,
  LABEL_MAX,
  NarrateInput,
  NarrationOutput,
  StartupInput,
  StartupOutput,
  SurpriseInput,
  SurpriseOutput,
  TITLE_MAX,
} from './schemas.js'

// ---------------------------------------------------------------------------
// Task definitions
// ---------------------------------------------------------------------------

interface TaskDef<I, O, R> {
  input: z.ZodType<I>
  output: z.ZodType<O>
  user(input: I): string
  /** Membership checks + post-filter. null = drop the answer (game keeps its base text). */
  finalize(input: I, out: O, filter: FilterOptions): R | null
}

function capped(s: string | null, max: number): string | null {
  return s && s.length <= max ? s : null
}

/** Keep at most `n` sentences (the surprise pitch is "at most 2 sentences"). */
export function firstSentences(s: string, n: number): string {
  const parts = s.match(/[^.!?]+[.!?]+["”’)]*\s*|[^.!?]+$/g)
  return parts ? parts.slice(0, n).join('').trim() : s
}

const narrate: TaskDef<NarrateInput, z.infer<typeof NarrationOutput>, Narration> = {
  input: NarrateInput,
  output: NarrationOutput,
  user: narrateUser,
  finalize(input, out, filter) {
    const text = acceptText(out.text, { ...filter, checkNumbers: true })
    if (!text) return null
    const ids = new Set(input.scene.choices.map((c) => c.id))
    const labels: Record<string, string> = {}
    for (const { id, label } of out.choiceLabels) {
      if (!ids.has(id) || labels[id]) continue
      const clean = capped(acceptText(label, { ...filter, checkNumbers: true }), LABEL_MAX)
      if (clean) labels[id] = clean
    }
    return Object.keys(labels).length ? { text, choiceLabels: labels } : { text }
  },
}

const event: TaskDef<EventInput, z.infer<typeof EventOutput>, AiEventDraft> = {
  input: EventInput,
  output: EventOutput,
  user: eventUser,
  finalize(input, out, filter) {
    const opts = { ...filter, checkNumbers: true }
    const title = capped(acceptText(out.title, opts), TITLE_MAX)
    const text = acceptText(out.text, opts)
    if (!title || !text) return null
    const ids = new Set(input.templates.map((t) => t.id))
    const choices: AiEventDraft['choices'] = []
    for (const c of out.choices) {
      const label = capped(acceptText(c.label, opts), LABEL_MAX)
      if (!label || !ids.has(c.templateId)) return null
      choices.push({ label, templateId: c.templateId })
    }
    return choices.length >= 2 && choices.length <= 3 ? { title, text, choices } : null
  },
}

const surprise: TaskDef<SurpriseInput, z.infer<typeof SurpriseOutput>, SurpriseOfferDraft> = {
  input: SurpriseInput,
  output: SurpriseOutput,
  user: surpriseUser,
  finalize(input, out, filter) {
    // Like templateId: the name must come from the menu (never invented); the menu also fixes the path.
    const name = out.employerName.trim().toLowerCase()
    const item = input.employers.find((e) => e.name.toLowerCase() === name)
    if (!item) return null
    if (!input.templates.some((t) => t.id === out.templateId)) return null
    const tagline = capped(acceptText(out.tagline, filter), 90)
    const pitchRaw = acceptText(out.pitch, filter)
    if (!tagline || !pitchRaw) return null
    return { employerName: item.name, tagline, pathId: item.pathId, templateId: out.templateId, pitch: firstSentences(pitchRaw, 2) }
  },
}

const startup: TaskDef<StartupInput, z.infer<typeof StartupOutput>, StartupMeta> = {
  input: StartupInput,
  output: StartupOutput,
  user: startupUser,
  finalize(_input, out, filter) {
    const name = capped(acceptText(out.name, filter), 32)
    const product = capped(acceptText(out.product, filter), 140)
    const pitch = capped(acceptText(out.pitch, filter), 300)
    const investor = capped(acceptText(out.investor, filter), 60)
    const rival = capped(acceptText(out.rival, filter), 40)
    if (!name || !product || !pitch || !investor || !rival) return null
    return { name, product, pitch, investor, rival }
  },
}

const epitaph: TaskDef<EpitaphInput, z.infer<typeof EpitaphOutput>, Epitaph> = {
  input: EpitaphInput,
  output: EpitaphOutput,
  user: epitaphUser,
  finalize(_input, out, filter) {
    const obituary = acceptText(out.obituary, filter)
    const linkedinPost = acceptText(out.linkedinPost, { ...filter, allowEmoji: true, multiline: true })
    if (!obituary || !linkedinPost) return null
    const tips: Epitaph['tips'] = []
    for (const t of out.tips) {
      const text = capped(acceptText(t.text, filter), 240)
      if (!text) return null
      tips.push({ text, source: t.source })
    }
    return { obituary, linkedinPost, tips }
  },
}

// Kept loose on purpose: each entry is fully typed above.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTaskDef = TaskDef<any, any, unknown>

export const TASK_DEFS: Record<Task, AnyTaskDef> = { narrate, event, surprise, startup, epitaph }

/** JSON schemas are built once so their bytes are stable (schema compilation is cached upstream). */
const SCHEMAS: Record<Task, JsonSchema> = {
  narrate: toJsonSchema(NarrationOutput),
  event: toJsonSchema(EventOutput),
  surprise: toJsonSchema(SurpriseOutput),
  startup: toJsonSchema(StartupOutput),
  epitaph: toJsonSchema(EpitaphOutput),
}

export function schemaFor(task: Task): JsonSchema {
  return SCHEMAS[task]
}

// ---------------------------------------------------------------------------
// runTask (used by the HTTP handlers and tools/ai-smoke.ts)
// ---------------------------------------------------------------------------

export type TaskOutcome =
  | ({ ok: true; data: unknown } & GenerateMeta)
  | ({ ok: false; reason: FailureReason } & GenerateMeta)

/** `input` must already be validated with TASK_DEFS[task].input. */
export async function runTask(task: Task, input: unknown, provider: AiProvider, signal?: AbortSignal): Promise<TaskOutcome> {
  const def = TASK_DEFS[task]
  const user = def.user(input)
  const res = await provider.generateJson({
    task,
    tier: tierOf(task),
    system: systemFor(task),
    user,
    schema: SCHEMAS[task],
    signal,
  })
  if (!res.ok) return res
  const { text, ...meta } = res
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ...meta, ok: false, reason: 'invalid_json' }
  }
  const parsed = def.output.safeParse(raw)
  if (!parsed.success) return { ...meta, ok: false, reason: 'invalid_output' }
  const ctx = (input as { ctx?: { name?: string; lastName?: string; characters?: { name: string }[] } }).ctx
  const names = [ctx?.name ?? '', ctx?.lastName ?? '', ...(ctx?.characters ?? []).map((c) => c.name)]
  // Brand exceptions never come from request text (the player controls it): content has no brands, so none are allowed.
  const data = def.finalize(input, parsed.data, { allowBrands: new Set<string>(), allowNameTokens: professorTokensIn(names) })
  if (data === null) return { ...meta, ok: false, reason: 'filtered' }
  return { ...meta, ok: true, data }
}

// ---------------------------------------------------------------------------
// Spend log
// ---------------------------------------------------------------------------

const totals = { calls: 0, usd: 0 }

export function costLine(task: Task, o: TaskOutcome): string {
  totals.calls += 1
  totals.usd += o.costUsd
  const u = o.usage
  const status = o.ok ? 'ok' : `rejected:${o.reason}`
  return (
    `[ai] ${task} ${o.provider}/${o.model} ${status} ${o.ms}ms ` +
    `in=${u.inputTokens} cache_r=${u.cacheReadTokens} cache_w=${u.cacheWriteTokens} out=${u.outputTokens} ` +
    `~${formatUsd(o.costUsd)} stop=${o.stop} | instance total ${formatUsd(totals.usd)} over ${totals.calls} calls`
  )
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

export interface HandlerDeps {
  env: EnvReader
  guard: Guard
  provider: (env: EnvReader) => ProviderResolution
  log: (line: string) => void
}

export type Handler = (req: Request) => Promise<Response>

export function createAiHandlers(deps: Partial<HandlerDeps> = {}): Record<Task, Handler> {
  const env = deps.env ?? getEnv
  const guard = deps.guard ?? createGuard({ env })
  const pickProvider = deps.provider ?? resolveProvider
  const log = deps.log ?? ((line: string) => console.log(line))

  const make = (task: Task): Handler => async (req) => {
    if (req.method !== 'POST') return errorJson(405, 'use POST')
    const resolved = pickProvider(env)
    if (!resolved.ok) return errorJson(503, resolved.error)

    const checked = await guard.check(req, TASK_DEFS[task].input)
    if (!checked.ok) return errorJson(checked.status, checked.error, {}, checked.headers)

    let outcome: TaskOutcome
    try {
      outcome = await runTask(task, checked.data, resolved.provider, req.signal)
    } catch (err) {
      const e = err instanceof ProviderError ? err : new ProviderError(500, 'internal_error', String(err))
      log(`[ai] ${task} ${resolved.provider.name} error ${e.status} ${e.code}: ${e.message}`)
      return errorJson(e.status, e.code, {}, e.retryAfter ? { 'retry-after': e.retryAfter } : {})
    }
    log(costLine(task, outcome))
    if (!outcome.ok) return errorJson(502, 'model_output_rejected', { reason: outcome.reason })
    return json({ data: outcome.data })
  }

  return {
    narrate: make('narrate'),
    event: make('event'),
    surprise: make('surprise'),
    startup: make('startup'),
    epitaph: make('epitaph'),
  }
}
