/**
 * RESPAWN content contract.
 *
 * Every piece of story and every number lives in src/content/data/*.json and must
 * parse with these schemas. The engine reads ONLY parsed content (no story in code).
 * See docs/GAME_DESIGN.md for meaning, docs/CONTENT_GUIDE.md for authoring rules.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** Visible gauges during play (0–100). */
export const VISIBLE_STATS = ['money', 'happiness', 'social', 'fame', 'contribution'] as const
/**
 * Skills (0–100, diminishing returns) — shown on the character sheet with these display names:
 * intellect "Intelligence", skillAi "Math & AI", skillBusiness "Economics", skillSoft "Charisma".
 */
export const SKILL_STATS = ['intellect', 'skillAi', 'skillBusiness', 'skillSoft'] as const
/** Other 0–100 stats with diminishing returns. Display: energy "Health", network "Network", grades "Grades". */
export const DR_HIDDEN_STATS = [...SKILL_STATS, 'energy', 'network', 'grades'] as const

/** Display names for every stat (character sheet, locked reasons, AI context). */
export const STAT_LABELS: Record<string, string> = {
  money: 'Wealth',
  happiness: 'Happiness',
  social: 'Social',
  fame: 'Fame',
  contribution: 'Impact',
  intellect: 'Intelligence',
  skillAi: 'Math & AI',
  skillBusiness: 'Economics',
  skillSoft: 'Charisma',
  energy: 'Health',
  network: 'Network',
  grades: 'Grades',
  ethics: 'Integrity',
  addiction: 'Vices',
  tech: 'Tech progress',
  ai: 'AI progress',
  aiLever: 'AI lever',
  screenHours: 'Screen time',
  workHours: 'Work hours',
}
/** Hidden linear stats (clamped, no diminishing returns). */
export const LINEAR_STATS = ['ethics', 'addiction', 'tech', 'ai', 'aiLever', 'screenHours', 'workHours'] as const

export const NUMERIC_STATS = [...VISIBLE_STATS, ...DR_HIDDEN_STATS, ...LINEAR_STATS] as const

export type VisibleStat = (typeof VISIBLE_STATS)[number]
export type NumericStat = (typeof NUMERIC_STATS)[number]

export const StatKey = z.enum(NUMERIC_STATS)
export const StatDelta = z.partialRecord(StatKey, z.number())
export type StatDelta = z.infer<typeof StatDelta>

export const PHASES = ['arrival', 'aidams12', 'aidams34', 'launch', 'career', 'maturity', 'oldage'] as const
export const Phase = z.enum(PHASES)
export type Phase = z.infer<typeof Phase>

// ---------------------------------------------------------------------------
// Conditions — tiny rule language, no code in data.
//
// String forms:
//   "skillAi >= 60"   "age > 30"   "grades < 50"            (any numeric stat or: age, promotions, yearsInPath)
//   "path == finance" "employer != panoptis"
//   "profile.budget == tight"  "profile.origin == intl"  "profile.trait == math"
//   "flag:TECH"  "!flag:SHALLOW"
//   "chose:c03_asso=asso_utopia"   (a recorded choice)
// Object forms: { all: [...] } { any: [...] } { not: ... }
// ---------------------------------------------------------------------------

export type Cond = string | { all: Cond[] } | { any: Cond[] } | { not: Cond }
export const Condition: z.ZodType<Cond> = z.lazy(() =>
  z.union([
    z.string().min(1),
    z.object({ all: z.array(Condition) }).strict(),
    z.object({ any: z.array(Condition) }).strict(),
    z.object({ not: Condition }).strict(),
  ]),
)

// ---------------------------------------------------------------------------
// Footprint (tonnes CO2e). Category drives receipt grouping.
// ---------------------------------------------------------------------------

export const FOOTPRINT_CATEGORIES = [
  'flights',
  'travel',
  'housing',
  'lifestyle',
  'digital',
  'career',
  'family',
  'other',
] as const
export const FootprintCategory = z.enum(FOOTPRINT_CATEGORIES)

export const Footprint = z
  .object({
    /** Receipt line label, e.g. "Return flight Paris–Singapore (exchange)". */
    label: z.string(),
    category: FootprintCategory,
    /** One-off life emissions (t CO2e). */
    oneOffT: z.number().optional(),
    /**
     * Annual modifier starting now. Same id replaces an existing modifier.
     * Lasts `years` years, or until `untilAge`, or until death if neither.
     */
    annual: z
      .object({
        id: z.string(),
        tPerYear: z.number(),
        years: z.number().positive().optional(),
        untilAge: z.number().optional(),
      })
      .strict()
      .optional(),
    /** Remove annual modifiers by id. */
    removeAnnual: z.array(z.string()).optional(),
    /** Work footprint (t) — feeds the end screen, not the personal footprint. */
    workT: z.number().optional(),
    /** Influence footprint per year (t/yr), e.g. creator audience. Replaces the current value. */
    influenceTPerYear: z.number().optional(),
    /** Raw materials (kg). */
    materialsKg: z.number().optional(),
    /** Device footprint multiplier (1 = average, 0.3 = refurbished/kept, 1.6 = flagship every 2y). */
    deviceMultiplier: z.number().optional(),
    /** GenAI use footprint per year (t/yr). Replaces current value. */
    genAiTPerYear: z.number().optional(),
    factId: z.string().optional(),
  })
  .strict()
export type Footprint = z.infer<typeof Footprint>

// ---------------------------------------------------------------------------
// Effects / outcomes
// ---------------------------------------------------------------------------

export const Effects = z
  .object({
    /** Additive deltas (diminishing returns on 0–100 stats). */
    stats: StatDelta.optional(),
    /** Absolute values (e.g. screenHours, workHours). Applied before `stats`. */
    set: StatDelta.optional(),
    flags: z.array(z.string()).optional(),
    unflags: z.array(z.string()).optional(),
    footprint: z.array(Footprint).optional(),
    /** Years this outcome consumes (time jumps forward). */
    years: z.number().nonnegative().optional(),
    /** Start / change career. employerId optional for paths without an employer (isolation, ngo...). */
    path: z.object({ pathId: z.string(), employerId: z.string().optional() }).strict().optional(),
    /** End current employment (fired, quit, retire). */
    leavePath: z.boolean().optional(),
    /** Probability of a promotion at each decade boundary from now on. */
    promotionChance: z.number().min(0).max(1).optional(),
    /** Scene ids that will not happen any more. */
    skipScenes: z.array(z.string()).optional(),
    /** End-screen badge ids (see constants.badges). */
    badges: z.array(z.string()).optional(),
    /** Base consequence line shown after choosing (AI may rewrite). */
    text: z.string().optional(),
    factId: z.string().optional(),
  })
  .strict()
export type Effects = z.infer<typeof Effects>

/** Probabilistic outcome. p is clamped to [0.02, 0.98] after modifiers. */
export const Chance = z
  .object({
    p: z.number().min(0).max(1),
    /** p += per × (stat − 50) / 50 for each modifier. */
    modifiers: z.array(z.object({ stat: StatKey, per: z.number() }).strict()).optional(),
    success: Effects,
    failure: Effects,
  })
  .strict()
export type Chance = z.infer<typeof Chance>

export const Choice = z
  .object({
    id: z.string(),
    label: z.string(),
    /** Short tease shown under the label. Never numbers. */
    hint: z.string().optional(),
    /** If false → choice is shown greyed out with lockedReason. */
    conditions: Condition.optional(),
    lockedReason: z.string().optional(),
    /** If false → choice is not shown at all (use sparingly, e.g. variant options). */
    visibleIf: Condition.optional(),
    effects: Effects.optional(),
    chance: Chance.optional(),
    /** Follow-up scene id (kind must be a scene with followUpOnly: true). */
    next: z.string().optional(),
  })
  .strict()
export type Choice = z.infer<typeof Choice>

// ---------------------------------------------------------------------------
// Scenes: majors, minis, events
// ---------------------------------------------------------------------------

export const DynamicChoices = z.discriminatedUnion('type', [
  /** One asso per category drawn from assos.json + a "no association" static choice. */
  z.object({ type: z.literal('assoDraw') }).strict(),
  /** One destination drawn per continent (seeded), nothing locked. */
  z.object({ type: z.literal('exchange') }).strict(),
  /** `count` eligible employers + up to `lockedCount` locked ones + optional AI surprise slot. */
  z
    .object({
      type: z.literal('jobOffers'),
      count: z.number().int().positive(),
      lockedCount: z.number().int().nonnegative(),
      aiSurprise: z.boolean(),
      /** Restrict to these paths (default: all paths not banned by an AI job loss). */
      paths: z.array(z.string()).optional(),
    })
    .strict(),
  /** Startup sectors from startup_sectors.json. */
  z.object({ type: z.literal('startupSectors') }).strict(),
])
export type DynamicChoices = z.infer<typeof DynamicChoices>

export const SCENE_KINDS = ['major', 'mini', 'event'] as const
export const EVENT_FAMILIES = ['global', 'consequence', 'life', 'student'] as const

export const Variant = z
  .object({
    conditions: Condition,
    /** Replaces the base text when matched (first matching variant with text wins). */
    text: z.string().optional(),
    /** Extra effects applied on top of the chosen choice (all matching variants apply). */
    effects: Effects.optional(),
  })
  .strict()

export const Scene = z
  .object({
    id: z.string(),
    kind: z.enum(SCENE_KINDS),
    phase: Phase,
    /** Majors: 1..20 sequence. Minis/events: tie-breaker within the same age. */
    order: z.number().optional(),
    /** Majors and minis: the age at which it happens. */
    age: z.number().optional(),
    /** Events: age window [min, max] in which it may fire. */
    window: z.tuple([z.number(), z.number()]).optional(),
    /** Probability to fire when eligible (minis/events). Default 1. */
    p: z.number().min(0).max(1).optional(),
    family: z.enum(EVENT_FAMILIES).optional(),
    /** Eligibility. Majors whose conditions fail are skipped. */
    conditions: Condition.optional(),
    /** Happens even if a long choice jumped past its age. */
    mandatory: z.boolean().optional(),
    /** Only reachable via a choice's `next`. */
    followUpOnly: z.boolean().optional(),
    /** Can fire again after cooldownYears (default: once). */
    repeatable: z.boolean().optional(),
    cooldownYears: z.number().optional(),
    title: z.string(),
    /** Base text (2–4 sentences, second person). Shown instantly; AI narration replaces it. */
    text: z.string(),
    /** Character id from characters.json who speaks / features. */
    speaker: z.string().optional(),
    /** Pixel scene art key (see src/ui/art). */
    art: z.string().optional(),
    ai: z
      .object({
        narrate: z.boolean().default(true),
        tone: z.string().optional(),
        /** Extra instructions for the narrator ("reference the 3AM person if flag met_3am"). */
        hints: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
    choices: z.array(Choice),
    dynamic: DynamicChoices.optional(),
    variants: z.array(Variant).optional(),
  })
  .strict()
export type Scene = z.infer<typeof Scene>

// ---------------------------------------------------------------------------
// Pools
// ---------------------------------------------------------------------------

export const ASSO_CATEGORIES = ['sport', 'arts', 'corpo', 'impact'] as const
export const Asso = Choice.extend({
  category: z.enum(ASSO_CATEGORIES),
  school: z.enum(['ESSEC', 'CentraleSupélec']),
  blurb: z.string(),
}).strict()
export type Asso = z.infer<typeof Asso>

/** Exchange continents: C06 offers one destination drawn from each (grades play no part). */
export const EXCHANGE_CONTINENTS = ['europe', 'north_america', 'south_america', 'asia_oceania'] as const
export const Destination = Choice.extend({
  continent: z.enum(EXCHANGE_CONTINENTS),
  university: z.string(),
  city: z.string(),
  country: z.string(),
  /** Return trip t CO2e (train if small). */
  tripT: z.number(),
  byTrain: z.boolean().optional(),
}).strict()
export type Destination = z.infer<typeof Destination>

export const AI_EXPOSURE = ['low', 'high_complement', 'high_replace'] as const
export const Path = z
  .object({
    id: z.string(),
    name: z.string(),
    /** Field used by the "no re-employment after AI job loss" rule. */
    field: z.string(),
    perDecade: StatDelta,
    /** Annual footprint modifier while in this path (e.g. business flights). */
    annual: z.object({ tPerYear: z.number(), label: z.string(), category: FootprintCategory }).strict().optional(),
    aiExposure: z.enum(AI_EXPOSURE),
    defaultPromotionChance: z.number().min(0).max(1),
    description: z.string(),
  })
  .strict()
export type Path = z.infer<typeof Path>

export const Employer = Choice.extend({
  pathId: z.string(),
  /** Fictional name only — never a real company. */
  name: z.string(),
  tagline: z.string(),
  /** Extra per-decade effects on top of the path while employed here. */
  perDecade: StatDelta.optional(),
  /** Prestige ordering for locked showcase (higher = shown as locked aspiration). */
  prestige: z.number().optional(),
}).strict()
export type Employer = z.infer<typeof Employer>

export const StartupSector = Choice.extend({
  /** Base success probability. */
  successP: z.number().min(0).max(1),
  successModifiers: z.array(z.object({ stat: StatKey, per: z.number() }).strict()).optional(),
  success: Effects,
  failure: Effects,
}).strict()
export type StartupSector = z.infer<typeof StartupSector>

/** Effects menu the AI picks from for generated events. The engine rolls the outcome. */
export const AiTemplate = z
  .object({
    id: z.string(),
    /** Plain description given to the model: "big risk, big tech upside". */
    description: z.string(),
    outcomes: z.array(z.object({ p: z.number().min(0).max(1), effects: Effects }).strict()).min(1),
  })
  .strict()
export type AiTemplate = z.infer<typeof AiTemplate>

export const Fact = z
  .object({
    id: z.string(),
    /** One sentence, shown as "Did you know?". */
    text: z.string(),
    source: z.string(),
    url: z.string().url().optional(),
  })
  .strict()
export type Fact = z.infer<typeof Fact>

/**
 * Endings are matched against end metrics. Extra condition keys available at the end:
 * footprintScore, temperature, lifespan, F (t/yr) — plus all stats and flags.
 */
export const Ending = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    conditions: Condition,
    priority: z.number(),
  })
  .strict()
export type Ending = z.infer<typeof Ending>

export const Character = z
  .object({
    id: z.string(),
    /** Display name. The professor is ONLY ever "PM". */
    name: z.string(),
    role: z.string(),
    description: z.string(),
    /** Flags that mean this character is part of the player's story. */
    knownIf: Condition.optional(),
  })
  .strict()
export type Character = z.infer<typeof Character>

export const ProfileOption = z
  .object({ id: z.string(), label: z.string(), blurb: z.string(), effects: Effects.optional(), weight: z.number().optional() })
  .strict()
export const Profiles = z
  .object({
    origins: z.array(ProfileOption).min(2),
    budgets: z.array(ProfileOption).min(2),
    traits: z.array(ProfileOption).min(2),
    /** Default first names if the player leaves the name empty. */
    names: z.array(z.string()).min(4),
  })
  .strict()
export type Profiles = z.infer<typeof Profiles>

export const Badge = z.object({ id: z.string(), label: z.string(), description: z.string() }).strict()

export const Constants = z
  .object({
    startStats: z.record(StatKey, z.number()),
    statBounds: z.record(StatKey, z.tuple([z.number(), z.number()])),
    footprint: z
      .object({
        baselineTPerYear: z.number(), // 8.8
        frenchAverageT: z.number(), // 9.2
        targetT: z.number(), // 2
        devicesTPerYear: z.number(), // 0.20
        networksTPerYear: z.number(), // 0.20
        videoKgPerHour: z.number(), // 0.064
        averageScreenHours: z.number(), // 2.33
        richLifestyleTPerYear: z.number(), // 1.5 when money >= richThreshold
        richThreshold: z.number(), // 70
      })
      .strict(),
    planet: z
      .object({
        todayC: z.number(), // 1.4
        currentPoliciesC: z.number(), // 2.7
        tempScoreRange: z.tuple([z.number(), z.number()]), // [1.5, 4.4]
        oceanCurve: z.array(z.tuple([z.number(), z.number()])),
        insectsCurve: z.array(z.tuple([z.number(), z.number()])),
        heatBase: z.number(), // 0.4
        heatSlope: z.number(), // 1.33
        heatScoreRange: z.tuple([z.number(), z.number()]), // [0.4, 4.3]
        materialsWeight: z.number(), // 0.3
        materialsPenaltyPerTonne: z.number(), // 5
      })
      .strict(),
    lifespan: z
      .object({
        base: z.number(),
        /** Optional life expectancy by gender (INSEE 2025: woman 85.9, man 80.3); falls back to base. */
        baseByGender: z.object({ woman: z.number(), man: z.number() }).strict().optional(),
        socialSwing: z.number(),
        grindPenaltyPerYear: z.number(),
        addictionPenalty: z.number(),
        min: z.number(),
        max: z.number(),
      })
      .strict(),
    yearly: z
      .object({
        highScreenHours: z.number(), // 3
        highScreenHappiness: z.number(), // -0.4
        lowScreenHours: z.number(), // 1
        lowScreenHappiness: z.number(), // 0.2
        lowScreenSocial: z.number(), // 0.2
        grindHours: z.number(), // 55
        grindHappiness: z.number(), // -0.6
        grindSocial: z.number(), // -0.6
        socialToHappiness: z.number(), // 0.025
        fameScreenPenalty: z.number(), // -0.5
        energyRecovery: z.number(), // 3
      })
      .strict(),
    promotion: z.object({ effects: Effects }).strict(),
    /** Ages where an AI-generated event may be inserted, with a content fallback event. */
    aiEventSlots: z
      .array(z.object({ id: z.string(), age: z.number(), phase: Phase, fallbackSceneId: z.string() }).strict())
      .max(6),
    /** Flag → human memory sentence for the AI context ("asso_automatants": "joined Automatants, the AI club"). */
    flagMemories: z.record(z.string(), z.string()),
    /** Templates the AI may use for the C11 surprise offer (effects on hire). */
    surpriseOfferTemplateIds: z.array(z.string()),
    /**
     * The only names the AI may give the C11 surprise employer: parody names from GAME_DESIGN.md §0
     * that are not regular employers, each tied to a career path (the AI picks one; it never invents one).
     */
    surpriseEmployers: z.array(z.object({ name: z.string().min(2).max(40), pathId: z.string() }).strict()).min(1),
    badges: z.array(Badge),
  })
  .strict()
export type Constants = z.infer<typeof Constants>

// ---------------------------------------------------------------------------
// Whole content bundle
// ---------------------------------------------------------------------------

export const Content = z
  .object({
    constants: Constants,
    profiles: Profiles,
    scenes: z.array(Scene),
    assos: z.array(Asso),
    destinations: z.array(Destination),
    paths: z.array(Path),
    employers: z.array(Employer),
    startupSectors: z.array(StartupSector),
    aiTemplates: z.array(AiTemplate),
    facts: z.array(Fact),
    endings: z.array(Ending),
    characters: z.array(Character),
  })
  .strict()
export type Content = z.infer<typeof Content>
