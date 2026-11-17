/**
 * Fast simulated lives for the tools (mutating drafts through the engine internals).
 * AI slots always use the content fallback; no surprise offers.
 */
import type { Content } from '../../src/content/schema.ts'
import { VISIBLE_STATS } from '../../src/content/schema.ts'
import { chooseMut } from '../../src/engine/choose.ts'
import { cloneState } from '../../src/engine/clone.ts'
import { indexContent } from '../../src/engine/contentIndex.ts'
import { createGame } from '../../src/engine/create.ts'
import { currentChoices } from '../../src/engine/dynamic.ts'
import { injectAiEventMut } from '../../src/engine/ai.ts'
import { START_AGE, currentAnnualRate, footprintScore } from '../../src/engine/planet.ts'
import { hashString, mulberry32 } from '../../src/engine/rng.ts'
import { resolveNextMut } from '../../src/engine/scheduler.ts'
import type { ChoiceView, GameState, Outcome } from '../../src/engine/types.ts'

export const STRATEGIES = ['random', 'money', 'planet', 'happiness', 'fame', 'balanced'] as const
export type Strategy = (typeof STRATEGIES)[number]
export const STRATEGY_LABEL: Record<Strategy, string> = {
  random: 'random',
  money: 'money-greedy',
  planet: 'planet-greedy',
  happiness: 'happiness-greedy',
  fame: 'fame-greedy',
  balanced: 'balanced',
}

export interface Decision {
  sceneId: string
  kind: 'major' | 'mini' | 'event'
  unlocked: string[]
  picked: string
  /** Greedy strategies: every option scored the same (the pick says nothing about balance). */
  indifferent: boolean
}

const EXPECTED_DEATH = 83

/** Projected YOU poles after a choice (footprint from the current annual rate). */
function poles(content: Content, s: GameState): number[] {
  const remaining = Math.max(0, EXPECTED_DEATH - s.age)
  const F = (s.footprint.lifeT + currentAnnualRate(content, s) * remaining) / (EXPECTED_DEATH - START_AGE)
  return [...VISIBLE_STATS.map((k) => s.stats[k]), footprintScore(content, F)]
}

function score(content: Content, strategy: Strategy, before: GameState, after: GameState, o: Outcome): number {
  switch (strategy) {
    case 'money':
      return o.deltas.money ?? 0
    case 'happiness':
      return o.deltas.happiness ?? 0
    case 'fame':
      return o.deltas.fame ?? 0
    case 'planet':
      return -o.tonnes
    case 'balanced': {
      const p = poles(content, after)
      const b = poles(content, before)
      return Math.min(...p) + 0.01 * p.reduce((a, v, i) => a + v - b[i], 0)
    }
    case 'random':
      return 0
  }
}

/**
 * Greedy one-step lookahead with a perturbed RNG (the strategy does not see the real roll).
 * Ties are broken at random; `indifferent` means every option scored the same.
 */
function greedyPick(
  content: Content,
  strategy: Strategy,
  s: GameState,
  options: ChoiceView[],
  samples: number,
  tieBreak: () => number,
): { picked: string; indifferent: boolean } {
  const scores = options.map((c) => {
    let total = 0
    for (let k = 0; k < samples; k++) {
      const t = cloneState(s)
      t.rng = hashString(`${s.rng}:${k}:${c.id}`)
      const o = chooseMut(content, t, c.id)
      total += score(content, strategy, s, t, o)
    }
    return total / samples
  })
  const best = Math.max(...scores)
  const top = options.filter((_, i) => scores[i] >= best - 1e-6)
  const picked = top.length === 1 ? top[0].id : top[Math.floor(tieBreak() * top.length)].id
  return { picked, indifferent: top.length === options.length }
}

export interface LifeOptions {
  strategy?: Strategy
  /** Lookahead samples per option for greedy strategies. */
  samples?: number
  onDecision?: (d: Decision, state: GameState) => void
}

export function playLife(content: Content, seed: number, opts: LifeOptions = {}): GameState {
  const strategy = opts.strategy ?? 'random'
  const ix = indexContent(content)
  const s = cloneState(createGame(content, { seed }))
  let pickRng = hashString(`picker:${seed}:${strategy}`)
  for (let step = 0; step < 1000; step++) {
    resolveNextMut(content, s)
    if (s.ended) return s
    const p = s.pending!
    if (p.aiSlotId && !p.aiDraft && !ix.scenes.has(p.sceneId)) {
      injectAiEventMut(content, s, p.aiSlotId, null)
      continue
    }
    const options = currentChoices(content, s).filter((c) => !c.locked)
    if (options.length === 0) throw new Error(`scene "${p.sceneId}" has no unlocked choice (age ${s.age}, seed ${seed})`)
    const next = () => {
      const r = mulberry32(pickRng)
      pickRng = r.state
      return r.value
    }
    let picked: string
    let indifferent = true
    if (strategy === 'random' || options.length === 1) {
      picked = options[Math.floor(next() * options.length)].id
    } else {
      ;({ picked, indifferent } = greedyPick(content, strategy, s, options, opts.samples ?? 1, next))
    }
    if (opts.onDecision) {
      const scene = ix.scenes.get(p.sceneId)
      opts.onDecision(
        { sceneId: p.sceneId, kind: scene?.kind ?? 'event', unlocked: options.map((c) => c.id), picked, indifferent },
        s,
      )
    }
    chooseMut(content, s, picked)
  }
  throw new Error(`life did not end (seed ${seed})`)
}

export type DecisionCounts = Record<Decision['kind'] | 'total', number>

/** Every decision of a life (single-option ones included), split by scene kind. */
export function countDecisions(content: Content, seed: number, strategy: Strategy = 'random'): DecisionCounts {
  const c: DecisionCounts = { major: 0, mini: 0, event: 0, total: 0 }
  playLife(content, seed, {
    strategy,
    onDecision: (d) => {
      c[d.kind]++
      c.total++
    },
  })
  return c
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))
  return sorted[i]
}

export function meanOf(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN
}

/** Recursively finds non-finite numbers; returns their paths. */
export function findNonFinite(value: unknown, path = '', out: string[] = []): string[] {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(path || '(root)')
  } else if (Array.isArray(value)) value.forEach((v, i) => findNonFinite(v, `${path}[${i}]`, out))
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) findNonFinite(v, path ? `${path}.${k}` : k, out)
  return out
}
