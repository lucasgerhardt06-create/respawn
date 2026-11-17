/** Compact, human-readable context for the AI layer (never raw numbers for hidden stats). */
import { STAT_LABELS } from '../content/schema'
import type { Content } from '../content/schema'
import { evaluate } from './conditions'
import { indexContent } from './contentIndex'
import { makeEnv } from './planet'
import type { AIContext, GameState, Gender } from './types'

const MAX_MEMORIES = 14
const SKILL_WORDS: [string, string, string] = ['weak', 'decent', 'strong']
const RECENT = 6

function level(v: number, low: number, high: number, words: [string, string, string]): string {
  return v < low ? words[0] : v >= high ? words[2] : words[1]
}

export function pronounsFor(gender: Gender | undefined): AIContext['pronouns'] {
  if (gender === 'woman') return { subject: 'she', object: 'her', possessive: 'her' }
  if (gender === 'man') return { subject: 'he', object: 'him', possessive: 'his' }
  return { subject: 'they', object: 'them', possessive: 'their' }
}

export function buildAiContext(content: Content, state: GameState): AIContext {
  const ix = indexContent(content)
  const s = state.stats
  const pr = content.profiles
  const label = (list: { id: string; label: string }[], id: string) => list.find((o) => o.id === id)?.label ?? id
  const student = !state.path && state.pathHistory.length === 0 && state.age < 24

  const gauges: Record<string, number | string> = {
    money: Math.round(s.money),
    happiness: Math.round(s.happiness),
    social: Math.round(s.social),
    fame: Math.round(s.fame),
    contribution: Math.round(s.contribution),
    [STAT_LABELS.intellect]: level(s.intellect, 30, 60, SKILL_WORDS),
    [STAT_LABELS.skillAi]: level(s.skillAi, 30, 60, SKILL_WORDS),
    [STAT_LABELS.skillBusiness]: level(s.skillBusiness, 30, 60, SKILL_WORDS),
    [STAT_LABELS.skillSoft]: level(s.skillSoft, 30, 60, SKILL_WORDS),
    [STAT_LABELS.energy]: level(s.energy, 30, 70, ['low', 'ok', 'high']),
    [STAT_LABELS.network]: level(s.network, 30, 60, ['small', 'decent', 'wide']),
    [STAT_LABELS.ethics]: level(s.ethics, -15, 15, ['questionable', 'average', 'principled']),
    screenTime: `${Math.round(s.screenHours * 10) / 10} h/day`,
    workRhythm:
      s.workHours >= content.constants.yearly.grindHours ? 'grinding' : s.workHours <= 32 ? 'light' : 'normal',
  }
  if (student) gauges[STAT_LABELS.grades] = level(s.grades, 50, 72, ['weak', 'average', 'strong'])
  if (s.addiction >= 30) gauges[STAT_LABELS.addiction] = s.addiction >= 60 ? 'serious' : 'some vices'

  const ctx: AIContext = {
    name: state.player.name,
    ...(state.player.lastName ? { lastName: state.player.lastName } : {}),
    pronouns: pronounsFor(state.player.gender),
    age: Math.floor(state.age),
    phase: state.phase,
    profile: {
      origin: label(pr.origins, state.player.profile.originId),
      budget: label(pr.budgets, state.player.profile.budgetId),
      trait: label(pr.traits, state.player.profile.traitId),
    },
    gauges,
    memories: [],
    recentChoices: state.history
      .slice(-RECENT)
      .map((h) => `${Math.floor(h.age)} · ${h.title} → ${h.label}`),
    characters: content.characters
      .filter((c) => evaluate(c.knownIf, makeEnv(content, state)))
      .map((c) => ({ id: c.id, name: c.name, role: c.role })),
  }

  if (state.path) {
    const path = ix.paths.get(state.path.pathId)
    const employer =
      state.path.employerName ?? (state.path.employerId ? ix.employers.get(state.path.employerId)?.name : undefined)
    ctx.career = {
      path: path?.name ?? state.path.pathId,
      ...(employer !== undefined ? { employer } : {}),
      years: Math.floor(state.age - state.path.sinceAge),
      promotions: state.promotions,
    }
  }
  if (state.exchange) {
    const d = ix.destinations.get(state.exchange.destinationId)
    if (d) ctx.exchange = `${d.university}, ${d.city} (${d.country})`
  }
  if (state.startup) ctx.startup = { ...state.startup }

  const memories: string[] = []
  const fm = content.constants.flagMemories
  for (const f of state.flags) {
    const m = fm[f]
    if (m && !memories.includes(m)) memories.push(m)
  }
  for (const past of state.pathHistory.slice(-3)) {
    const name = past.employerName ?? ix.paths.get(past.pathId)?.name ?? past.pathId
    memories.push(`used to work at ${name} (from age ${Math.floor(past.sinceAge)})`)
  }
  ctx.memories = memories.slice(0, MAX_MEMORIES)
  return ctx
}
