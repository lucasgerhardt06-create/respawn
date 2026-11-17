/**
 * choose(): applies a choice in the ENGINE_SEMANTICS order:
 * locked check → base effects (set, stats, flags, footprint, path, promotionChance, skipScenes, badges)
 * → pool extras (exchange trip, employer hire) → matching scene variants → chance roll → years jump.
 */
import type { Content } from '../content/schema'
import { VISIBLE_STATS } from '../content/schema'
import type { PendingX } from './clone'
import { cloneState, snapshot } from './clone'
import { getScene, getTemplate, indexContent } from './contentIndex'
import { currentChoices, resolveChoiceSource } from './dynamic'
import { evaluate } from './conditions'
import { addUnique, applyEffects, chanceP, hireOnPath, newCtx, rollChance, rollTemplate } from './effects'
import { applyFootprintEntry } from './footprint'
import { makeEnv } from './planet'
import { rand } from './rng'
import { makePending } from './scheduler'
import { arrowFor, statDiff } from './stats'
import { fillText } from './text'
import { advanceTo } from './time'
import type { Arrow, GameState, Outcome } from './types'
import type { VisibleStat } from '../content/schema'

export function exchangeTripLabel(city: string, byTrain: boolean | undefined): string {
  return byTrain ? `Exchange: return trip to ${city} by train` : `Exchange: return flight to ${city}`
}

/** Mutating choose on a draft. Throws on unknown or locked choices. */
export function chooseMut(content: Content, state: GameState, choiceId: string): Outcome {
  if (state.ended) throw new Error('[engine] The life has ended: no more choices')
  const p = state.pending as PendingX | undefined
  if (!p) throw new Error('[engine] No pending step: call resolveNext first')
  const ix = indexContent(content)
  if (p.aiSlotId && !p.aiDraft && !ix.scenes.has(p.sceneId))
    throw new Error(`[engine] AI slot "${p.aiSlotId}" is pending: call injectAiEvent first`)

  const choices = currentChoices(content, state)
  const view = choices.find((c) => c.id === choiceId)
  if (!view)
    throw new Error(
      `[engine] Unknown choice "${choiceId}" for "${p.sceneId}". Offered: ${choices.map((c) => c.id).join(', ') || '(none)'}`,
    )
  if (view.locked) throw new Error(`[engine] Choice "${choiceId}" is locked: ${view.lockedReason ?? 'not available'}`)

  const before = snapshot(state)
  const statsBefore = { ...state.stats }
  const startAge = state.age
  const sceneId = p.sceneId
  const scene = p.aiDraft ? undefined : getScene(content, sceneId)
  const kind = scene?.kind ?? 'event'
  const title = p.aiDraft ? p.aiDraft.title : fillText(content, state, scene!.title)
  const label = fillText(content, state, view.label)
  const alternatives = choices.filter((c) => !c.locked).map((c) => c.id)
  const ctx = newCtx(sceneId)
  const src = resolveChoiceSource(content, state, choiceId)

  let chance: 'success' | 'failure' | undefined
  let next: string | undefined

  if (src.kind === 'ai') {
    const t = getTemplate(content, src.templateId)
    const i = rollTemplate(content, state, t.outcomes, ctx)
    if (t.outcomes.length > 1) chance = i === 0 ? 'success' : 'failure'
  } else {
    if (src.kind === 'surprise') {
      hireOnPath(content, state, ctx, src.offer.pathId, undefined, src.offer.employerName)
    } else {
      const c = src.choice
      applyEffects(content, state, c.effects, ctx)
      if (src.kind === 'destination') {
        const d = src.choice
        state.exchange = { destinationId: d.id }
        const r = applyFootprintEntry(
          state,
          { label: exchangeTripLabel(d.city, d.byTrain), category: d.byTrain ? 'travel' : 'flights', oneOffT: d.tripT },
          sceneId,
          state.age,
        )
        ctx.tonnes += r.tonnes
      }
      if (src.kind === 'employer' && !ctx.pathSet) hireOnPath(content, state, ctx, src.choice.pathId, src.choice.id)
      next = c.next
    }

    // Matching scene variants (all apply), evaluated now, with this choice counted as recorded.
    // Match every variant against the same state first, so one variant's effects can't trigger another.
    if (scene?.variants) {
      const env = makeEnv(content, state, { current: { sceneId, choiceId } })
      const matched = scene.variants.filter((v) => v.effects && evaluate(v.conditions, env))
      for (const v of matched) applyEffects(content, state, v.effects!, ctx, 1)
    }

    if (src.kind === 'surprise') {
      const t = getTemplate(content, src.offer.templateId)
      const i = rollTemplate(content, state, t.outcomes, ctx)
      if (t.outcomes.length > 1) chance = i === 0 ? 'success' : 'failure'
    } else {
      const c = src.choice
      if (c.chance) chance = rollChance(content, state, c.chance, ctx)
      if (src.kind === 'sector') {
        const sector = src.choice
        const q = chanceP(state, sector.successP, sector.successModifiers)
        const ok = rand(state) < q
        applyEffects(content, state, ok ? sector.success : sector.failure, ctx, 3)
        const prev = state.startup?.sectorId === sector.id ? state.startup : undefined
        state.startup = { ...prev, sectorId: sector.id, outcome: ok ? 'success' : 'failure' }
        chance = ok ? 'success' : 'failure'
      }
    }
  }

  if (ctx.promoOverride !== undefined) state.promotionChance = ctx.promoOverride

  addUnique(state.done, sceneId)
  if (kind === 'event') state.fired.push({ id: sceneId, age: startAge })

  const years = ctx.years
  const promotions = years > 0 ? advanceTo(content, state, startAge + years, true) : 0

  const deltas = statDiff(statsBefore, state.stats)
  const arrows: Partial<Record<VisibleStat, Arrow>> = {}
  for (const k of VISIBLE_STATS) {
    const a = arrowFor(deltas[k] ?? 0)
    if (a !== 0) arrows[k] = a
  }
  const text = ctx.texts.slice().sort((a, b) => b.priority - a.priority)[0]?.text
  const factId = ctx.factIds
    .slice()
    .sort((a, b) => b.priority - a.priority)
    .find((f) => ix.facts.has(f.id))?.id

  state.history.push({
    sceneId,
    kind,
    choiceId,
    label,
    title,
    age: startAge,
    before,
    deltas,
    tonnes: ctx.tonnes,
    alternatives,
  })
  state.pending = undefined
  if (next) makePending(content, state, next)

  const outcome: Outcome = { deltas, arrows, tonnes: ctx.tonnes, years, promotions }
  if (text !== undefined) outcome.text = fillText(content, state, text)
  if (factId !== undefined) outcome.fact = ix.facts.get(factId)
  if (chance !== undefined) outcome.chance = chance
  return outcome
}

export function choose(
  content: Content,
  state: GameState,
  choiceId: string,
): { state: GameState; outcome: Outcome } {
  const draft = cloneState(state)
  const outcome = chooseMut(content, draft, choiceId)
  return { state: draft, outcome }
}
