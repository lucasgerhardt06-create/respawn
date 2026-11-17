/**
 * Generated pixel sprites in public/assets/sprites (docs/BRAND.md). Paths are relative to
 * import.meta.env.BASE_URL so the build works under the GitHub Pages sub-path.
 */
import type { Phase } from '../content/schema'

export const BASE = import.meta.env.BASE_URL

export function assetUrl(path: string) {
  return `${BASE}${path}`
}

// ---------------------------------------------------------------------------
// Character busts (48 px)
// ---------------------------------------------------------------------------

/** content characters.json id → bust file. */
const CHAR_BUST: Record<string, string> = {
  pm: 'char_pm',
  roommate: 'char_roommate',
  stranger_3am: 'char_stranger',
  first_manager: 'char_manager',
  asso_friend: 'char_friend',
  kid: 'char_kid',
}

/** Bust for a scene: its speaker, else PM on any PM scene (m_pm_*, e_pm_*). */
export function bustFor(speaker: string | undefined, sceneId: string): string | undefined {
  const id = speaker && CHAR_BUST[speaker] ? speaker : /(^|_)pm(\d|_|$)/.test(sceneId) ? 'pm' : undefined
  return id ? `assets/sprites/${CHAR_BUST[id]}.png` : undefined
}

// ---------------------------------------------------------------------------
// Life sprout (40 px)
// ---------------------------------------------------------------------------

export type SproutStage = 'seed' | 'tiny' | 'sprout' | 'sapling' | 'tree' | 'wilted' | 'burnt'

export function sproutUrl(stage: SproutStage) {
  return `assets/sprites/sprout_${stage}.png`
}

export function sproutForPhase(phase: Phase): SproutStage {
  switch (phase) {
    case 'arrival':
    case 'aidams12':
      return 'tiny'
    case 'aidams34':
      return 'sprout'
    case 'launch':
    case 'career':
      return 'sapling'
    default:
      return 'tree'
  }
}

// ---------------------------------------------------------------------------
// Employer emblems (32 px)
// ---------------------------------------------------------------------------

type Emblem = 'surveillance' | 'oil' | 'bank' | 'consulting' | 'social' | 'ai_startup' | 'ngo' | 'public_lab' | 'agency'

/** Explicit map from src/content/data/employers.json ids. */
const EMPLOYER_EMBLEM: Record<string, Emblem> = {
  panoptis: 'surveillance',
  infiniscroll: 'social',
  nebulary: 'social',
  tramontane: 'ai_startup',
  hexagone_lab: 'public_lab',
  cassiopee: 'public_lab',
  goldbridge: 'bank',
  hedgehog: 'bank',
  leafline: 'bank',
  sterling_pike: 'consulting',
  synergeia: 'consulting',
  gcai: 'agency',
  terra_accord: 'agency',
  maison_lumiere: 'consulting',
  hyperbox: 'consulting',
  petrolia: 'oil',
  voltaire_grid: 'oil',
  verdant: 'ngo',
}

/** Fallback by career path (paths.json ids). */
const PATH_EMBLEM: Record<string, Emblem> = {
  finance: 'bank',
  consulting: 'consulting',
  bigtech: 'social',
  research_ml: 'public_lab',
  research_econ: 'public_lab',
  diplomacy: 'agency',
  strategy: 'consulting',
  energy: 'oil',
  ngo: 'ngo',
  startup: 'ai_startup',
  isolation: 'ngo',
}

export function emblemFor(employerId?: string, pathId?: string): string | undefined {
  const e = (employerId && EMPLOYER_EMBLEM[employerId]) || (pathId && PATH_EMBLEM[pathId])
  return e ? `assets/sprites/emp_${e}.png` : undefined
}

// ---------------------------------------------------------------------------
// UI icons (32 px)
// ---------------------------------------------------------------------------

export type IconName =
  | 'coin'
  | 'heart'
  | 'people'
  | 'star'
  | 'impact'
  | 'lock'
  | 'co2'
  | 'plane'
  | 'train'
  | 'phone'
  | 'laptop'
  | 'briefcase'
  | 'cap'
  | 'chip'
  | 'thermometer'
  | 'wave'
  | 'bee'
  | 'sun'
  | 'trophy'
  | 'hourglass'

export function iconUrl(name: IconName) {
  return `assets/sprites/icon_${name}.png`
}

/** Receipt category → icon. */
export const CATEGORY_ICON: Record<string, IconName> = {
  flights: 'plane',
  travel: 'train',
  digital: 'phone',
  career: 'briefcase',
  housing: 'co2',
  lifestyle: 'co2',
  family: 'heart',
  other: 'co2',
}

export const CATEGORY_LABEL: Record<string, string> = {
  flights: 'Flights',
  travel: 'Trains and travel',
  digital: 'Digital',
  career: 'Career',
  housing: 'Housing',
  lifestyle: 'Lifestyle',
  family: 'Family',
  other: 'Living',
}
