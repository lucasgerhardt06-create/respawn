import { describe, expect, it } from 'vitest'
import { content, parseContent, rawContent } from './index'
import type { Choice, Cond, Effects, Scene } from './schema'

/** Real companies / brands / people that must never appear in player-facing content. */
const FORBIDDEN = [
  'Palantir', 'Google', 'Alphabet', 'Meta', 'Facebook', 'Instagram', 'WhatsApp', 'TikTok', 'Snapchat', 'LinkedIn',
  'Twitter', 'YouTube', 'Netflix', 'Spotify', 'OpenAI', 'ChatGPT', 'GPT-4', 'Mistral', 'Anthropic', 'DeepMind',
  'Apple', 'iPhone', 'Samsung', 'Huawei', 'Amazon', 'Microsoft', 'Nvidia', 'Tesla', 'SpaceX', 'Uber', 'Airbnb',
  'Deliveroo', 'Slack', 'Kaggle', 'Goldman', 'Morgan Stanley', 'JPMorgan', 'BlackRock', 'McKinsey', 'BCG', 'Bain & Company',
  'Deloitte', 'KPMG', 'PwC', 'Accenture', 'TotalEnergies', 'ExxonMobil', 'Exxon', 'Chevron', 'BNP', 'Société Générale',
  'LVMH', 'Kering', 'Airbus', 'Thales', 'Dassault', 'Safran', 'EDF', 'Engie', 'Ryanair', 'Air France', 'Doctolib',
  'BlaBlaCar', 'Station F', 'Burning Man', 'Bitcoin', 'Ethereum',
  // The professor's real first and last name, stored reversed so this file never contains them.
  ...['eppilihP', 'ueihtaM'].map((w) => w.split('').reverse().join('')),
]

/** Fields that are citations, not narrative (real organisations are allowed there). */
const CITATION_KEYS = new Set(['source', 'url'])

function collectStrings(value: unknown, out: { path: string; text: string }[], path = ''): void {
  if (typeof value === 'string') out.push({ path, text: value })
  else if (Array.isArray(value)) value.forEach((v, i) => collectStrings(v, out, `${path}[${i}]`))
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) if (!CITATION_KEYS.has(k)) collectStrings(v, out, path ? `${path}.${k}` : k)
}

function allChoices(): { where: string; choice: Choice }[] {
  const out: { where: string; choice: Choice }[] = []
  for (const s of content.scenes) for (const c of s.choices) out.push({ where: `scene ${s.id}`, choice: c })
  for (const a of content.assos) out.push({ where: 'assos', choice: a })
  for (const d of content.destinations) out.push({ where: 'destinations', choice: d })
  for (const e of content.employers) out.push({ where: 'employers', choice: e })
  for (const s of content.startupSectors) out.push({ where: 'startupSectors', choice: s })
  return out
}

function allEffects(): { where: string; effects: Effects }[] {
  const out: { where: string; effects: Effects }[] = []
  const push = (where: string, e: Effects | undefined) => e && out.push({ where, effects: e })
  for (const { where, choice } of allChoices()) {
    push(`${where} / ${choice.id}`, choice.effects)
    push(`${where} / ${choice.id} (success)`, choice.chance?.success)
    push(`${where} / ${choice.id} (failure)`, choice.chance?.failure)
  }
  for (const s of content.startupSectors) {
    push(`sector ${s.id} success`, s.success)
    push(`sector ${s.id} failure`, s.failure)
  }
  for (const s of content.scenes) for (const v of s.variants ?? []) push(`scene ${s.id} variant`, v.effects)
  for (const t of content.aiTemplates) t.outcomes.forEach((o, i) => push(`template ${t.id}[${i}]`, o.effects))
  push('promotion', content.constants.promotion.effects)
  for (const p of [...content.profiles.origins, ...content.profiles.budgets, ...content.profiles.traits])
    push(`profile ${p.id}`, p.effects)
  return out
}

function condLeaves(c: Cond | undefined, out: string[] = []): string[] {
  if (c === undefined) return out
  if (typeof c === 'string') out.push(c)
  else if ('all' in c) c.all.forEach((x) => condLeaves(x, out))
  else if ('any' in c) c.any.forEach((x) => condLeaves(x, out))
  else condLeaves(c.not, out)
  return out
}

describe('content bundle', () => {
  it('parses with the Zod contract', () => {
    expect(() => parseContent(rawContent)).not.toThrow()
    expect(content.scenes.length).toBeGreaterThan(40)
  })

  it('reports invalid content with paths', () => {
    const broken = { ...rawContent, facts: [{ id: 'x' }] }
    expect(() => parseContent(broken)).toThrow(/facts\[0\]/)
  })

  it('has unique ids in every pool', () => {
    const pools: Record<string, { id: string }[]> = {
      scenes: content.scenes,
      assos: content.assos,
      destinations: content.destinations,
      paths: content.paths,
      employers: content.employers,
      startupSectors: content.startupSectors,
      aiTemplates: content.aiTemplates,
      facts: content.facts,
      endings: content.endings,
      characters: content.characters,
      badges: content.constants.badges,
      aiEventSlots: content.constants.aiEventSlots,
      origins: content.profiles.origins,
      budgets: content.profiles.budgets,
      traits: content.profiles.traits,
    }
    for (const [name, items] of Object.entries(pools)) {
      const ids = items.map((i) => i.id)
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
      expect(dupes, `duplicate ids in ${name}`).toEqual([])
    }
  })

  it('has unique choice ids within each scene and globally across static scene choices', () => {
    const seen = new Map<string, string>()
    for (const s of content.scenes) {
      const ids = s.choices.map((c) => c.id)
      expect(new Set(ids).size, `duplicate choice id in ${s.id}`).toBe(ids.length)
      for (const id of ids) {
        expect(seen.get(id), `choice id ${id} reused in ${s.id}`).toBeUndefined()
        seen.set(id, s.id)
      }
    }
  })

  it('has exactly 20 majors c01..c20 with orders 1..20', () => {
    const majors = content.scenes.filter((s) => s.kind === 'major' && !s.followUpOnly)
    expect(majors).toHaveLength(20)
    const sorted = majors.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    sorted.forEach((m, i) => {
      expect(m.order).toBe(i + 1)
      expect(m.id.startsWith(`c${String(i + 1).padStart(2, '0')}_`), m.id).toBe(true)
      expect(m.age, `${m.id} needs an age`).toBeTypeOf('number')
    })
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].age!).toBeGreaterThanOrEqual(sorted[i - 1].age!)
  })

  it('points every `next` to a followUpOnly scene', () => {
    const byId = new Map(content.scenes.map((s) => [s.id, s]))
    for (const { where, choice } of allChoices()) {
      if (!choice.next) continue
      const target = byId.get(choice.next)
      expect(target, `${where} / ${choice.id} → ${choice.next}`).toBeDefined()
      expect(target!.followUpOnly, `${choice.next} must be followUpOnly`).toBe(true)
    }
  })

  it('wires AI slots, surprise templates, facts, badges, paths, employers and skipScenes', () => {
    const scenes = new Map<string, Scene>(content.scenes.map((s) => [s.id, s]))
    for (const slot of content.constants.aiEventSlots) {
      const fb = scenes.get(slot.fallbackSceneId)
      expect(fb, slot.fallbackSceneId).toBeDefined()
      expect(fb!.kind).toBe('event')
      expect(fb!.followUpOnly).toBe(true)
    }
    const templates = new Set(content.aiTemplates.map((t) => t.id))
    expect(content.constants.surpriseOfferTemplateIds.length).toBeGreaterThanOrEqual(3)
    for (const id of content.constants.surpriseOfferTemplateIds) expect(templates.has(id), id).toBe(true)
    expect(content.aiTemplates.length - content.constants.surpriseOfferTemplateIds.length).toBeGreaterThanOrEqual(10)

    const facts = new Set(content.facts.map((f) => f.id))
    const badges = new Set(content.constants.badges.map((b) => b.id))
    const paths = new Set(content.paths.map((p) => p.id))
    const employers = new Map(content.employers.map((e) => [e.id, e]))
    for (const e of content.employers) expect(paths.has(e.pathId), `${e.id}.pathId`).toBe(true)
    for (const { where, effects } of allEffects()) {
      if (effects.factId) expect(facts.has(effects.factId), `${where} factId ${effects.factId}`).toBe(true)
      for (const fp of effects.footprint ?? []) if (fp.factId) expect(facts.has(fp.factId), `${where} ${fp.factId}`).toBe(true)
      for (const b of effects.badges ?? []) expect(badges.has(b), `${where} badge ${b}`).toBe(true)
      for (const id of effects.skipScenes ?? []) expect(scenes.has(id), `${where} skip ${id}`).toBe(true)
      if (effects.path) {
        expect(paths.has(effects.path.pathId), `${where} path ${effects.path.pathId}`).toBe(true)
        if (effects.path.employerId) expect(employers.get(effects.path.employerId)?.pathId).toBe(effects.path.pathId)
      }
    }
    for (const s of content.scenes) if (s.speaker) expect(content.characters.some((c) => c.id === s.speaker), s.speaker).toBe(true)
  })

  it('gives every conditioned choice a lockedReason', () => {
    for (const { where, choice } of allChoices()) {
      if (choice.conditions !== undefined) expect(choice.lockedReason, `${where} / ${choice.id}`).toBeTruthy()
    }
  })

  it('uses display stat names in locked reasons, never raw keys', () => {
    const raw = /\b(money|skillAi|skillBusiness|skillSoft|intellect|contribution|energy|ethics|addiction|network|grades|fame)\s*(>=|<=|>|<|≥|≤)/
    for (const { where, choice } of allChoices()) {
      if (choice.lockedReason) expect(raw.test(choice.lockedReason), `${where} / ${choice.id}: ${choice.lockedReason}`).toBe(false)
    }
  })

  it('keeps hints number-free and labels short', () => {
    for (const { where, choice } of allChoices()) {
      if (choice.hint) {
        expect(/\d/.test(choice.hint), `${where} / ${choice.id} hint: ${choice.hint}`).toBe(false)
        expect(choice.hint.length, `${where} / ${choice.id} hint`).toBeLessThanOrEqual(60)
      }
      expect(choice.label.length, `${where} / ${choice.id} label`).toBeLessThanOrEqual(48)
    }
  })

  it('keeps base texts short enough for a phone', () => {
    for (const s of content.scenes) {
      expect(s.text.length, `${s.id} text`).toBeLessThanOrEqual(420)
      for (const v of s.variants ?? []) if (v.text) expect(v.text.length, `${s.id} variant`).toBeLessThanOrEqual(420)
    }
  })

  it('only references flags that some content sets', () => {
    const set = new Set<string>()
    for (const { effects } of allEffects()) for (const f of effects.flags ?? []) set.add(f)
    const used: string[] = []
    const visit = (c: Cond | undefined) => {
      for (const leaf of condLeaves(c)) {
        const m = /^!?\s*flag:(.+)$/.exec(leaf.trim())
        if (m) used.push(m[1].trim())
      }
    }
    for (const { choice } of allChoices()) {
      visit(choice.conditions)
      visit(choice.visibleIf)
    }
    for (const s of content.scenes) {
      visit(s.conditions)
      for (const v of s.variants ?? []) visit(v.conditions)
    }
    for (const e of content.endings) visit(e.conditions)
    for (const c of content.characters) visit(c.knownIf)
    for (const f of used) expect(set.has(f), `flag ${f} is never set`).toBe(true)
    for (const f of Object.keys(content.constants.flagMemories)) expect(set.has(f), `flagMemories.${f} is never set`).toBe(true)
  })

  it('uses only the generated background art keys', () => {
    const ART = new Set(
      'campus lecture party library dorm airport research exchange_asia exchange_west finance bigtech lab ngo garage home burnout beach retirement graveyard stage pandemic'.split(' '),
    )
    for (const s of content.scenes) expect(s.art !== undefined && ART.has(s.art), `${s.id} art "${s.art}"`).toBe(true)
  })

  it('has a fallback ending that always matches', () => {
    const sorted = content.endings.slice().sort((a, b) => b.priority - a.priority)
    const last = sorted[sorted.length - 1]
    expect(last.conditions).toBe('age >= 0')
    expect(content.endings.length).toBeGreaterThanOrEqual(14)
  })

  it('never names real companies or the professor', () => {
    const strings: { path: string; text: string }[] = []
    collectStrings(rawContent, strings)
    for (const word of FORBIDDEN) {
      const re = new RegExp(`(^|[^A-Za-z])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z]|$)`, 'i')
      const hits = strings.filter((s) => re.test(s.text)).map((s) => s.path)
      expect(hits, `forbidden "${word}"`).toEqual([])
    }
    const pm = content.characters.find((c) => c.id === 'pm')
    expect(pm?.name).toBe('PM')
  })

  it('meets the inventory minimums', () => {
    expect(content.assos.length).toBeGreaterThanOrEqual(18)
    for (const cat of ['sport', 'arts', 'corpo', 'impact'] as const)
      expect(content.assos.some((a) => a.category === cat), cat).toBe(true)
    expect(content.destinations).toHaveLength(13)
    expect(content.employers.length).toBeGreaterThanOrEqual(16)
    expect(content.startupSectors).toHaveLength(6)
    expect(content.facts.length).toBeGreaterThanOrEqual(25)
    expect(content.profiles.names.length).toBeGreaterThanOrEqual(24)
    // One AI event per life (pacing: ≤ 28 decisions per life, see tools/pacing.test.ts).
    expect(content.constants.aiEventSlots).toHaveLength(1)
  })
})
