/**
 * Condition language (see src/content/schema.ts):
 *   "skillAi >= 60"  "age > 30"  "promotions >= 1"  "yearsInPath >= 10"   numeric stats + age/promotions/yearsInPath
 *   "temperature >= 2.5"  "footprintScore > 70"  "lifespan > 90"  "F < 5"   end metrics (projected during play)
 *   "path == finance"  "employer != panoptis"  "phase == career"
 *   "profile.budget == tight"  "profile.origin == intl"  "profile.trait == math"
 *   "flag:TECH"  "!flag:SHALLOW"  "chose:c03_asso=asso_utopia"  "!chose:c10_after=phd"  "chose:c13_family"
 *   "true"  "false"
 *   { all: [...] } (empty = true)  { any: [...] } (empty = false)  { not: ... }
 * `path`/`employer` compare against "none" when there is no current job.
 */
import { NUMERIC_STATS, PHASES } from '../content/schema'
import type { Cond, Content, NumericStat } from '../content/schema'
import type { GameState } from './types'

export type CmpOp = '>=' | '<=' | '>' | '<' | '==' | '!='

export const STATE_NUMERIC_KEYS = ['age', 'promotions', 'yearsInPath'] as const
export const END_METRIC_KEYS = ['footprintScore', 'temperature', 'lifespan', 'F'] as const
export const CATEGORICAL_KEYS = [
  'path',
  'employer',
  'phase',
  'profile.budget',
  'profile.origin',
  'profile.trait',
] as const

export type StateNumericKey = (typeof STATE_NUMERIC_KEYS)[number]
export type EndMetricKey = (typeof END_METRIC_KEYS)[number]
export type CategoricalKey = (typeof CATEGORICAL_KEYS)[number]
export type NumericKey = NumericStat | StateNumericKey | EndMetricKey
export type EndMetrics = Record<EndMetricKey, number>

export type CondNode =
  | { t: 'const'; value: boolean }
  | { t: 'num'; key: NumericKey; op: CmpOp; value: number }
  | { t: 'cat'; key: CategoricalKey; op: '==' | '!='; value: string }
  | { t: 'flag'; name: string; neg: boolean }
  | { t: 'chose'; sceneId: string; choiceId?: string; neg: boolean }
  | { t: 'all'; items: CondNode[] }
  | { t: 'any'; items: CondNode[] }
  | { t: 'not'; item: CondNode }

export class ConditionError extends Error {
  constructor(source: unknown, reason: string) {
    super(`Invalid condition ${JSON.stringify(source)}: ${reason}`)
    this.name = 'ConditionError'
  }
}

const NUMERIC_KEY_SET = new Set<string>([...NUMERIC_STATS, ...STATE_NUMERIC_KEYS, ...END_METRIC_KEYS])
const CATEGORICAL_KEY_SET = new Set<string>(CATEGORICAL_KEYS)
const END_METRIC_SET = new Set<string>(END_METRIC_KEYS)
const ID_RE = /^[A-Za-z0-9_.-]+$/
const CMP_RE = /^([A-Za-z_][A-Za-z0-9_.]*)\s*(>=|<=|==|!=|>|<)\s*(\S+)$/
const PHASE_VALUES = new Set<string>(PHASES)

const stringCache = new Map<string, CondNode>()
const objectCache = new WeakMap<object, CondNode>()

function parseString(src: string): CondNode {
  const cached = stringCache.get(src)
  if (cached) return cached
  const node = parseStringUncached(src)
  stringCache.set(src, node)
  return node
}

function parseStringUncached(src: string): CondNode {
  const s = src.trim()
  if (s === '') throw new ConditionError(src, 'empty condition')
  if (s === 'true') return { t: 'const', value: true }
  if (s === 'false') return { t: 'const', value: false }

  let neg = false
  let body = s
  if (body.startsWith('!')) {
    const rest = body.slice(1).trimStart()
    if (rest.startsWith('flag:') || rest.startsWith('chose:')) {
      neg = true
      body = rest
    } else {
      throw new ConditionError(src, `"!" only negates "flag:" or "chose:" (use { "not": ... } otherwise)`)
    }
  }
  if (body.startsWith('flag:')) {
    const name = body.slice(5).trim()
    if (!ID_RE.test(name)) throw new ConditionError(src, `bad flag name "${name}"`)
    return { t: 'flag', name, neg }
  }
  if (body.startsWith('chose:')) {
    const rest = body.slice(6).trim()
    const [sceneId, choiceId, extra] = rest.split('=').map((x) => x.trim())
    if (extra !== undefined) throw new ConditionError(src, 'expected "chose:<sceneId>=<choiceId>"')
    if (!sceneId || !ID_RE.test(sceneId)) throw new ConditionError(src, `bad scene id "${sceneId ?? ''}"`)
    if (choiceId !== undefined && !ID_RE.test(choiceId)) throw new ConditionError(src, `bad choice id "${choiceId}"`)
    return choiceId === undefined ? { t: 'chose', sceneId, neg } : { t: 'chose', sceneId, choiceId, neg }
  }

  const m = CMP_RE.exec(s)
  if (!m) {
    if (/^[A-Za-z_][A-Za-z0-9_.]*\s*=\s*[^=]/.test(s)) throw new ConditionError(src, 'use "==" for equality')
    throw new ConditionError(src, 'expected "<key> <op> <value>", "flag:X", "!flag:X" or "chose:scene=choice"')
  }
  const key = m[1]
  const op = m[2] as CmpOp
  const raw = m[3]
  if (NUMERIC_KEY_SET.has(key)) {
    const value = Number(raw)
    if (!Number.isFinite(value)) throw new ConditionError(src, `"${key}" needs a number, got "${raw}"`)
    return { t: 'num', key: key as NumericKey, op, value }
  }
  if (CATEGORICAL_KEY_SET.has(key)) {
    if (op !== '==' && op !== '!=') throw new ConditionError(src, `"${key}" only supports == and !=`)
    if (!ID_RE.test(raw)) throw new ConditionError(src, `bad value "${raw}"`)
    if (key === 'phase' && !PHASE_VALUES.has(raw)) throw new ConditionError(src, `unknown phase "${raw}"`)
    return { t: 'cat', key: key as CategoricalKey, op, value: raw }
  }
  throw new ConditionError(src, `unknown key "${key}"`)
}

/** Parses (and caches) a condition. Throws ConditionError with a clear message. */
export function parseCondition(cond: Cond): CondNode {
  if (typeof cond === 'string') return parseString(cond)
  if (cond === null || typeof cond !== 'object' || Array.isArray(cond))
    throw new ConditionError(cond, 'expected a string or { all | any | not }')
  const cached = objectCache.get(cond)
  if (cached) return cached
  const keys = Object.keys(cond)
  if (keys.length !== 1) throw new ConditionError(cond, 'object form needs exactly one of all / any / not')
  let node: CondNode
  if ('all' in cond) {
    if (!Array.isArray(cond.all)) throw new ConditionError(cond, '"all" needs an array')
    node = { t: 'all', items: cond.all.map(parseCondition) }
  } else if ('any' in cond) {
    if (!Array.isArray(cond.any)) throw new ConditionError(cond, '"any" needs an array')
    node = { t: 'any', items: cond.any.map(parseCondition) }
  } else if ('not' in cond) {
    node = { t: 'not', item: parseCondition(cond.not) }
  } else {
    throw new ConditionError(cond, `unknown operator "${keys[0]}"`)
  }
  objectCache.set(cond, node)
  return node
}

/** Visits every leaf of a parsed condition (for check-data). */
export function walkCondition(node: CondNode, visit: (leaf: CondNode) => void): void {
  switch (node.t) {
    case 'all':
    case 'any':
      for (const it of node.items) walkCondition(it, visit)
      return
    case 'not':
      walkCondition(node.item, visit)
      return
    default:
      visit(node)
  }
}

export function usesEndMetrics(node: CondNode): boolean {
  let found = false
  walkCondition(node, (leaf) => {
    if (leaf.t === 'num' && END_METRIC_SET.has(leaf.key)) found = true
  })
  return found
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface EvalEnv {
  content: Content
  state: GameState
  /** End metrics (summary). When absent they are projected from the state lazily. */
  metrics?: Partial<EndMetrics>
  /** The choice being applied right now (so `chose:` sees it inside variants). */
  current?: { sceneId: string; choiceId: string }
  /** Lazy projector for end metrics during play (injected to avoid import cycles). */
  project?: () => EndMetrics
}

function numericValue(node: Extract<CondNode, { t: 'num' }>, env: EvalEnv): number {
  const { state } = env
  switch (node.key) {
    case 'age':
      return state.age
    case 'promotions':
      return state.promotions
    case 'yearsInPath':
      return state.path ? state.age - state.path.sinceAge : 0
    case 'footprintScore':
    case 'temperature':
    case 'lifespan':
    case 'F': {
      const fromMetrics = env.metrics?.[node.key]
      if (fromMetrics !== undefined) return fromMetrics
      if (env.project) {
        const projected = env.project()
        env.metrics = { ...projected, ...env.metrics }
        return projected[node.key]
      }
      return Number.NaN
    }
    default:
      return state.stats[node.key]
  }
}

function categoricalValue(key: CategoricalKey, env: EvalEnv): string {
  const { state } = env
  switch (key) {
    case 'path':
      return state.path?.pathId ?? 'none'
    case 'employer':
      return state.path?.employerId ?? 'none'
    case 'phase':
      return state.phase
    case 'profile.budget':
      return state.player.profile.budgetId
    case 'profile.origin':
      return state.player.profile.originId
    case 'profile.trait':
      return state.player.profile.traitId
  }
}

function compare(a: number, op: CmpOp, b: number): boolean {
  switch (op) {
    case '>=':
      return a >= b
    case '<=':
      return a <= b
    case '>':
      return a > b
    case '<':
      return a < b
    case '==':
      return Math.abs(a - b) < 1e-9
    case '!=':
      return Math.abs(a - b) >= 1e-9
  }
}

export function evalNode(node: CondNode, env: EvalEnv): boolean {
  switch (node.t) {
    case 'const':
      return node.value
    case 'num':
      return compare(numericValue(node, env), node.op, node.value)
    case 'cat': {
      const v = categoricalValue(node.key, env)
      return node.op === '==' ? v === node.value : v !== node.value
    }
    case 'flag': {
      const has = env.state.flags.includes(node.name)
      return node.neg ? !has : has
    }
    case 'chose': {
      const matches = (sceneId: string, choiceId: string) =>
        sceneId === node.sceneId && (node.choiceId === undefined || choiceId === node.choiceId)
      let has = env.state.history.some((h) => matches(h.sceneId, h.choiceId))
      if (!has && env.current) has = matches(env.current.sceneId, env.current.choiceId)
      return node.neg ? !has : has
    }
    case 'all':
      return node.items.every((it) => evalNode(it, env))
    case 'any':
      return node.items.some((it) => evalNode(it, env))
    case 'not':
      return !evalNode(node.item, env)
  }
}

/** Evaluates a condition (undefined = always true). */
export function evaluate(cond: Cond | undefined, env: EvalEnv): boolean {
  if (cond === undefined) return true
  return evalNode(parseCondition(cond), env)
}
