/**
 * Browser AI client: POSTs to <AI_BASE_URL>/<task>. Implements the AIClient contract (types.ts):
 * every method resolves to null on timeout / error / invalid output and never throws.
 *
 * - Base URL: VITE_AI_BASE_URL (Pages build: https://<ref>.supabase.co/functions/v1/respawn-ai),
 *   default /api/ai (Vite dev server and Vercel).
 * - Timeouts: narration 3.5 s, event / surprise 6 s, startup 12 s, epitaph 25 s.
 * - Per-life cap (45 calls, the last 3 reserved for surprise / startup / epitaph), an in-memory
 *   cache keyed by task + scene + life (prefetch and the real call share one request), and an
 *   `x-respawn-life` header with a random id per life (reset by resetLife()).
 * - Payloads are clipped to the server's length caps so a long memory list never causes a 400.
 */
import type { AiTemplate } from '../content/schema'
import type {
  AIContext,
  AiEventDraft,
  ChoiceView,
  EndSummary,
  SceneView,
  SurpriseOfferDraft,
} from '../engine/types'
import type { AIClient, Epitaph, Narration, StartupMeta } from './types'

export type AiTask = 'narrate' | 'event' | 'surprise' | 'startup' | 'epitaph'

export const TIMEOUT_MS: Record<AiTask, number> = {
  narrate: 3500,
  event: 6000,
  surprise: 6000,
  startup: 12000,
  epitaph: 25000,
}
export const LIFE_CALL_CAP = 45
/** Calls kept for the finale tasks so narration never starves the epitaph. */
const FINALE_RESERVE = 3

function envBaseUrl(): string {
  const fromEnv = (import.meta as { env?: Record<string, unknown> }).env?.VITE_AI_BASE_URL
  const base = typeof fromEnv === 'string' && fromEnv.trim() ? fromEnv.trim() : '/api/ai'
  return base.replace(/\/+$/, '')
}

export const AI_BASE_URL = envBaseUrl()

// ---------------------------------------------------------------------------
// Payload clipping (mirrors server/ai/schemas.ts caps)
// ---------------------------------------------------------------------------

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + '…' : s)
const clipOpt = (s: string | undefined, max: number) => (s === undefined ? undefined : clip(s, max))

export function clipContext(ctx: AIContext): AIContext {
  const gauges: AIContext['gauges'] = {}
  for (const [k, v] of Object.entries(ctx.gauges).slice(0, 24)) {
    gauges[clip(k, 32)] = typeof v === 'number' ? Math.round(v) : clip(String(v), 48)
  }
  const p = ctx.pronouns ?? { subject: 'they', object: 'them', possessive: 'their' }
  return {
    name: clip(ctx.name, 40),
    lastName: clipOpt(ctx.lastName, 40),
    pronouns: { subject: clip(p.subject, 16), object: clip(p.object, 16), possessive: clip(p.possessive, 16) },
    age: Math.round(ctx.age),
    phase: ctx.phase,
    profile: { origin: clip(ctx.profile.origin, 80), budget: clip(ctx.profile.budget, 80), trait: clip(ctx.profile.trait, 80) },
    gauges,
    career: ctx.career
      ? {
          path: clip(ctx.career.path, 80),
          employer: clipOpt(ctx.career.employer, 80),
          years: Math.max(0, Math.round(ctx.career.years)),
          promotions: Math.max(0, Math.round(ctx.career.promotions)),
        }
      : undefined,
    exchange: clipOpt(ctx.exchange, 160),
    startup: ctx.startup
      ? {
          sectorId: clip(ctx.startup.sectorId, 64),
          name: clipOpt(ctx.startup.name, 80),
          product: clipOpt(ctx.startup.product, 200),
          pitch: clipOpt(ctx.startup.pitch, 400),
          investor: clipOpt(ctx.startup.investor, 80),
          rival: clipOpt(ctx.startup.rival, 80),
          outcome: ctx.startup.outcome,
        }
      : undefined,
    memories: ctx.memories.slice(-24).map((m) => clip(m, 200)),
    recentChoices: ctx.recentChoices.slice(-10).map((c) => clip(c, 200)),
    characters: ctx.characters.slice(0, 16).map((c) => ({ id: clip(c.id, 64), name: clip(c.name, 60), role: clip(c.role, 120) })),
  }
}

function clipChoice(c: ChoiceView): ChoiceView {
  return {
    id: c.id,
    label: clip(c.label, 140),
    hint: clipOpt(c.hint, 200),
    locked: c.locked,
    lockedReason: clipOpt(c.lockedReason, 160),
  }
}

export function clipScene(scene: SceneView): SceneView {
  return {
    ...scene,
    title: clip(scene.title, 120),
    text: clip(scene.text, 1400),
    speaker: clipOpt(scene.speaker, 64),
    art: clipOpt(scene.art, 64),
    tone: clipOpt(scene.tone, 120),
    hints: scene.hints?.slice(0, 8).map((h) => clip(h, 300)),
    choices: scene.choices.slice(0, 8).map(clipChoice),
  }
}

const templateRefs = (templates: AiTemplate[]) =>
  templates.slice(0, 12).map((t) => ({ id: t.id, description: clip(t.description, 240) }))

/** Only what the epitaph needs (server/ai/schemas.ts EpitaphSummarySchema). */
export function compactSummary(summary: EndSummary) {
  const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d
  return {
    name: clip(summary.name, 40),
    deathAge: Math.round(summary.deathAge),
    title: { title: clip(summary.title.title, 80), description: clip(summary.title.description, 300) },
    you: Object.fromEntries(Object.entries(summary.you).map(([k, v]) => [k, Math.round(v)])),
    earth: {
      temperatureC: round(summary.earth.temperatureC, 2),
      oceanM: round(summary.earth.oceanM, 2),
      scores: Object.fromEntries(Object.entries(summary.earth.scores).map(([k, v]) => [k, Math.round(v)])),
    },
    F: round(summary.F),
    lifetimeT: Math.round(summary.lifetimeT),
    frenchAverageLifetimeT: Math.round(summary.frenchAverageLifetimeT),
    receiptTop: summary.receipt
      .filter((l) => l.sceneId !== undefined)
      .sort((a, b) => b.t - a.t)
      .slice(0, 5)
      .map((l) => ({ label: clip(l.label, 140), t: round(l.t) })),
    topChoices: summary.topChoices
      .slice(0, 3)
      .map((c) => ({ title: clip(c.title, 120), chosenLabel: clip(c.chosenLabel, 140), age: Math.round(c.age) })),
    path: summary.path
      ? { pathName: clip(summary.path.pathName, 80), employerName: clipOpt(summary.path.employerName, 80) }
      : undefined,
    startup: summary.startup ? { name: clipOpt(summary.startup.name, 80), outcome: summary.startup.outcome } : undefined,
    badges: summary.badges.slice(0, 10).map((b) => clip(b.label, 80)),
  }
}

// ---------------------------------------------------------------------------
// Light response checks (the server already validated with Zod)
// ---------------------------------------------------------------------------

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'

function asNarration(v: unknown): Narration | null {
  if (!isObj(v) || !isStr(v.text)) return null
  const labels = isObj(v.choiceLabels) ? (v.choiceLabels as Record<string, unknown>) : undefined
  const choiceLabels: Record<string, string> = {}
  if (labels) for (const [k, l] of Object.entries(labels)) if (isStr(l)) choiceLabels[k] = l
  return Object.keys(choiceLabels).length ? { text: v.text, choiceLabels } : { text: v.text }
}

function asEvent(v: unknown): AiEventDraft | null {
  if (!isObj(v) || !isStr(v.title) || !isStr(v.text) || !Array.isArray(v.choices)) return null
  const choices = v.choices.filter((c): c is { label: string; templateId: string } => isObj(c) && isStr(c.label) && isStr(c.templateId))
  return choices.length >= 2 ? { title: v.title, text: v.text, choices } : null
}

function asSurprise(v: unknown): SurpriseOfferDraft | null {
  if (!isObj(v)) return null
  const { employerName, tagline, pathId, templateId, pitch } = v
  return isStr(employerName) && isStr(tagline) && isStr(pathId) && isStr(templateId) && isStr(pitch)
    ? { employerName, tagline, pathId, templateId, pitch }
    : null
}

function asStartup(v: unknown): StartupMeta | null {
  if (!isObj(v)) return null
  const { name, product, pitch, investor, rival } = v
  return isStr(name) && isStr(product) && isStr(pitch) && isStr(investor) && isStr(rival)
    ? { name, product, pitch, investor, rival }
    : null
}

function asEpitaph(v: unknown): Epitaph | null {
  if (!isObj(v) || !isStr(v.obituary) || !isStr(v.linkedinPost) || !Array.isArray(v.tips)) return null
  const tips = v.tips.filter((t): t is { text: string; source: string } => isObj(t) && isStr(t.text) && isStr(t.source))
  return tips.length ? { obituary: v.obituary, linkedinPost: v.linkedinPost, tips } : null
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface AIClientOptions {
  baseUrl?: string
  fetch?: typeof fetch
  timeouts?: Partial<Record<AiTask, number>>
  cap?: number
  newLifeId?: () => string
}

function randomLifeId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '')
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('')
}

export interface HttpAIClient extends AIClient {
  readonly lifeId: string
}

export function createAIClient(opts: AIClientOptions = {}): HttpAIClient {
  const baseUrl = (opts.baseUrl ?? AI_BASE_URL).replace(/\/+$/, '')
  const doFetch = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const timeouts = { ...TIMEOUT_MS, ...opts.timeouts }
  const cap = opts.cap ?? LIFE_CALL_CAP
  const newLifeId = opts.newLifeId ?? randomLifeId

  let lifeId = newLifeId()
  let calls = 0
  let cache = new Map<string, Promise<unknown>>()

  async function request(task: AiTask, body: unknown, life: string): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeouts[task])
    try {
      const res = await doFetch(`${baseUrl}/${task}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-respawn-life': life },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!res.ok) return null
      const payload: unknown = await res.json()
      return isObj(payload) ? (payload.data ?? null) : null
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  function call<T>(task: AiTask, key: string, body: () => unknown, check: (v: unknown) => T | null): Promise<T | null> {
    const cacheKey = `${task}:${key}`
    const hit = cache.get(cacheKey)
    if (hit) return hit as Promise<T | null>
    const limit = task === 'narrate' || task === 'event' ? cap - FINALE_RESERVE : cap
    if (calls >= limit) return Promise.resolve(null)
    calls += 1
    let payload: unknown
    try {
      payload = body()
    } catch {
      return Promise.resolve(null)
    }
    const p = request(task, payload, lifeId).then(check, () => null)
    cache.set(cacheKey, p)
    return p
  }

  return {
    get callsUsed() {
      return calls
    },
    get lifeId() {
      return lifeId
    },
    resetLife() {
      lifeId = newLifeId()
      calls = 0
      cache = new Map()
    },
    narrateScene(ctx, scene, previous) {
      if (!scene.narrate || scene.isAiEvent) return Promise.resolve(null)
      const key = `${scene.id}@${scene.age}:${previous?.choiceLabel ?? ''}`
      return call(
        'narrate',
        key,
        () => ({
          ctx: clipContext(ctx),
          scene: clipScene(scene),
          previous: previous
            ? {
                title: clip(previous.title, 120),
                choiceLabel: clip(previous.choiceLabel, 140),
                consequence: clipOpt(previous.consequence, 300),
              }
            : undefined,
        }),
        asNarration,
      )
    },
    generateEvent(ctx, templates) {
      if (templates.length < 2) return Promise.resolve(null)
      const key = `${ctx.age}:${templates.map((t) => t.id).join(',')}`
      return call('event', key, () => ({ ctx: clipContext(ctx), templates: templateRefs(templates) }), asEvent)
    },
    generateSurpriseOffer(ctx, employers, templates) {
      if (!employers.length || !templates.length) return Promise.resolve(null)
      return call(
        'surprise',
        `${ctx.age}`,
        () => ({
          ctx: clipContext(ctx),
          employers: employers
            .slice(0, 16)
            .map((e) => ({ name: clip(e.name, 40), pathId: e.pathId, pathName: clip(e.pathName, 80) })),
          templates: templateRefs(templates),
        }),
        asSurprise,
      )
    },
    generateStartup(ctx, sector) {
      return call(
        'startup',
        sector.id,
        () => ({ ctx: clipContext(ctx), sector: { id: sector.id, label: clip(sector.label, 120) } }),
        asStartup,
      )
    },
    generateEpitaph(ctx, summary) {
      return call(
        'epitaph',
        `${summary.title.id}@${summary.deathAge}`,
        () => ({ ctx: clipContext(ctx), summary: compactSummary(summary) }),
        asEpitaph,
      )
    },
  }
}

export const ai: AIClient = createAIClient()
