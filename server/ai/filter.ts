/**
 * Post-filter for model text. Two jobs:
 *  1. clean: strip markup, control characters, stray quotes, emoji (except where allowed).
 *  2. reject: if the text contains the professor's real name, a real company / brand, meta talk
 *     ("as an AI"), or game numbers in narration, the whole answer is dropped (null) and the
 *     game keeps its base text.
 */

/**
 * The professor's real first and last name, stored reversed so the name itself never appears
 * in the source (CLAUDE.md: the professor is only ever "PM").
 */
const PROFESSOR_TOKENS_REVERSED = ['eppilihP', 'ueihtaM']
export const PROFESSOR_NAME_TOKENS: readonly string[] = PROFESSOR_TOKENS_REVERSED.map((s) =>
  [...s].reverse().join(''),
)

/**
 * Real companies and brands the model must not name (case-insensitive, whole words). The game uses
 * the parody names from docs/GAME_DESIGN.md §0 instead; whole-word matching lets them through
 * ("Goldmann Sax", "Envidia", "aiPhone", "Bain-Marie"). Ambiguous everyday words are in
 * BRAND_BLOCKLIST_CASED instead, or left out (shell, total, oracle, slack).
 */
export const BRAND_BLOCKLIST: readonly string[] = [
  'google', 'alphabet inc', 'youtube', 'facebook', 'instagram', 'whatsapp', 'tiktok', 'bytedance',
  'snapchat', 'twitter', 'microsoft', 'openai', 'chatgpt', 'anthropic', 'deepmind', 'gemini',
  'nvidia', 'tesla', 'spacex', 'palantir', 'netflix', 'uber', 'airbnb', 'spotify', 'samsung',
  'huawei', 'iphone', 'ipad', 'macbook', 'playstation', 'xbox', 'nintendo', 'amazon web services',
  'aws', 'alibaba', 'tencent', 'baidu', 'totalenergies', 'exxon', 'exxonmobil', 'chevron',
  'aramco', 'gazprom', 'goldman sachs', 'jp morgan', 'jpmorgan', 'morgan stanley', 'bnp paribas',
  'societe generale', 'société générale', 'blackrock', 'mckinsey', 'boston consulting group',
  'bain & company', 'deloitte', 'pwc', 'kpmg', 'ernst & young', 'accenture', 'capgemini', 'lvmh',
  "l'oréal", "l'oreal", 'danone', 'airbus', 'boeing', 'thales', 'dassault', 'safran', 'renault',
  'peugeot', 'stellantis', 'ryanair', 'easyjet', 'air france', 'sncf', 'ratp', "mcdonald's",
  'mcdonalds', 'starbucks', 'coca-cola', 'nike', 'adidas', 'ikea', 'deliveroo', 'mistral ai',
  'hugging face', 'salesforce', 'ibm', 'intel', 'carrefour', 'decathlon', 'doctolib', 'blablacar',
  'ubisoft', 'linkedin', 'goldman', 'j.p. morgan', 'j.p.morgan', 'bcg', 'bain capital', 'bitcoin', 'interrail',
  'oecd', 'united nations', 'doctors without borders', 'médecins sans frontières', 'institut pasteur',
  'engie', 'edf',
]

/** Brands that are also everyday words: blocked only with a capital letter ("Apple", not "apple pie"). */
export const BRAND_BLOCKLIST_CASED: readonly string[] = ['Meta', 'Apple', 'Amazon']

const META_PATTERNS = [
  /\bas an ai\b/i,
  /\blanguage model\b/i,
  /\bgame[_ ]state\b/i,
  /\bsystem prompt\b/i,
  /\bjson\b/i,
  /<\/?[a-z_]+>/i,
]

/** Game numbers in narration: "+5", "-3", "70%", "happiness 40", "stats", "gauge". */
const STAT_PATTERNS = [
  /(^|[\s(])[+\-−]\s?\d/,
  /\d\s?%/,
  /\b(money|happiness|social|fame|impact|contribution|energy|grades?|ethics|addiction|network|skill\w*)\s*[:=]?\s*[+\-−]?\d/i,
  /\b(gauges?|stats?)\b/i,
]

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function wordRe(term: string, flags = 'iu'): RegExp {
  // \b does not work around accented letters or apostrophes, so use explicit lookarounds.
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(term)}(?=$|[^\\p{L}\\p{N}])`, flags)
}

const PROFESSOR_RES = PROFESSOR_NAME_TOKENS.map((t) => [t, wordRe(t)] as const)
const PROFESSOR_FULL_RE = new RegExp(PROFESSOR_NAME_TOKENS.map(escapeRe).join('\\s+'), 'iu')
const BRAND_RES = [
  ...BRAND_BLOCKLIST.map((b) => [b, wordRe(b)] as const),
  ...BRAND_BLOCKLIST_CASED.map((b) => [b, wordRe(b, 'u')] as const),
]

/** Brands already present in the request (e.g. in the base text): echoing them is not the model's fault. */
export function brandsIn(text: string): Set<string> {
  const found = new Set<string>()
  for (const [brand, re] of BRAND_RES) if (re.test(text)) found.add(brand)
  return found
}

/**
 * Professor-name tokens that are legitimately in the request because a player or a character
 * happens to carry that (common) first name. Those single tokens are tolerated; the full name is not.
 */
export function professorTokensIn(names: string[]): Set<string> {
  const joined = names.join(' ')
  return new Set(PROFESSOR_RES.filter(([, re]) => re.test(joined)).map(([t]) => t))
}

export function containsProfessorName(text: string, allowTokens?: Set<string>): boolean {
  if (PROFESSOR_FULL_RE.test(text)) return true
  return PROFESSOR_RES.some(([token, re]) => !allowTokens?.has(token) && re.test(text))
}

export type FilterIssue = 'professor_name' | 'real_brand' | 'meta_leak' | 'stat_numbers'

export interface FilterOptions {
  /** Reject game numbers (narration / events). */
  checkNumbers?: boolean
  /** Brands that were already in the input. */
  allowBrands?: Set<string>
  /** Professor-name tokens that are the player's or a character's own name (see professorTokensIn). */
  allowNameTokens?: Set<string>
}

export function findIssue(text: string, opts: FilterOptions = {}): FilterIssue | null {
  if (containsProfessorName(text, opts.allowNameTokens)) return 'professor_name'
  for (const [brand, re] of BRAND_RES) {
    if (opts.allowBrands?.has(brand)) continue
    if (re.test(text)) return 'real_brand'
  }
  if (META_PATTERNS.some((re) => re.test(text))) return 'meta_leak'
  if (opts.checkNumbers && STAT_PATTERNS.some((re) => re.test(text))) return 'stat_numbers'
  return null
}

export interface CleanOptions {
  allowEmoji?: boolean
  /** Keep single line breaks (LinkedIn post). */
  multiline?: boolean
}

const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

export function cleanText(input: string, opts: CleanOptions = {}): string {
  let s = input.replace(CONTROL_RE, '')
  s = s.replace(/<[^>]*>/g, ' ') // html-ish tags
  s = s.replace(/\*\*|__|`+/g, '') // bold / code markers
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '') // markdown headings
  s = s.replace(/^\s*>\s?/gm, '') // quotes
  if (!opts.allowEmoji) s = s.replace(EMOJI_RE, '')
  if (opts.multiline) {
    s = s
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
  } else {
    s = s.replace(/\s+/g, ' ')
  }
  s = s.trim()
  // Strip one pair of wrapping quotes around the whole text.
  const m = /^["“”'](.*)["“”']$/s.exec(s)
  if (m && !/["“”]/.test(m[1])) s = m[1].trim()
  return s
}

/** Clean, then check. Returns null when the text must be dropped. */
export function acceptText(input: string, opts: FilterOptions & CleanOptions = {}): string | null {
  const cleaned = cleanText(input, opts)
  if (!cleaned) return null
  return findIssue(cleaned, opts) ? null : cleaned
}

/** Sanitise every string of a parsed request body before it goes into a prompt. */
export function sanitizeInput<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(CONTROL_RE, '').replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim() as T
  }
  if (Array.isArray(value)) return value.map((v) => sanitizeInput(v)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = sanitizeInput(v)
    return out as T
  }
  return value
}
