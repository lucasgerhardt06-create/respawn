/**
 * npm run check-data — content linter.
 *  1. Zod schema (per JSON file, with file/path)          4. forbidden strings (brands, the professor's name)
 *  2. referential integrity (ids, next, facts, paths...)  5. reachability over 2,000 simulated random lives
 *  3. conditions parse + flags/stats references
 * Exit code 1 on errors, 0 with warnings only.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Choice, Cond, Content, Effects, Scene } from '../src/content/schema.ts'
import { EXCHANGE_CONTINENTS } from '../src/content/schema.ts'
import { ConditionError, evaluate, parseCondition, walkCondition } from '../src/engine/conditions.ts'
import { makeEnv } from '../src/engine/planet.ts'
import { endFigures, summarize } from '../src/engine/summary.ts'
import { ROOT, loadContent } from './lib/loadContent.ts'
import type { Issue, Level } from './lib/loadContent.ts'
import { findNonFinite, playLife } from './lib/lives.ts'

const MAX_TEXT = 420
const MAX_LABEL = 48
const SIM_LIVES = Number(process.argv.find((a) => a.startsWith('--lives='))?.split('=')[1] ?? 2000)

const issues: Issue[] = []
const add = (level: Level, where: string, message: string) => issues.push({ level, where, message })

// Real brands: content uses the parody names from docs/GAME_DESIGN.md §0 instead (Goggle, Metta, McKinsley...).
// Matched as whole words, so the parodies pass ("Goldmann Sax", "Envidia", "aiPhone"); the ones that are
// also ordinary English words are matched case-sensitively.
const BRANDS_CI = [
  'Palantir', 'TotalEnergies', 'Google', 'Facebook', 'Instagram', 'TikTok', 'YouTube', 'OpenAI', 'ChatGPT', 'Mistral',
  'McKinsey', 'BCG', 'Bain & Company', 'Goldman', 'Goldman Sachs', 'JPMorgan', 'J.P. Morgan', 'JP Morgan', 'Microsoft',
  'Nvidia', 'iPhone', 'Tesla', 'Netflix', 'LinkedIn', 'Bitcoin', 'Interrail', 'OECD', 'United Nations', 'LVMH',
  'BlackRock', 'DeepMind', 'Institut Pasteur', 'Doctors Without Borders', 'Médecins Sans Frontières', 'Engie',
]
const BRANDS_CS = ['Total', 'Meta', 'Apple', 'Amazon', 'Slack', 'EDF']
/** The invented employer names used before the parody list (warn if any comes back). */
const OLD_NAMES = [
  'Panoptis', 'InfiniScroll', 'Nebulary', 'Tramontane', 'Goldbridge', 'Hedgehog Partners', 'Leafline', 'Sterling & Pike',
  'Synergeia', 'Hyperbox', 'Petrolia', 'Verdant', 'Voltaire Grid', 'Maison Lumière', 'Terra Accord', 'Geneva Council on AI',
  'Hexagone AI Lab', 'Cassiopée', 'Common Ground', 'Sprout Labs', 'La Ferme des Communs',
]
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Whole word, accent- and punctuation-safe (\b fails after "&" or "è"). */
const wordRe = (term: string, flags: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term)}(?![\\p{L}\\p{N}])`, flags + 'u')
// The professor is only ever "PM": block his first and last names (stored reversed so they never
// appear in plain text in the codebase).
const PROF_TOKENS = ['eppilihp', 'ueihtam'].map((s) => [...s].reverse().join(''))

function brandHits(text: string): string[] {
  const hits: string[] = []
  for (const b of BRANDS_CI) if (wordRe(b, 'i').test(text)) hits.push(b)
  // Case-sensitive ones are ordinary words at the start of a sentence ("Total focus"): only flag mid-sentence.
  for (const b of BRANDS_CS) {
    for (const m of text.matchAll(wordRe(b, 'g'))) {
      const before = text.slice(0, m.index).trimEnd()
      if (before !== '' && !/[.!?:;"'(\u201c\u2018]$/.test(before)) hits.push(b)
    }
  }
  return [...new Set(hits)]
}
/** Fact citations must name their real publisher: `source` / `url` fields are exempt from the brand check. */
const CITATION_PATH = /\.(source|url)$/
function profHit(text: string): boolean {
  const lower = text.toLowerCase()
  return PROF_TOKENS.some((t) => lower.includes(t))
}

function walkStrings(value: unknown, path: string, visit: (s: string, path: string) => void): void {
  if (typeof value === 'string') visit(value, path)
  else if (Array.isArray(value)) value.forEach((v, i) => walkStrings(v, `${path}[${i}]`, visit))
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) walkStrings(v, path ? `${path}.${k}` : k, visit)
}

// ---------------------------------------------------------------------------
// Static checks
// ---------------------------------------------------------------------------

interface Refs {
  flagsSet: Set<string>
  flagsUsed: Map<string, string>
  annualIds: Set<string>
  removeAnnual: Map<string, string>
}

function staticChecks(content: Content, sceneFiles: Map<string, string>): Refs {
  const refs: Refs = { flagsSet: new Set(), flagsUsed: new Map(), annualIds: new Set(), removeAnnual: new Map() }
  const scenes = new Map(content.scenes.map((s) => [s.id, s]))
  const ids = {
    paths: new Set(content.paths.map((p) => p.id)),
    employers: new Map(content.employers.map((e) => [e.id, e])),
    facts: new Set(content.facts.map((f) => f.id)),
    templates: new Set(content.aiTemplates.map((t) => t.id)),
    characters: new Set(content.characters.map((c) => c.id)),
    badges: new Set(content.constants.badges.map((b) => b.id)),
    origins: new Set(content.profiles.origins.map((o) => o.id)),
    budgets: new Set(content.profiles.budgets.map((o) => o.id)),
    traits: new Set(content.profiles.traits.map((o) => o.id)),
  }
  const sceneWhere = (s: Scene) => `${sceneFiles.get(s.id) ?? 'scenes'} → ${s.id}`

  // Unique ids per collection
  const uniq = (name: string, list: { id: string }[]) => {
    const seen = new Set<string>()
    for (const it of list) {
      if (seen.has(it.id)) add('error', name, `duplicate id "${it.id}"`)
      seen.add(it.id)
    }
  }
  uniq('scenes', content.scenes)
  uniq('assos', content.assos)
  uniq('destinations', content.destinations)
  uniq('paths', content.paths)
  uniq('employers', content.employers)
  uniq('startupSectors', content.startupSectors)
  uniq('aiTemplates', content.aiTemplates)
  uniq('facts', content.facts)
  uniq('endings', content.endings)
  uniq('characters', content.characters)
  uniq('constants.badges', content.constants.badges)
  uniq('constants.aiEventSlots', content.constants.aiEventSlots)
  uniq('profiles.origins', content.profiles.origins)
  uniq('profiles.budgets', content.profiles.budgets)
  uniq('profiles.traits', content.profiles.traits)

  // Conditions
  const checkCond = (cond: Cond | undefined, where: string) => {
    if (cond === undefined) return
    let node
    try {
      node = parseCondition(cond)
    } catch (e) {
      add('error', where, e instanceof ConditionError ? e.message : String(e))
      return
    }
    walkCondition(node, (leaf) => {
      if (leaf.t === 'flag') {
        if (!refs.flagsUsed.has(leaf.name)) refs.flagsUsed.set(leaf.name, where)
      } else if (leaf.t === 'cat') {
        const v = leaf.value
        if (leaf.key === 'path' && v !== 'none' && !ids.paths.has(v)) add('error', where, `unknown path "${v}"`)
        if (leaf.key === 'employer' && v !== 'none' && !ids.employers.has(v)) add('error', where, `unknown employer "${v}"`)
        if (leaf.key === 'profile.origin' && !ids.origins.has(v)) add('error', where, `unknown origin "${v}"`)
        if (leaf.key === 'profile.budget' && !ids.budgets.has(v)) add('error', where, `unknown budget "${v}"`)
        if (leaf.key === 'profile.trait' && !ids.traits.has(v)) add('error', where, `unknown trait "${v}"`)
      } else if (leaf.t === 'chose') {
        const sc = scenes.get(leaf.sceneId)
        if (!sc) add('error', where, `chose: unknown scene "${leaf.sceneId}"`)
        else if (leaf.choiceId !== undefined && !choiceIdsOf(content, sc).has(leaf.choiceId))
          add('error', where, `chose: scene "${leaf.sceneId}" has no choice "${leaf.choiceId}"`)
      }
    })
  }

  const checkEffects = (e: Effects | undefined, where: string) => {
    if (!e) return
    for (const f of e.flags ?? []) refs.flagsSet.add(f)
    if (e.factId && !ids.facts.has(e.factId)) add('error', where, `unknown factId "${e.factId}"`)
    for (const fp of e.footprint ?? []) {
      if (fp.factId && !ids.facts.has(fp.factId)) add('error', where, `unknown footprint factId "${fp.factId}"`)
      if (fp.annual) refs.annualIds.add(fp.annual.id)
      for (const id of fp.removeAnnual ?? []) if (!refs.removeAnnual.has(id)) refs.removeAnnual.set(id, where)
      if (fp.annual && fp.annual.years === undefined && fp.annual.untilAge === undefined && fp.annual.tPerYear > 0 && fp.category === 'flights')
        add('info', where, `annual flights modifier "${fp.annual.id}" lasts until death`)
    }
    if (e.path) {
      if (!ids.paths.has(e.path.pathId)) add('error', where, `unknown pathId "${e.path.pathId}"`)
      if (e.path.employerId) {
        const emp = ids.employers.get(e.path.employerId)
        if (!emp) add('error', where, `unknown employerId "${e.path.employerId}"`)
        else if (emp.pathId !== e.path.pathId)
          add('warn', where, `employer "${emp.id}" belongs to path "${emp.pathId}", not "${e.path.pathId}"`)
      }
    }
    for (const id of e.skipScenes ?? []) if (!scenes.has(id)) add('error', where, `skipScenes: unknown scene "${id}"`)
    for (const b of e.badges ?? []) if (!ids.badges.has(b)) add('error', where, `unknown badge "${b}"`)
    if (e.text && e.text.length > MAX_TEXT) add('warn', where, `consequence text is ${e.text.length} chars (> ${MAX_TEXT})`)
  }

  const checkChoice = (c: Choice, where: string, opts: { lockable?: boolean } = {}) => {
    if (c.label.length > MAX_LABEL) add('error', where, `label is ${c.label.length} chars (> ${MAX_LABEL}): "${c.label}"`)
    if (c.label.trim() === '') add('error', where, 'empty label')
    checkCond(c.conditions, `${where}.conditions`)
    checkCond(c.visibleIf, `${where}.visibleIf`)
    if (c.conditions !== undefined && !c.lockedReason && opts.lockable !== false)
      add('error', where, 'has conditions but no lockedReason (locked choices must show a reason)')
    if (c.hint && /(^|[\s(])[+−]\s?\d/.test(c.hint)) add('warn', where, `hint shows stat numbers: "${c.hint}"`)
    checkEffects(c.effects, `${where}.effects`)
    if (c.chance) {
      checkEffects(c.chance.success, `${where}.chance.success`)
      checkEffects(c.chance.failure, `${where}.chance.failure`)
    }
    if (c.next) {
      const target = scenes.get(c.next)
      if (!target) add('error', where, `next: unknown scene "${c.next}"`)
      else if (!target.followUpOnly) add('error', where, `next: scene "${c.next}" must have followUpOnly: true`)
    }
  }

  // Scenes
  const followTargets = new Set<string>()
  for (const s of content.scenes) for (const c of s.choices) if (c.next) followTargets.add(c.next)
  for (const pool of [content.assos, content.destinations, content.employers, content.startupSectors])
    for (const c of pool) if (c.next) followTargets.add(c.next)
  for (const slot of content.constants.aiEventSlots) followTargets.add(slot.fallbackSceneId)

  const majors = content.scenes.filter((s) => s.kind === 'major' && !s.followUpOnly)
  const orders = new Map<number, string>()
  for (const m of majors) {
    const where = sceneWhere(m)
    if (m.order === undefined) add('error', where, 'major without order')
    else {
      if (!Number.isInteger(m.order) || m.order < 1 || m.order > 20) add('error', where, `major order ${m.order} outside 1..20`)
      if (orders.has(m.order)) add('error', where, `major order ${m.order} already used by "${orders.get(m.order)}"`)
      orders.set(m.order, m.id)
    }
    if (m.age === undefined) add('error', where, 'major without age')
  }
  if (majors.length !== 20) add('warn', 'scenes', `${majors.length} majors (design: 20)`)
  const missingOrders = Array.from({ length: 20 }, (_, i) => i + 1).filter((o) => !orders.has(o))
  if (missingOrders.length && majors.length) add('warn', 'scenes', `major orders missing: ${missingOrders.join(', ')}`)
  const sortedMajors = majors.filter((m) => m.order !== undefined).sort((a, b) => a.order! - b.order!)
  for (let i = 1; i < sortedMajors.length; i++) {
    const a = sortedMajors[i - 1]
    const b = sortedMajors[i]
    if (a.age !== undefined && b.age !== undefined && b.age < a.age)
      add('warn', sceneWhere(b), `major order ${b.order} (age ${b.age}) is younger than order ${a.order} (age ${a.age})`)
  }

  for (const s of content.scenes) {
    const where = sceneWhere(s)
    if (s.text.length > MAX_TEXT) add('error', where, `base text is ${s.text.length} chars (> ${MAX_TEXT})`)
    if (!s.text.trim()) add('error', where, 'empty base text')
    for (const [i, v] of (s.variants ?? []).entries()) {
      if (v.text && v.text.length > MAX_TEXT) add('error', `${where}.variants[${i}]`, `variant text is ${v.text.length} chars (> ${MAX_TEXT})`)
      checkCond(v.conditions, `${where}.variants[${i}].conditions`)
      checkEffects(v.effects, `${where}.variants[${i}].effects`)
    }
    checkCond(s.conditions, `${where}.conditions`)
    if (s.speaker && !ids.characters.has(s.speaker)) add('error', where, `unknown speaker "${s.speaker}"`)
    if (s.kind === 'mini' && !s.followUpOnly && s.age === undefined) add('error', where, 'mini without age (it can never happen)')
    if (s.kind === 'event' && !s.followUpOnly && s.family !== 'consequence' && !s.window && s.age === undefined)
      add('warn', where, 'event without window/age that is not a consequence: it never fires on its own')
    if (s.window && s.window[0] > s.window[1]) add('error', where, `window [${s.window}] is reversed`)
    if (s.followUpOnly && !followTargets.has(s.id)) add('warn', where, 'followUpOnly scene that no choice leads to')
    if (s.repeatable && s.cooldownYears === undefined) add('info', where, 'repeatable without cooldownYears (engine default: 5 years)')
    if (s.dynamic?.type === 'jobOffers')
      for (const p of s.dynamic.paths ?? []) if (!ids.paths.has(p)) add('error', where, `dynamic.paths: unknown path "${p}"`)
    if (!s.dynamic && s.choices.length === 0) add('error', where, 'scene without choices')
    if (s.dynamic) {
      const poolIds = poolIdsOf(content, s)
      for (const c of s.choices) if (poolIds.has(c.id)) add('warn', `${where}.choices.${c.id}`, 'static choice id collides with a pool id')
    }
    const seen = new Set<string>()
    for (const c of s.choices) {
      if (seen.has(c.id)) add('error', where, `duplicate choice id "${c.id}"`)
      seen.add(c.id)
      checkChoice(c, `${where}.choices.${c.id}`)
      // Time jumps that skip non-mandatory majors
      const years = c.effects?.years ?? 0
      if (years > 0 && s.age !== undefined) {
        for (const m of majors) {
          if (m.id === s.id || m.mandatory || m.age === undefined) continue
          if (m.age >= s.age && m.age < s.age + years && (m.order ?? 0) > (s.order ?? -1))
            add('warn', `${where}.choices.${c.id}`, `${years}-year jump skips major "${m.id}" (age ${m.age}) unless it is mandatory`)
        }
      }
    }
  }

  // Pools
  for (const a of content.assos) checkChoice(a, `assos → ${a.id}`)
  for (const d of content.destinations) checkChoice(d, `destinations → ${d.id}`)
  for (const e of content.employers) {
    checkChoice(e, `employers → ${e.id}`)
    if (!ids.paths.has(e.pathId)) add('error', `employers → ${e.id}`, `unknown pathId "${e.pathId}"`)
  }
  for (const s of content.startupSectors) {
    checkChoice(s, `startupSectors → ${s.id}`)
    checkEffects(s.success, `startupSectors → ${s.id}.success`)
    checkEffects(s.failure, `startupSectors → ${s.id}.failure`)
  }
  for (const t of content.aiTemplates) {
    t.outcomes.forEach((o, i) => checkEffects(o.effects, `aiTemplates → ${t.id}.outcomes[${i}]`))
    const total = t.outcomes.reduce((a, o) => a + o.p, 0)
    if (total > 1 + 1e-6) add('warn', `aiTemplates → ${t.id}`, `outcome p sum to ${total.toFixed(2)} (> 1, normalised)`)
    if (total < 1 - 1e-6) add('info', `aiTemplates → ${t.id}`, `outcome p sum to ${total.toFixed(2)}: the rest means "nothing happens"`)
  }
  for (const list of [content.profiles.origins, content.profiles.budgets, content.profiles.traits])
    for (const o of list) checkEffects(o.effects, `profiles → ${o.id}`)
  checkEffects(content.constants.promotion.effects, 'constants.promotion')
  for (const e of content.endings) checkCond(e.conditions, `endings → ${e.id}`)
  for (const c of content.characters) checkCond(c.knownIf, `characters → ${c.id}.knownIf`)

  // Constants
  const k = content.constants
  for (const slot of k.aiEventSlots) {
    const fb = scenes.get(slot.fallbackSceneId)
    if (!fb) add('error', `constants.aiEventSlots → ${slot.id}`, `unknown fallbackSceneId "${slot.fallbackSceneId}"`)
    else {
      if (fb.kind !== 'event') add('warn', `constants.aiEventSlots → ${slot.id}`, `fallback "${fb.id}" is a ${fb.kind}, expected an event`)
      if (!fb.followUpOnly) add('error', `constants.aiEventSlots → ${slot.id}`, `fallback "${fb.id}" must be followUpOnly`)
    }
  }
  for (const id of k.surpriseOfferTemplateIds)
    if (!ids.templates.has(id)) add('error', 'constants.surpriseOfferTemplateIds', `unknown template "${id}"`)
  const employerNames = new Set(content.employers.map((e) => e.name.toLowerCase()))
  const surpriseNames = new Set<string>()
  for (const e of k.surpriseEmployers) {
    const where = `constants.surpriseEmployers → ${e.name}`
    if (!content.paths.some((p) => p.id === e.pathId)) add('error', where, `unknown path "${e.pathId}"`)
    if (employerNames.has(e.name.toLowerCase())) add('error', where, 'already a regular employer (the surprise must be a new name)')
    if (surpriseNames.has(e.name.toLowerCase())) add('error', where, 'duplicate name')
    surpriseNames.add(e.name.toLowerCase())
  }
  if (content.scenes.some((s) => s.dynamic?.type === 'exchange'))
    for (const continent of EXCHANGE_CONTINENTS)
      if (!content.destinations.some((d) => d.continent === continent))
        add('error', 'destinations', `no destination on continent "${continent}"`)
  if (content.endings.length === 0) add('error', 'endings', 'no endings')

  // Flags
  for (const [flag, where] of refs.flagsUsed)
    if (!refs.flagsSet.has(flag) && flag !== 'low_carbon_comfort') add('warn', where, `flag "${flag}" is tested but never set`)
  for (const flag of Object.keys(k.flagMemories))
    if (!refs.flagsSet.has(flag)) add('warn', 'constants.flagMemories', `memory for flag "${flag}" that is never set`)
  for (const [id, where] of refs.removeAnnual)
    if (!refs.annualIds.has(id) && !id.startsWith('path:') && id !== 'auto:rich')
      add('warn', where, `removeAnnual "${id}" matches no annual modifier`)
  return refs
}

function poolIdsOf(content: Content, s: Scene): Set<string> {
  switch (s.dynamic?.type) {
    case 'assoDraw':
      return new Set(content.assos.map((a) => a.id))
    case 'exchange':
      return new Set(content.destinations.map((d) => d.id))
    case 'jobOffers': {
      const paths = s.dynamic.paths
      return new Set([
        ...content.employers.filter((e) => !paths || paths.includes(e.pathId)).map((e) => e.id),
        ...(s.dynamic.aiSurprise ? ['ai_surprise'] : []),
      ])
    }
    case 'startupSectors':
      return new Set(content.startupSectors.map((x) => x.id))
    default:
      return new Set()
  }
}

function choiceIdsOf(content: Content, s: Scene): Set<string> {
  return new Set([...s.choices.map((c) => c.id), ...poolIdsOf(content, s)])
}

// ---------------------------------------------------------------------------
// Forbidden strings
// ---------------------------------------------------------------------------

function forbiddenStrings(jsonFiles: { rel: string; data: unknown }[]): void {
  for (const { rel, data } of jsonFiles) {
    walkStrings(data, '', (s, path) => {
      const hits = CITATION_PATH.test(path) ? [] : brandHits(s)
      if (hits.length) add('error', `${rel} → ${path}`, `real brand name(s) ${hits.join(', ')}: use the parody name (GAME_DESIGN.md §0)`)
      if (profHit(s)) add('error', `${rel} → ${path}`, 'the professor is only ever "PM" (full name found)')
      const old = OLD_NAMES.filter((n) => wordRe(n, '').test(s))
      if (old.length) add('warn', `${rel} → ${path}`, `old invented name(s) ${old.join(', ')}: use the parody names (GAME_DESIGN.md §0)`)
    })
  }
  // The professor's name must not appear anywhere in the repo's text files either.
  const scanDirs = ['src', 'server', 'api', 'tools', 'docs', 'public']
  const exts = /\.(ts|tsx|js|mjs|json|md|html|css|txt)$/
  const visit = (dir: string) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      const p = join(dir, name)
      const st = statSync(p)
      if (st.isDirectory()) visit(p)
      else if (exts.test(name) && st.size < 2_000_000) {
        const lines = readFileSync(p, 'utf8').split('\n')
        lines.forEach((line, i) => {
          if (profHit(line)) add('error', `${relative(ROOT, p)}:${i + 1}`, 'the professor is only ever "PM" (full name found)')
        })
      }
    }
  }
  for (const d of scanDirs) visit(join(ROOT, d))
  for (const f of ['README.md', 'CLAUDE.md', 'index.html']) {
    const p = join(ROOT, f)
    if (existsSync(p))
      readFileSync(p, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (profHit(line)) add('error', `${f}:${i + 1}`, 'the professor is only ever "PM" (full name found)')
        })
  }
}

// ---------------------------------------------------------------------------
// Reachability by simulation
// ---------------------------------------------------------------------------

function reachability(content: Content): void {
  const shown = new Set<string>()
  const chosen = new Map<string, Set<string>>()
  const offered = new Set<string>()
  const endings = new Map<string, number>()
  const errors = new Map<string, number>()
  const deathAges: number[] = []
  let maxMajors = 0
  let fallbackEndings = 0
  const t0 = performance.now()
  for (let seed = 0; seed < SIM_LIVES; seed++) {
    try {
      const s = playLife(content, seed, {
        onDecision: (d) => {
          shown.add(d.sceneId)
          for (const id of d.unlocked) offered.add(`${d.sceneId}:${id}`)
          let set = chosen.get(d.sceneId)
          if (!set) chosen.set(d.sceneId, (set = new Set()))
          set.add(d.picked)
        },
      })
      const sum = summarize(content, s)
      endings.set(sum.title.id, (endings.get(sum.title.id) ?? 0) + 1)
      if (!evaluate(sum.title.conditions, makeEnv(content, s, { metrics: endFigures(content, s).metrics }))) fallbackEndings++
      deathAges.push(sum.deathAge)
      const majors = s.history.filter((h) => h.kind === 'major' && !content.scenes.find((x) => x.id === h.sceneId)?.followUpOnly).length
      maxMajors = Math.max(maxMajors, majors)
      const bad = findNonFinite(sum)
      if (bad.length) errors.set(`non-finite numbers in the summary: ${bad.slice(0, 3).join(', ')}`, (errors.get('nan') ?? 0) + 1)
    } catch (e) {
      const msg = (e as Error).message
      errors.set(msg, (errors.get(msg) ?? 0) + 1)
    }
  }
  const ms = performance.now() - t0
  for (const [msg, n] of errors) add('error', 'simulation', `${msg} (${n} of ${SIM_LIVES} lives)`)
  if (maxMajors > 20) add('error', 'simulation', `a life had ${maxMajors} majors (> 20)`)
  const minDeath = Math.min(...deathAges)
  const maxDeath = Math.max(...deathAges)
  if (deathAges.length && (minDeath < 76 || maxDeath > 98)) add('error', 'simulation', `death ages ${minDeath}–${maxDeath} outside [76, 98]`)

  const list = (xs: string[], max = 12) => (xs.length > max ? `${xs.slice(0, max).join(', ')} … (+${xs.length - max})` : xs.join(', '))
  const neverMajors = content.scenes.filter((s) => s.kind === 'major' && !s.followUpOnly && !shown.has(s.id)).map((s) => s.id)
  if (neverMajors.length) add('warn', 'reachability', `majors never reached: ${list(neverMajors)}`)
  const neverEvents = content.scenes.filter((s) => s.kind === 'event' && !shown.has(s.id)).map((s) => s.id)
  if (neverEvents.length) add('warn', 'reachability', `events never fired: ${list(neverEvents)}`)
  const neverMinis = content.scenes.filter((s) => s.kind === 'mini' && !shown.has(s.id)).map((s) => s.id)
  if (neverMinis.length) add('warn', 'reachability', `minis never shown: ${list(neverMinis)}`)
  const neverChosen: string[] = []
  for (const s of content.scenes) {
    if (!shown.has(s.id)) continue
    const picked = chosen.get(s.id) ?? new Set()
    const ids = s.dynamic ? [...choiceIdsOf(content, s)].filter((id) => id !== 'ai_surprise') : s.choices.map((c) => c.id)
    for (const id of ids) if (!picked.has(id)) neverChosen.push(`${s.id}:${id}${offered.has(`${s.id}:${id}`) ? '' : ' (never unlocked)'}`)
  }
  if (neverChosen.length) add('warn', 'reachability', `choices never chosen (${neverChosen.length}): ${list(neverChosen, 25)}`)
  if (fallbackEndings > 0)
    add('warn', 'reachability', `${fallbackEndings} lives matched no ending condition (fell back to the lowest-priority ending): make it unconditional ("true")`)
  const neverEndings = content.endings.filter((e) => !endings.has(e.id)).map((e) => e.id)
  if (neverEndings.length) add('warn', 'reachability', `endings never obtained: ${list(neverEndings)}`)
  const dist = [...endings.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${((100 * n) / SIM_LIVES).toFixed(1)}%`)
  add('info', 'reachability', `${SIM_LIVES} random lives in ${(ms / 1000).toFixed(1)} s (${(ms / SIM_LIVES).toFixed(2)} ms/life); death ${minDeath}–${maxDeath}; endings: ${list(dist, 10)}`)
}

// ---------------------------------------------------------------------------

async function main() {
  const loaded = await loadContent()
  issues.push(...loaded.issues)
  if (loaded.jsonFiles.length) forbiddenStrings(loaded.jsonFiles)
  if (loaded.content) {
    add('info', 'content', `loaded from ${loaded.source === 'index' ? 'src/content/index.ts' : 'JSON files'}: ${loaded.content.scenes.length} scenes, ${loaded.content.employers.length} employers, ${loaded.content.facts.length} facts`)
    let staticOk = true
    try {
      staticChecks(loaded.content, loaded.sceneFiles)
    } catch (e) {
      staticOk = false
      add('error', 'check-data', `static checks crashed: ${(e as Error).stack ?? e}`)
    }
    if (staticOk) reachability(loaded.content)
    else add('warn', 'reachability', 'skipped (static checks crashed)')
  }

  const order: Level[] = ['error', 'warn', 'info']
  const icon: Record<Level, string> = { error: 'ERROR', warn: 'warn ', info: 'info ' }
  for (const level of order) {
    const group = issues.filter((i) => i.level === level)
    if (!group.length) continue
    console.log(`\n${level.toUpperCase()}S (${group.length})`)
    for (const i of group) console.log(`  ${icon[level]} ${i.where}: ${i.message}`)
  }
  const errors = issues.filter((i) => i.level === 'error').length
  const warns = issues.filter((i) => i.level === 'warn').length
  console.log(`\ncheck-data: ${errors} error(s), ${warns} warning(s)`)
  process.exit(errors > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('check-data crashed:', e)
  process.exit(1)
})
