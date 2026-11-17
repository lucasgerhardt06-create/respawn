/**
 * Client-side AI contract. The UI store calls these; src/ai/client.ts implements them
 * by POSTing to /api/ai/<task> (server/ai/* holds the prompts and the Anthropic key).
 *
 * Every method resolves to null on timeout / error / invalid output — the game then keeps
 * the base text or the content fallback. Never throw into the UI.
 */
import type {
  AIContext,
  AiEventDraft,
  EndSummary,
  SceneView,
  StartupState,
  SurpriseOfferDraft,
} from '../engine/types'
import type { AiTemplate } from '../content/schema'

export interface Narration {
  /** 2–4 sentences, second person, replaces scene.text. */
  text: string
  /** Optional flavoured labels keyed by choice id (same meaning, same order). */
  choiceLabels?: Record<string, string>
}

export interface StartupMeta {
  name: string
  product: string
  pitch: string
  investor: string
  rival: string
}

export interface Epitaph {
  obituary: string
  linkedinPost: string
  /** Two concrete actions tied to the weakest poles, each with a source. */
  tips: { text: string; source: string }[]
}

export interface AIClient {
  /** The previous choice + its consequence line, so the narration can acknowledge it. */
  narrateScene(
    ctx: AIContext,
    scene: SceneView,
    previous?: { title: string; choiceLabel: string; consequence?: string },
  ): Promise<Narration | null>
  generateEvent(ctx: AIContext, templates: AiTemplate[]): Promise<AiEventDraft | null>
  /** `employers`: the fixed parody menu from engine.surpriseMenu (the model picks one, never invents). */
  generateSurpriseOffer(
    ctx: AIContext,
    employers: { name: string; pathId: string; pathName: string }[],
    templates: AiTemplate[],
  ): Promise<SurpriseOfferDraft | null>
  generateStartup(ctx: AIContext, sector: { id: string; label: string }): Promise<StartupMeta | null>
  generateEpitaph(ctx: AIContext, summary: EndSummary): Promise<Epitaph | null>
  /** Calls made in this life (client-side cap). */
  readonly callsUsed: number
  resetLife(): void
}

export type { StartupState }
