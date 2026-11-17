/**
 * Zod schemas for every AI request body (input) and every model answer (output).
 *
 * Inputs: the browser sends the engine's AIContext / SceneView (src/engine/types.ts). Known
 * fields are type-checked and length-capped; unknown nested keys are stripped (so they never
 * reach a prompt); unknown top-level keys are rejected.
 *
 * Outputs: the same Zod schema is turned into the JSON schema sent as `output_config.format`
 * (structured outputs) and then re-validated on the answer. Length caps are not enforced by the
 * API (the SDK moves them into the schema description as a hint), so they are enforced here.
 */
import { z } from 'zod'
import type { AIContext, ChoiceView, SceneView } from '../../src/engine/types.js'

const text = (max: number) => z.string().max(max)
const shortId = z.string().min(1).max(64)

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const StartupStateSchema = z.object({
  sectorId: text(64),
  name: text(80).optional(),
  product: text(200).optional(),
  pitch: text(400).optional(),
  investor: text(80).optional(),
  rival: text(80).optional(),
  outcome: z.enum(['success', 'failure']).optional(),
})

export const AIContextSchema = z.object({
  name: text(40),
  lastName: text(40).optional(),
  /** Third-person pronouns (epitaph). Optional here so an older client never gets a 400. */
  pronouns: z.object({ subject: text(16), object: text(16), possessive: text(16) }).optional(),
  age: z.number().min(0).max(130),
  phase: text(24),
  profile: z.object({ origin: text(80), budget: text(80), trait: text(80) }),
  gauges: z
    // Keys are display labels ("Math & AI"): allowlisted characters only, so a key can't smuggle markup into the prompt.
    .record(z.string().regex(/^[A-Za-z0-9 &'.-]{1,32}$/), z.union([z.number(), text(48)]))
    .refine((g) => Object.keys(g).length <= 24, 'too many gauges'),
  career: z
    .object({
      path: text(80),
      employer: text(80).optional(),
      years: z.number().min(0).max(120),
      promotions: z.number().min(0).max(50),
    })
    .optional(),
  exchange: text(160).optional(),
  startup: StartupStateSchema.optional(),
  memories: z.array(text(200)).max(24),
  recentChoices: z.array(text(200)).max(10),
  characters: z.array(z.object({ id: shortId, name: text(60), role: text(120) })).max(16),
})

export const ChoiceViewSchema = z.object({
  id: shortId,
  label: text(140),
  hint: text(200).optional(),
  locked: z.boolean(),
  lockedReason: text(160).optional(),
})

export const SceneViewSchema = z.object({
  id: shortId,
  kind: z.enum(['major', 'mini', 'event']),
  phase: text(24),
  age: z.number().min(0).max(130),
  majorIndex: z.number().int().min(0).max(40).optional(),
  majorCount: z.number().int().min(0).max(40),
  title: text(120),
  text: text(1400),
  speaker: text(64).optional(),
  art: text(64).optional(),
  narrate: z.boolean(),
  tone: text(120).optional(),
  hints: z.array(text(300)).max(8).optional(),
  choices: z.array(ChoiceViewSchema).max(8),
  isFollowUp: z.boolean(),
  isAiEvent: z.boolean(),
})

export const PreviousSchema = z.object({
  title: text(120),
  choiceLabel: text(140),
  consequence: text(300).optional(),
})

/** Only id + description are needed to pick a template; outcomes stay client-side. */
export const TemplateRefSchema = z.object({ id: shortId, description: text(240) })

export const NarrateInput = z
  .object({ ctx: AIContextSchema, scene: SceneViewSchema, previous: PreviousSchema.optional() })
  .strict()

export const EventInput = z
  .object({ ctx: AIContextSchema, templates: z.array(TemplateRefSchema).min(2).max(12) })
  .strict()

export const SurpriseInput = z
  .object({
    ctx: AIContextSchema,
    /** Fixed menu of parody employer names (the model picks one, it never invents a company). */
    employers: z.array(z.object({ name: text(40), pathId: shortId, pathName: text(80) }).strict()).min(1).max(16),
    templates: z.array(TemplateRefSchema).min(1).max(12),
  })
  .strict()

export const StartupInput = z
  .object({ ctx: AIContextSchema, sector: z.object({ id: shortId, label: text(120) }) })
  .strict()

const PoleScores = z.record(text(24), z.number().min(-1000).max(1000)).refine(
  (r) => Object.keys(r).length <= 12,
  'too many poles',
)

/** Compact EndSummary built by src/ai/client.ts (only what the epitaph needs). */
export const EpitaphSummarySchema = z.object({
  name: text(40),
  deathAge: z.number().min(0).max(130),
  title: z.object({ title: text(80), description: text(300) }),
  you: PoleScores,
  earth: z.object({ temperatureC: z.number().min(0).max(10), oceanM: z.number().min(0).max(5), scores: PoleScores }),
  F: z.number().min(0).max(200),
  lifetimeT: z.number().min(0).max(100_000),
  frenchAverageLifetimeT: z.number().min(0).max(100_000),
  receiptTop: z.array(z.object({ label: text(140), t: z.number().min(-1000).max(100_000) })).max(6),
  topChoices: z.array(z.object({ title: text(120), chosenLabel: text(140), age: z.number().min(0).max(130) })).max(4),
  path: z.object({ pathName: text(80), employerName: text(80).optional() }).optional(),
  startup: z.object({ name: text(80).optional(), outcome: z.enum(['success', 'failure']).optional() }).optional(),
  badges: z.array(text(80)).max(10),
})
export type EpitaphSummary = z.infer<typeof EpitaphSummarySchema>

export const EpitaphInput = z.object({ ctx: AIContextSchema, summary: EpitaphSummarySchema }).strict()

export type NarrateInput = z.infer<typeof NarrateInput>
export type EventInput = z.infer<typeof EventInput>
export type SurpriseInput = z.infer<typeof SurpriseInput>
export type StartupInput = z.infer<typeof StartupInput>
export type EpitaphInput = z.infer<typeof EpitaphInput>

// Compile-time drift checks against the engine contract: the engine's objects must be valid
// inputs for these schemas (field names and types line up).
type Assignable<T, U extends T> = U
export type _CtxCheck = Assignable<z.input<typeof AIContextSchema>, AIContext>
export type _SceneCheck = Assignable<z.input<typeof SceneViewSchema>, SceneView>
export type _ChoiceCheck = Assignable<z.input<typeof ChoiceViewSchema>, ChoiceView>

// ---------------------------------------------------------------------------
// Outputs (structured outputs + re-validation)
// ---------------------------------------------------------------------------

export const LABEL_MAX = 40
export const TITLE_MAX = 40

/** Records are not allowed in structured outputs, so labels come back as a list. */
export const NarrationOutput = z.object({
  text: z.string().min(20).max(620).describe('2 to 4 sentences, second person, at most 70 words.'),
  choiceLabels: z
    .array(
      z.object({
        id: z.string().describe('A choice id copied exactly from the scene.'),
        // Over-long labels are dropped one by one in handlers.ts, not the whole narration.
        label: z.string().max(200).describe(`At most ${LABEL_MAX} characters.`),
      }),
    )
    .max(6)
    .describe('Optional punchier labels. Empty list if the base labels are fine.'),
})

export const EventOutput = z.object({
  title: z.string().min(2).max(TITLE_MAX),
  text: z.string().min(20).max(520).describe('2 or 3 sentences, second person, at most 60 words.'),
  choices: z
    .array(
      z.object({
        label: z.string().min(2).max(LABEL_MAX),
        templateId: z.string().describe('One of the provided template ids, copied exactly.'),
      }),
    )
    .min(2)
    .max(3),
})

export const SurpriseOutput = z.object({
  employerName: z.string().min(2).max(40).describe('One of the provided employer names, copied exactly.'),
  tagline: z.string().min(4).max(90),
  templateId: z.string().describe('One of the provided template ids, copied exactly.'),
  pitch: z.string().min(20).max(300).describe('At most 2 sentences, the recruiter speaking to "you".'),
})

export const StartupOutput = z.object({
  name: z.string().min(2).max(32),
  product: z.string().min(4).max(140),
  pitch: z.string().min(10).max(300),
  investor: z.string().min(2).max(60),
  rival: z.string().min(2).max(40),
})

/** Sources a tip may cite (real, and already used in facts.json / GAME_DESIGN §12). */
export const TIP_SOURCES = [
  'ADEME',
  'ADEME & Arcep (2022)',
  'Impact CO2 (ADEME)',
  'IEA, Energy and AI (2025)',
  'WHO/ILO (2021)',
  'US Surgeon General advisory (2023)',
  'Allcott et al., American Economic Review (2020)',
  'Holt-Lunstad et al., PLoS Medicine (2010)',
  'AFNOR Spec 2314 (2024)',
  'IPCC AR6',
] as const

export const OBITUARY_MAX_WORDS = 90
export const LINKEDIN_MAX_WORDS = 110

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

export const EpitaphOutput = z.object({
  obituary: z
    .string()
    .min(40)
    .max(900)
    .refine((s) => wordCount(s) <= OBITUARY_MAX_WORDS, `at most ${OBITUARY_MAX_WORDS} words`),
  linkedinPost: z
    .string()
    .min(40)
    .max(1100)
    .refine((s) => wordCount(s) <= LINKEDIN_MAX_WORDS, `at most ${LINKEDIN_MAX_WORDS} words`),
  tips: z
    .array(z.object({ text: z.string().min(10).max(240), source: z.enum(TIP_SOURCES) }))
    .length(2),
})

export type NarrationOutput = z.infer<typeof NarrationOutput>
export type EventOutput = z.infer<typeof EventOutput>
export type SurpriseOutput = z.infer<typeof SurpriseOutput>
export type StartupOutput = z.infer<typeof StartupOutput>
export type EpitaphOutput = z.infer<typeof EpitaphOutput>
