/**
 * Orchestration store: glues the pure engine, the content bundle and the AI client for the UI.
 * "AI narrates, the engine decides": every AI call is optional and every await is guarded
 * against the player having moved on in the meantime.
 */
import { create } from 'zustand'
import type { Epitaph, Narration, StartupMeta } from '../ai/types'
import type { EndSummary, GameState, Outcome, PlayerInfo, SceneView, Step } from '../engine/types'
import { ai, content, engine, modulesReady } from './modules'
import { clearSave, loadSave, writeSave } from './persist'

export type Screen = 'title' | 'newlife' | 'play' | 'end'

export interface NarrationEntry {
  status: 'pending' | 'ready' | 'failed'
  narration?: Narration
}

export interface Beat {
  id: number
  sceneTitle: string
  sceneKind: SceneView['kind']
  choiceLabel: string
  outcome: Outcome
  ageFrom: number
  ageTo: number
  promotions: number
  /** Stat that drove the chance roll (skill check), when known. */
  checkStat?: string
  /** Whether the player was in student years (grades chips only then). */
  student: boolean
}

export interface StartupCard {
  sectorId: string
  sectorLabel: string
  outcome?: 'success' | 'failure'
  status: 'loading' | 'ready' | 'failed'
  meta?: StartupMeta
  /** Shown once after the beat closes. */
  seen: boolean
}

export interface RespawnResult {
  historyIndex: number
  altChoiceId: string
  altLabel: string
  summary: EndSummary
}

export interface Previous {
  title: string
  choiceLabel: string
  consequence?: string
}

interface Store {
  ready: boolean
  screen: Screen
  game: GameState | null
  step: Step | null
  /** Unique key of the current step (narration cache key). */
  stepKey: string
  narrations: Record<string, NarrationEntry>
  surprise: { sceneId: string; status: 'loading' | 'done' | 'failed' } | null
  beat: Beat | null
  startup: StartupCard | null
  summary: EndSummary | null
  epitaph: { status: 'idle' | 'loading' | 'ready' | 'failed'; data?: Epitaph }
  respawn: RespawnResult | null
  hasSave: boolean
  error: string | null

  /** Open character creation (no life yet). */
  openNewLife(): void
  newLife(info?: Partial<PlayerInfo>): void
  beginLife(): void
  choose(choiceId: string, shownLabel?: string): void
  dismissBeat(): void
  dismissStartup(): void
  finishLife(): void
  abandon(): void
  resume(): void
  goTitle(): void
  simulateRespawn(historyIndex: number, altChoiceId: string, altLabel: string): void
  clearRespawn(): void
  replayFrom(historyIndex: number): void
}

let beatSeq = 0

export function stepKeyOf(game: GameState, step: Step): string {
  if (step.type === 'scene') return `${step.scene.id}@${step.scene.age}#${game.history.length}`
  if (step.type === 'ai_slot') return `slot:${step.slotId}#${game.history.length}`
  return `end#${game.history.length}`
}

function sceneDef(id: string) {
  return content?.scenes.find((s) => s.id === id)
}

/** The stat behind a choice's chance roll, if the content says so. */
function checkStatOf(sceneId: string, choiceId: string): string | undefined {
  if (!content) return undefined
  const def = sceneDef(sceneId)
  const c = def?.choices.find((x) => x.id === choiceId)
  if (c?.chance?.modifiers?.length) return c.chance.modifiers[0].stat
  const sector = content.startupSectors.find((x) => x.id === choiceId)
  if (sector?.successModifiers?.length) return sector.successModifiers[0].stat
  return undefined
}

function wantsSurprise(sceneId: string): boolean {
  const def = sceneDef(sceneId)
  if (def?.dynamic?.type === 'jobOffers') return def.dynamic.aiSurprise
  return sceneId.startsWith('c11_')
}

export const useGame = create<Store>((set, get) => {
  /** Move to the step stored in `game.pending` and start whatever AI work it needs. */
  const enterStep = (game: GameState, previous?: Previous) => {
    if (!engine || !content) return
    const step = engine.getStep(content, game)
    const key = stepKeyOf(game, step)
    set({ game, step, stepKey: key })

    if (step.type === 'scene') {
      const scene = step.scene
      // Minis are 1-tap beats: instant base text keeps the pace (and the budget).
      if (scene.narrate && !scene.isAiEvent && scene.kind !== 'mini') requestNarration(game, key, scene, previous)
      if (wantsSurprise(scene.id) && !scene.choices.some((c) => c.id === 'ai_surprise')) requestSurprise(game, scene.id)
    } else if (step.type === 'ai_slot') {
      const slotKey = key
      const ctx = engine.buildAiContext(content, game)
      void ai
        .generateEvent(ctx, step.templates)
        .catch(() => null)
        .then((draft) => {
          const s = get()
          if (s.stepKey !== slotKey || !s.game || !engine || !content) return
          let g: GameState
          try {
            g = engine.injectAiEvent(content, s.game, step.slotId, draft)
          } catch {
            g = engine.injectAiEvent(content, s.game, step.slotId, null)
          }
          enterStep(g, previous)
        })
    } else if (step.type === 'end') {
      // Wait for the consequence beat to close before switching screens.
      if (!get().beat) get().finishLife()
    }
  }

  const requestNarration = (game: GameState, key: string, scene: SceneView, previous?: Previous) => {
    if (!engine || !content || get().narrations[key]) return
    const keep = Object.fromEntries(Object.entries(get().narrations).slice(-3))
    set({ narrations: { ...keep, [key]: { status: 'pending' } } })
    let ctx
    try {
      ctx = engine.buildAiContext(content, game)
    } catch {
      set((s) => ({ narrations: { ...s.narrations, [key]: { status: 'failed' } } }))
      return
    }
    void ai
      .narrateScene(ctx, scene, previous)
      .catch(() => null)
      .then((n) => {
        set((s) => ({
          narrations: {
            ...s.narrations,
            [key]: n && n.text ? { status: 'ready', narration: n } : { status: 'failed' },
          },
        }))
      })
  }

  const requestSurprise = (game: GameState, sceneId: string) => {
    if (!engine || !content) return
    if (get().surprise?.sceneId === sceneId && get().surprise?.status === 'loading') return
    set({ surprise: { sceneId, status: 'loading' } })
    const historyLen = game.history.length
    const employers = engine.surpriseMenu(content, game)
    const ids = content.constants.surpriseOfferTemplateIds
    const templates = content.aiTemplates.filter((t) => ids.includes(t.id))
    void ai
      .generateSurpriseOffer(engine.buildAiContext(content, game), employers, templates)
      .catch(() => null)
      .then((offer) => {
        const s = get()
        const cur = s.game
        if (!cur || !engine || !content || cur.pending?.sceneId !== sceneId || cur.history.length !== historyLen) {
          set({ surprise: null })
          return
        }
        if (!offer) {
          set({ surprise: { sceneId, status: 'failed' } })
          return
        }
        try {
          const g = engine.injectSurpriseOffer(content, cur, offer)
          const step = engine.getStep(content, g)
          set({ game: g, step, surprise: { sceneId, status: 'done' } })
        } catch {
          set({ surprise: { sceneId, status: 'failed' } })
        }
      })
  }

  const requestStartup = (game: GameState) => {
    if (!engine || !content || !game.startup) return
    const sectorId = game.startup.sectorId
    const sector = content.startupSectors.find((s) => s.id === sectorId)
    const sectorLabel = sector?.label ?? sectorId
    set({ startup: { sectorId, sectorLabel, outcome: game.startup.outcome, status: 'loading', seen: false } })
    void ai
      .generateStartup(engine.buildAiContext(content, game), { id: sectorId, label: sectorLabel })
      .catch(() => null)
      .then((meta) => {
        const s = get()
        if (!s.startup || s.startup.sectorId !== sectorId) return
        if (!meta || !engine) {
          set({ startup: { ...s.startup, status: 'failed' } })
          return
        }
        const g = s.game && s.game.startup?.sectorId === sectorId ? engine.setStartupMeta(s.game, meta) : s.game
        set({ game: g, startup: { ...s.startup, status: 'ready', meta } })
      })
  }

  const resetRun = () => ({
    narrations: {},
    surprise: null,
    beat: null,
    startup: null,
    summary: null,
    epitaph: { status: 'idle' as const },
    respawn: null,
    error: null,
  })

  return {
    ready: false,
    screen: 'title',
    game: null,
    step: null,
    stepKey: '',
    narrations: {},
    surprise: null,
    beat: null,
    startup: null,
    summary: null,
    epitaph: { status: 'idle' },
    respawn: null,
    hasSave: !!loadSave(),
    error: null,

    openNewLife() {
      set({ ...resetRun(), game: null, step: null, stepKey: '', screen: 'newlife' })
    },

    newLife(info) {
      if (!engine || !content) return
      ai.resetLife()
      const seed = Math.floor(Math.random() * 2 ** 31)
      const clean = (v?: string) => v?.trim().slice(0, 24) || undefined
      const game = engine.createGame(content, {
        seed,
        name: clean(info?.name),
        lastName: clean(info?.lastName),
        gender: info?.gender,
      })
      set({ ...resetRun(), game, step: null, stepKey: '', screen: 'newlife' })
    },

    beginLife() {
      const { game } = get()
      if (!engine || !content || !game) return
      set({ screen: 'play' })
      enterStep(engine.resolveNext(content, game))
    },

    choose(choiceId, shownLabel) {
      const { game, step, beat } = get()
      if (!engine || !content || !game || !step || step.type !== 'scene' || beat) return
      const choice = step.scene.choices.find((c) => c.id === choiceId)
      if (!choice || choice.locked) return
      let res: { state: GameState; outcome: Outcome }
      try {
        res = engine.choose(content, game, choiceId)
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'That choice failed.' })
        return
      }
      const next = engine.resolveNext(content, res.state)
      const label = shownLabel ?? choice.label
      const newBeat: Beat = {
        id: ++beatSeq,
        sceneTitle: step.scene.title,
        sceneKind: step.scene.kind,
        choiceLabel: label,
        outcome: res.outcome,
        ageFrom: game.age,
        ageTo: next.age,
        promotions: Math.max(res.outcome.promotions, next.promotions - game.promotions),
        checkStat: res.outcome.chance ? checkStatOf(step.scene.id, choiceId) : undefined,
        student: game.phase === 'arrival' || game.phase === 'aidams12' || game.phase === 'aidams34',
      }
      set({ beat: newBeat, surprise: null })
      // A startup was just founded: name it while the beat plays.
      if (res.state.startup && !res.state.startup.name && game.startup?.sectorId !== res.state.startup.sectorId) {
        requestStartup(res.state)
      }
      // Prefetch: next step + its narration start now, while the consequence beat plays.
      enterStep(next, { title: step.scene.title, choiceLabel: label, consequence: res.outcome.text })
    },

    dismissBeat() {
      if (!get().beat) return
      set({ beat: null })
      const st = get().startup
      if (st && !st.seen) return // the startup card shows next
      if (get().step?.type === 'end') get().finishLife()
    },

    dismissStartup() {
      const st = get().startup
      if (st) set({ startup: { ...st, seen: true } })
      if (get().step?.type === 'end') get().finishLife()
    },

    finishLife() {
      const { game } = get()
      if (!engine || !content || !game) return
      let summary: EndSummary
      try {
        summary = engine.summarize(content, game)
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'Could not end this life.' })
        return
      }
      const saved = loadSave()
      const cached = saved && saved.game.seed === game.seed && saved.epitaph ? saved.epitaph : null
      set({ screen: 'end', summary, respawn: null, epitaph: cached ? { status: 'ready', data: cached } : { status: 'loading' } })
      if (cached) return
      void ai
        .generateEpitaph(engine.buildAiContext(content, game), summary)
        .catch(() => null)
        .then((ep) => {
          if (get().summary !== summary) return
          set({ epitaph: ep ? { status: 'ready', data: ep } : { status: 'failed' } })
          const g = get().game
          if (g && ep) writeSave(g, ep)
        })
    },

    abandon() {
      clearSave()
      set({ ...resetRun(), game: null, step: null, stepKey: '', screen: 'title', hasSave: false })
    },

    resume() {
      const saved = loadSave()
      if (!saved || !engine || !content) {
        set({ hasSave: false })
        return
      }
      try {
        set({ ...resetRun(), screen: saved.game.ended ? 'end' : 'play' })
        const g = saved.game
        if (g.ended) {
          set({ game: g, step: { type: 'end' } })
          get().finishLife()
        } else {
          enterStep(g.pending ? g : engine.resolveNext(content, g))
        }
      } catch {
        clearSave()
        set({ ...resetRun(), screen: 'title', hasSave: false, game: null, step: null })
      }
    },

    goTitle() {
      set({ screen: 'title', hasSave: !!loadSave() })
    },

    simulateRespawn(historyIndex, altChoiceId, altLabel) {
      const { game } = get()
      if (!engine || !content || !game) return
      try {
        const { summary } = engine.respawnSimulate(content, game, historyIndex, altChoiceId)
        set({ respawn: { historyIndex, altChoiceId, altLabel, summary } })
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'Respawn failed.' })
      }
    },

    clearRespawn() {
      set({ respawn: null })
    },

    replayFrom(historyIndex) {
      const { game } = get()
      if (!engine || !content || !game) return
      let g = engine.respawnFrom(content, game, historyIndex)
      if (!g.pending) g = engine.resolveNext(content, g)
      ai.resetLife()
      set({ ...resetRun(), screen: 'play' })
      enterStep(g)
    },
  }
})

// The engine/content/AI chunk loads after first paint; the title enables PRESS START when ready.
modulesReady.then(
  () => useGame.setState({ ready: !!(engine && content), hasSave: !!loadSave() }),
  (e: unknown) => useGame.setState({ error: e instanceof Error ? `Could not load the game (${e.message}). Reload the page.` : 'Could not load the game. Reload the page.' }),
)

// Persist the current life after every state change.
let lastSaved: GameState | null = null
useGame.subscribe((s) => {
  if (s.game && s.game !== lastSaved && (s.screen === 'play' || s.screen === 'end' || s.screen === 'newlife')) {
    lastSaved = s.game
    writeSave(s.game, s.epitaph.status === 'ready' ? s.epitaph.data : null)
  }
})

export { content, engine }

// Dev only: keep the current life across hot reloads (engine/content files change often).
if (import.meta.hot) {
  const prev = import.meta.hot.data.respawnState as Partial<Store> | undefined
  if (prev) useGame.setState(prev)
  import.meta.hot.dispose((data) => {
    const s = useGame.getState()
    data.respawnState = {
      screen: s.screen,
      game: s.game,
      step: s.step,
      stepKey: s.stepKey,
      narrations: s.narrations,
      surprise: s.surprise,
      beat: s.beat,
      startup: s.startup,
      summary: s.summary,
      epitaph: s.epitaph,
      respawn: s.respawn,
      hasSave: s.hasSave,
    } satisfies Partial<Store>
  })
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __respawn: typeof useGame }).__respawn = useGame
}
