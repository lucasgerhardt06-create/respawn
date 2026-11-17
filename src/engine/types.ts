/**
 * RESPAWN engine contract — the public API every other layer codes against.
 *
 * The engine is pure TypeScript: no React, no network, no Math.random.
 * Every function takes (content, state, ...) and returns a NEW state (never mutates).
 * Randomness comes from the seeded RNG stored in the state, so a life is reproducible
 * from (seed + choices), which powers Respawn and the balancing simulator.
 */
import type {
  AiTemplate,
  Content,
  Ending,
  Fact,
  FOOTPRINT_CATEGORIES,
  NumericStat,
  Phase,
  VisibleStat,
} from '../content/schema'

export type FootprintCategory = (typeof FOOTPRINT_CATEGORIES)[number]
export type Stats = Record<NumericStat, number>

export interface AnnualModifier {
  id: string
  label: string
  category: FootprintCategory
  tPerYear: number
  fromAge: number
  /** Exclusive end age; undefined = until death. */
  toAge?: number
  /** Scene/choice that caused it (for the receipt and Respawn impact). */
  sourceSceneId?: string
}

export interface OneOff {
  label: string
  category: FootprintCategory
  t: number
  age: number
  sourceSceneId?: string
  factId?: string
}

export interface FootprintState {
  modifiers: AnnualModifier[]
  oneOffs: OneOff[]
  /** Accumulated life tonnes so far (baseline + modifiers + digital + one-offs). */
  lifeT: number
  /** Accumulated digital tonnes so far (subset of lifeT). */
  digitalT: number
  workT: number
  influenceTPerYear: number
  influenceT: number
  materialsKg: number
  deviceMultiplier: number
  genAiTPerYear: number
}

export type Gender = 'woman' | 'man' | 'nonbinary' | 'unspecified'

/** Entered at onboarding. Only `name` is required. */
export interface PlayerInfo {
  /** First name (personalises every narration). */
  name: string
  lastName?: string
  /** Drives pronouns in third-person texts (epitaph) and the life-expectancy base (INSEE). */
  gender?: Gender
}

export interface PathState {
  pathId: string
  employerId?: string
  /** Display name of the employer (may come from the AI surprise offer). */
  employerName?: string
  sinceAge: number
}

export interface StartupState {
  sectorId: string
  name?: string
  product?: string
  pitch?: string
  investor?: string
  rival?: string
  outcome?: 'success' | 'failure'
}

/** A generated event injected by the AI layer into an AI event slot. */
export interface AiEventDraft {
  title: string
  text: string
  choices: { label: string; templateId: string }[]
}

/** The AI surprise job offer (C11). The name comes from constants.surpriseEmployers; effects from an AiTemplate. */
export interface SurpriseOfferDraft {
  employerName: string
  tagline: string
  pathId: string
  templateId: string
  pitch: string
}

export interface Pending {
  sceneId: string
  /** Choices built at runtime (assos draw, destinations, offers, AI event). Frozen once built. */
  dynamicChoices?: ChoiceView[]
  /** For AI events: the draft and the slot. */
  aiSlotId?: string
  aiDraft?: AiEventDraft
  /** The validated AI surprise offer appended to a job-offers scene. */
  surpriseOffer?: SurpriseOfferDraft
}

export interface HistoryEntry {
  sceneId: string
  kind: 'major' | 'mini' | 'event'
  choiceId: string
  label: string
  /** The scene title at the time (for recaps and the AI context). */
  title: string
  age: number
  /** Full state right before this choice (history excluded) — used by Respawn. */
  before: Omit<GameState, 'history'>
  /** Actual stat changes caused by the choice (after diminishing returns). */
  deltas: Partial<Stats>
  /** Tonnes CO2e directly caused (one-offs + annual × planned duration). */
  tonnes: number
  /** Choice ids that were available (unlocked) — used to offer Respawn alternatives. */
  alternatives: string[]
}

export interface GameState {
  version: 1
  seed: number
  /** Current RNG state (mulberry32). */
  rng: number
  player: PlayerInfo & {
    profile: { originId: string; budgetId: string; traitId: string }
  }
  age: number
  phase: Phase
  stats: Stats
  flags: string[]
  path?: PathState
  pathHistory: PathState[]
  promotionChance: number
  promotions: number
  /** Fields banned by an AI job loss (no re-employment in the same field). */
  bannedFields: string[]
  footprint: FootprintState
  /** Scene ids done (majors, minis, events fired). */
  done: string[]
  /** Scene ids skipped (by effects or because time jumped past them). */
  skipped: string[]
  /** Events fired with the age they fired at (for cooldowns). */
  fired: { id: string; age: number }[]
  /** AI slot ids already resolved. */
  aiSlotsUsed: string[]
  exchange?: { destinationId: string }
  startup?: StartupState
  /** Cumulative grind years and screen hours (for end stats). */
  grindYears: number
  screenHoursTotal: number
  badges: string[]
  /** The step currently waiting for the player, if any. */
  pending?: Pending
  history: HistoryEntry[]
  ended: boolean
  deathAge?: number
}

// ---------------------------------------------------------------------------
// Views returned to the UI
// ---------------------------------------------------------------------------

export interface ChoiceView {
  id: string
  label: string
  hint?: string
  locked: boolean
  lockedReason?: string
}

export interface SceneView {
  id: string
  kind: 'major' | 'mini' | 'event'
  phase: Phase
  age: number
  /** 1..20 for majors (progress), undefined otherwise. */
  majorIndex?: number
  majorCount: number
  title: string
  /** Base text (variant-resolved, placeholders filled). AI narration replaces it in the UI. */
  text: string
  speaker?: string
  art?: string
  narrate: boolean
  tone?: string
  hints?: string[]
  choices: ChoiceView[]
  isFollowUp: boolean
  /** True for AI-generated events (text already final). */
  isAiEvent: boolean
}

export type Step =
  | { type: 'scene'; scene: SceneView }
  /**
   * An AI event slot is due. The UI asks the AI layer for a draft (using `templates`),
   * then calls injectAiEvent(content, state, slotId, draft | null). null → content fallback.
   */
  | { type: 'ai_slot'; slotId: string; age: number; templates: AiTemplate[] }
  | { type: 'end' }

export type Arrow = -3 | -2 | -1 | 0 | 1 | 2 | 3

export interface Outcome {
  /** Visible + hidden actual deltas. */
  deltas: Partial<Stats>
  /** Feedback arrows for visible gauges only (magnitude buckets). */
  arrows: Partial<Record<VisibleStat, Arrow>>
  /** Base consequence line (AI may rewrite). */
  text?: string
  fact?: Fact
  tonnes: number
  chance?: 'success' | 'failure'
  /** Years that passed as a direct result of the choice. */
  years: number
  /** Promotions that happened during the time jump. */
  promotions: number
}

export type YouPole = VisibleStat | 'footprint'
export type EarthPole = 'temperature' | 'ocean' | 'biodiversity' | 'livability' | 'tech' | 'ai'

export interface ReceiptLine {
  label: string
  category: FootprintCategory
  t: number
  /** Scene that caused it (undefined for the baseline line). */
  sceneId?: string
  factId?: string
}

export interface TopChoice {
  historyIndex: number
  sceneId: string
  title: string
  chosenLabel: string
  age: number
  impact: number
  /** Other options that were available at the time. */
  alternatives: { id: string; label: string }[]
}

export interface EndSummary {
  name: string
  player: PlayerInfo
  deathAge: number
  title: Ending
  you: Record<YouPole, number>
  earth: {
    scores: Record<EarthPole, number>
    temperatureC: number
    oceanM: number
    insectsPct: number
    heatBillions: number
    techIndex: number
    aiIndex: number
  }
  /** Average annual life footprint (t/yr). */
  F: number
  lifetimeT: number
  frenchAverageLifetimeT: number
  digitalShare: number
  screenYears: number
  workT: number
  influenceT: number
  materialsT: number
  receipt: ReceiptLine[]
  topChoices: TopChoice[]
  badges: { id: string; label: string; description: string }[]
  path?: { pathName: string; employerName?: string }
  startup?: StartupState
  stats: Stats
  flags: string[]
}

/** Compact, human-readable context for prompts (≈ 300–500 words max). */
export interface AIContext {
  name: string
  lastName?: string
  /** Pronouns for third-person text (epitaph, LinkedIn post). 'they' when unspecified. */
  pronouns: { subject: string; object: string; possessive: string }
  age: number
  phase: Phase
  profile: { origin: string; budget: string; trait: string }
  /** Rounded visible gauges + a few hidden ones in words ("energy: low"). */
  gauges: Record<string, number | string>
  career?: { path: string; employer?: string; years: number; promotions: number }
  exchange?: string
  startup?: StartupState
  /** Human-readable memories derived from flags ("skipped PM's 8AM class twice", "met someone at 3AM"). */
  memories: string[]
  /** Last 6 choices, one line each ("22 · After AIDAMS → PhD"). */
  recentChoices: string[]
  /** Characters currently part of the story (id, name, role). */
  characters: { id: string; name: string; role: string }[]
}

// ---------------------------------------------------------------------------
// Engine API (implemented in src/engine/index.ts)
// ---------------------------------------------------------------------------

export interface EngineAPI {
  createGame(content: Content, opts?: { seed?: number } & Partial<PlayerInfo>): GameState
  /** What is next. Pure: calling twice returns the same step. Advances time lazily via resolveNext. */
  getStep(content: Content, state: GameState): Step
  /**
   * Moves the state to the next step (time accrual, event rolls, building dynamic choices)
   * and stores it in `state.pending`. Call after createGame and after every choose().
   */
  resolveNext(content: Content, state: GameState): GameState
  choose(content: Content, state: GameState, choiceId: string): { state: GameState; outcome: Outcome }
  injectAiEvent(content: Content, state: GameState, slotId: string, draft: AiEventDraft | null): GameState
  /** Adds the AI surprise offer to the pending job-offers scene (validated). */
  injectSurpriseOffer(content: Content, state: GameState, offer: SurpriseOfferDraft | null): GameState
  /** Parody employer names the AI may pick for the surprise offer (eligible paths, not already offered). */
  surpriseMenu(content: Content, state: GameState): { name: string; pathId: string; pathName: string }[]
  setStartupMeta(state: GameState, meta: Partial<StartupState>): GameState
  summarize(content: Content, state: GameState): EndSummary
  /** Alternate life: same seed, alternative choice at historyIndex, later choices kept when possible. */
  respawnSimulate(
    content: Content,
    state: GameState,
    historyIndex: number,
    altChoiceId: string,
  ): { state: GameState; summary: EndSummary }
  /** State restored right before history[historyIndex], ready to replay live. */
  respawnFrom(content: Content, state: GameState, historyIndex: number): GameState
  buildAiContext(content: Content, state: GameState): AIContext
  /** Ambient planet cue during play (0 = 1.4 °C pace, 1 = ≥ 4 °C pace) from the footprint so far. */
  planetPace(content: Content, state: GameState): number
}
