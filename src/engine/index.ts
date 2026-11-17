/**
 * RESPAWN engine — pure, deterministic implementation of EngineAPI (see ./types.ts).
 * Every exported function returns a new state; inputs are never mutated.
 */
import type { Content } from '../content/schema'
import { injectAiEvent, injectSurpriseOffer, setStartupMeta, surpriseMenu } from './ai'
import { buildAiContext } from './aiContext'
import { choose } from './choose'
import { cloneState } from './clone'
import { createGame } from './create'
import { planetPace } from './planet'
import { respawnFrom, respawnSimulate } from './respawn'
import { resolveNextMut } from './scheduler'
import { summarize } from './summary'
import type { EngineAPI, GameState } from './types'
import { getStep } from './views'

export function resolveNext(content: Content, state: GameState): GameState {
  const draft = cloneState(state)
  resolveNextMut(content, draft)
  return draft
}

export {
  buildAiContext,
  choose,
  createGame,
  getStep,
  injectAiEvent,
  injectSurpriseOffer,
  planetPace,
  respawnFrom,
  respawnSimulate,
  setStartupMeta,
  summarize,
  surpriseMenu,
}

export const engine: EngineAPI = {
  createGame,
  getStep,
  resolveNext,
  choose,
  injectAiEvent,
  injectSurpriseOffer,
  surpriseMenu,
  setStartupMeta,
  summarize,
  respawnSimulate,
  respawnFrom,
  buildAiContext,
  planetPace,
}

// Helpers for tools and tests (not part of EngineAPI).
export { parseCondition, evaluate, walkCondition, ConditionError } from './conditions'
export type { CondNode, EndMetrics } from './conditions'
export { computeEarth, footprintScore, interpolate, lifespanFor, temperatureFor, makeEnv } from './planet'
export { diminish, arrowFor } from './stats'
export { fillText } from './text'
export { currentChoices } from './dynamic'
export { autoPlayMut, firstUnlocked } from './respawn'
export { chooseMut } from './choose'
export { resolveNextMut } from './scheduler'
export { injectAiEventMut } from './ai'
export { cloneState } from './clone'
export { impactOf } from './summary'
export type * from './types'
