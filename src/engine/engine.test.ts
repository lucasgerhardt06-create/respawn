import { describe, expect, it } from 'vitest'
import type { Content } from '../content/schema'
import { miniContent as content } from './__fixtures__/miniContent'
import { deepFreeze, playToScene, playUntil, sceneOf, stepTrace, variantContent } from './__fixtures__/play'
import { cloneState } from './clone'
import { engine } from './index'
import { makePending } from './scheduler'
import type { GameState } from './types'

const start = (seed = 11, c: Content = content) => engine.createGame(c, { seed, name: 'Robin' })

/** Builds the pending scene `sceneId` on a copy of `state` with stats tweaked first. */
function pendingWith(state: GameState, sceneId: string, tweak: (s: GameState) => void, c: Content = content): GameState {
  const s = cloneState(state)
  s.pending = undefined
  tweak(s)
  makePending(c, s, sceneId)
  return s
}

describe('createGame', () => {
  it('starts at 18 in arrival with a seeded profile and name', () => {
    const a = engine.createGame(content, { seed: 99 })
    const b = engine.createGame(content, { seed: 99 })
    expect(a).toEqual(b)
    expect(a.age).toBe(18)
    expect(a.phase).toBe('arrival')
    expect(content.profiles.names).toContain(a.player.name)
    expect(a.pending).toBeUndefined()
    expect(engine.createGame(content, { seed: 1, name: '  Zoé ' }).player.name).toBe('Zoé')
    const seeds = new Set(Array.from({ length: 40 }, (_, i) => engine.createGame(content, { seed: i }).player.profile.budgetId))
    expect(seeds.size).toBe(2)
  })

  it('keeps the onboarding info (sanitised) and derives pronouns from it', () => {
    const s = engine.createGame(content, { seed: 3, name: ' Lina ', lastName: '  Moreau ', gender: 'woman' })
    expect(s.player).toMatchObject({ name: 'Lina', lastName: 'Moreau', gender: 'woman' })
    expect(engine.createGame(content, { seed: 3, gender: 'robot' as never }).player.gender).toBeUndefined()
    const ctx = engine.buildAiContext(content, s)
    expect(ctx.lastName).toBe('Moreau')
    expect(ctx.pronouns).toEqual({ subject: 'she', object: 'her', possessive: 'her' })
    expect(engine.buildAiContext(content, engine.createGame(content, { seed: 3, gender: 'man' })).pronouns.subject).toBe('he')
    for (const gender of ['nonbinary', 'unspecified', undefined] as const)
      expect(engine.buildAiContext(content, engine.createGame(content, { seed: 3, gender })).pronouns).toEqual({
        subject: 'they',
        object: 'them',
        possessive: 'their',
      })
    const sum = engine.summarize(content, playUntil(content, s))
    expect(sum.player).toEqual({ name: 'Lina', lastName: 'Moreau', gender: 'woman' })
    expect(sum.name).toBe('Lina')
  })
})

describe('scheduler', () => {
  it('orders a life by age, minis by order before the major at the same age', () => {
    const trace = stepTrace(content, start())
    expect(trace.slice(0, 6)).toEqual(['c01_home', 'm_pm', 'm_party', 'f_3am', 'c02_asso', 'c03_exchange'])
    expect(trace[trace.length - 1]).toBe('end')
    expect(trace.indexOf('c08_money')).toBeLessThan(trace.indexOf('c09_legacy'))
  })

  it('follow-up > consequence > earliest timed item', () => {
    let s = playToScene(content, start(), 'm_party')
    s = cloneState(s)
    s.stats.energy = 10 // burnout condition now holds
    s = engine.choose(content, s, 'go').state
    expect(s.pending?.sceneId).toBe('f_3am') // follow-up first
    expect(sceneOf(content, s).isFollowUp).toBe(true)
    s = engine.resolveNext(content, engine.choose(content, s, 'home').state)
    expect(sceneOf(content, s).id).toBe('e_burnout') // consequence before c02_asso
    const after = engine.choose(content, s, 'rest')
    expect(after.outcome.years).toBe(1)
    expect(after.state.age).toBe(20)
    // c02_asso (age 19) was passed by the 1-year break: skipped
    expect(after.state.skipped).toContain('c02_asso')
    expect(sceneOf(content, engine.resolveNext(content, after.state)).id).toBe('c03_exchange')
  })

  it('ties at the same age: events, then minis, then AI slots, then the major', () => {
    const tie = variantContent(content, (c) => {
      c.scenes.find((x) => x.id === 'm_phone')!.age = 25
      c.scenes.find((x) => x.id === 'e_pandemic')!.window = [25, 25]
      c.constants.aiEventSlots[0].age = 25
    })
    const trace = stepTrace(tie, start(11, tie))
    const at = (id: string) => trace.indexOf(id)
    expect(at('e_pandemic')).toBeGreaterThan(-1)
    expect(at('e_pandemic')).toBeLessThan(at('m_phone'))
    expect(at('m_phone')).toBeLessThan(at('ai_slot:slot_career'))
    expect(at('ai_slot:slot_career')).toBeLessThan(at('c06_rhythm'))
  })

  it('resolveNext is idempotent and getStep is pure', () => {
    const s0 = start()
    const step = engine.getStep(content, s0) // computes without storing
    expect(s0.pending).toBeUndefined()
    const s1 = engine.resolveNext(content, s0)
    expect(engine.getStep(content, s1)).toEqual(step)
    expect(engine.resolveNext(content, s1)).toEqual(s1)
  })
})

describe('time jumps', () => {
  it('skip passed majors and minis, but windowed events and AI slots still fire after the jump', () => {
    let s = playToScene(content, start(), 'c05_job')
    const consulting = sceneOf(content, s).choices.find((c) => !c.locked && (c.id === 'sterling' || c.id === 'quill'))!
    s = playToScene(content, engine.choose(content, s, consulting.id).state, 'c06_rhythm')
    const jump = engine.choose(content, s, 'balanced')
    expect(jump.outcome.years).toBe(10)
    expect(jump.state.age).toBe(35)
    expect(jump.state.skipped).toEqual(expect.arrayContaining(['m_phone', 'c07_flagship']))
    s = jump.state
    // e_ai_shock (fire age 28) fires right after the jump, before any major
    for (let i = 0; i < 5; i++) {
      s = engine.resolveNext(content, s)
      const view = sceneOf(content, s)
      expect(view.kind).toBe('event')
      if (view.id === 'e_ai_shock') break
      s = engine.choose(content, s, view.choices[0].id).state
    }
    expect(s.pending?.sceneId).toBe('e_ai_shock')
    s = engine.resolveNext(content, engine.choose(content, s, 'accept').state)
    expect(s.bannedFields).toEqual(['consulting'])
    expect(s.path).toBeUndefined()
    expect(s.pathHistory.map((p) => p.pathId)).toEqual(['consulting'])
    // the AI slot (age 30) comes right after
    expect(engine.getStep(content, s)).toMatchObject({ type: 'ai_slot', slotId: 'slot_career', age: 35 })
  })

  it('mandatory majors survive a jump', () => {
    const long = (mandatory: boolean) =>
      variantContent(content, (c) => {
        c.scenes.find((x) => x.id === 'c04_after')!.choices.find((x) => x.id === 'master')!.effects!.years = 3
        c.scenes.find((x) => x.id === 'c05_job')!.mandatory = mandatory
      })
    const withM = long(true)
    let s = playToScene(withM, start(11, withM), 'c04_after')
    s = engine.resolveNext(withM, engine.choose(withM, s, 'master').state)
    expect(s.age).toBe(25)
    expect(sceneOf(withM, s).id).toBe('c05_job')
    const without = long(false)
    let t = playToScene(without, start(11, without), 'c04_after')
    t = engine.choose(without, t, 'master').state
    expect(t.skipped).toContain('c05_job')
  })
})

describe('dynamic choices', () => {
  const base = start()

  it('assoDraw: one asso per category, then the static "no association"', () => {
    const s = playToScene(content, base, 'c02_asso')
    const choices = sceneOf(content, s).choices
    expect(choices).toHaveLength(5)
    expect(choices[4].id).toBe('no_asso')
    const cats = choices.slice(0, 4).map((c) => content.assos.find((a) => a.id === c.id)!.category)
    expect(new Set(cats).size).toBe(4)
    // frozen: viewing twice gives the same draw
    expect(sceneOf(content, s).choices).toEqual(choices)
  })

  it('assoDraw: conditions false → greyed with lockedReason (shown, not hidden)', () => {
    const onlyUtopia = variantContent(content, (c) => {
      c.assos = c.assos.filter((a) => a.id !== 'asso_automatants')
    })
    const s = playToScene(onlyUtopia, start(11, onlyUtopia), 'c02_asso')
    const utopia = sceneOf(onlyUtopia, s).choices.find((c) => c.id === 'asso_utopia')!
    expect(utopia).toMatchObject({ locked: true, lockedReason: 'Requires grades of 90' })
    expect(() => engine.choose(onlyUtopia, s, 'asso_utopia')).toThrow(/locked/)
  })

  it('exchange: each continent appears exactly once, nothing locked, grades play no part', () => {
    const continentOf = (id: string) => content.destinations.find((d) => d.id === id)!.continent
    for (const grades of [5, 55, 95]) {
      const choices = sceneOf(content, pendingWith(base, 'c03_exchange', (s) => (s.stats.grades = grades))).choices
      expect(choices.map((c) => continentOf(c.id))).toEqual(['europe', 'north_america', 'south_america', 'asia_oceania'])
      expect(choices.every((c) => !c.locked)).toBe(true)
    }
  })

  it('exchange: same seed = same draw', () => {
    const draw = (seed: number) =>
      sceneOf(content, pendingWith(start(seed), 'c03_exchange', () => {})).choices.map((c) => c.id)
    expect(draw(42)).toEqual(draw(42))
    const draws = new Set(Array.from({ length: 30 }, (_, i) => draw(i).join(',')))
    expect(draws.size).toBeGreaterThan(1)
  })

  it('exchange: each card shows the trip footprint', () => {
    const choices = sceneOf(content, pendingWith(base, 'c03_exchange', () => {})).choices
    for (const c of choices) {
      const d = content.destinations.find((x) => x.id === c.id)!
      expect(c.hint).toMatch(new RegExp(` · ${d.city} · ${d.byTrain ? 'Train' : 'Plane'} ≈ \\d+\\.\\d+ t$`))
    }
  })

  it('exchange: choosing sets state.exchange and the trip footprint (train → travel)', () => {
    const s = pendingWith(base, 'c03_exchange', () => {})
    const offered = sceneOf(content, s).choices.map((c) => content.destinations.find((d) => d.id === c.id)!)
    const train = offered.find((d) => d.byTrain)!
    const plane = offered.find((d) => !d.byTrain)!
    const r = engine.choose(content, s, train.id)
    expect(r.state.exchange).toEqual({ destinationId: train.id })
    const trip = r.state.footprint.oneOffs.at(-1)!
    expect(trip).toMatchObject({ category: 'travel', t: train.tripT, sourceSceneId: 'c03_exchange' })
    expect(r.outcome.tonnes).toBeCloseTo(train.tripT)
    const f = engine.choose(content, s, plane.id)
    expect(f.state.footprint.oneOffs.at(-1)).toMatchObject({ category: 'flights', t: plane.tripT })
  })

  it('jobOffers: eligible draw + highest-prestige locked showcase + static choices', () => {
    const s = pendingWith(base, 'c05_job', () => {})
    const choices = sceneOf(content, s).choices
    const unlocked = choices.filter((c) => !c.locked && c.id !== 'no_job')
    expect(unlocked).toHaveLength(2)
    for (const c of unlocked) expect(['sterling', 'quill', 'unilab']).toContain(c.id)
    const locked = choices.filter((c) => c.locked)
    expect(locked).toEqual([
      { id: 'panoptis', label: 'Palantire', hint: 'Defense analytics.', locked: true, lockedReason: 'Requires an AI club background' },
    ])
    expect(choices.at(-1)!.id).toBe('no_job')

    const allEligible = sceneOf(
      content,
      pendingWith(base, 'c05_job', (x) => {
        x.flags.push('TECH')
        x.stats.skillAi = 80
      }),
    ).choices
    expect(allEligible.filter((c) => c.locked)).toHaveLength(0)
  })

  it('jobOffers: banned fields after an AI job loss show the AI-shock reason', () => {
    const s = pendingWith(base, 'c05_job', (x) => (x.bannedFields = ['consulting']))
    const choices = sceneOf(content, s).choices
    expect(choices.filter((c) => !c.locked).map((c) => c.id)).toEqual(['unilab', 'no_job'])
    expect(choices.find((c) => c.locked)).toMatchObject({
      id: 'panoptis',
      lockedReason: 'No one in consulting hires after the AI shock',
    })
  })

  it('hiring sets the path, the default promotion chance, and the path footprint modifier', () => {
    const s = pendingWith(base, 'c05_job', (x) => (x.bannedFields = []))
    const view = sceneOf(content, s)
    const pick = view.choices.find((c) => c.id === 'sterling' || c.id === 'quill')!
    const r = engine.choose(content, s, pick.id)
    expect(r.state.path).toMatchObject({ pathId: 'consulting', employerId: pick.id, sinceAge: 18 })
    expect(r.state.promotionChance).toBe(0.5)
    expect(r.state.footprint.modifiers.find((m) => m.id === 'path:consulting')).toMatchObject({
      tPerYear: 1.8,
      sourceSceneId: 'c05_job',
    })
    expect(r.outcome.tonnes).toBeGreaterThan(0)
    const banned = pendingWith(base, 'c05_job', (x) => (x.bannedFields = ['consulting']))
    const uni = engine.choose(content, banned, 'unilab')
    expect(uni.state.promotionChance).toBe(0.1) // employer effects override the path default
  })

  it('surprise offer: validated, inserted before static choices, rolls its template on hire', () => {
    const s = pendingWith(base, 'c05_job', () => {})
    expect(engine.surpriseMenu(content, s).map((m) => m.name)).toContain('Nimbus Labs')
    const offer = { employerName: 'Nimbus Labs', tagline: 'Cloud-free AI', pathId: 'research', templateId: 'offer_solid', pitch: 'Join us.' }
    const withOffer = engine.injectSurpriseOffer(content, s, offer)
    const ids = sceneOf(content, withOffer).choices.map((c) => c.id)
    expect(ids.indexOf('ai_surprise')).toBe(ids.length - 2)
    expect(ids.at(-1)).toBe('no_job')
    expect(sceneOf(content, withOffer).choices.find((c) => c.id === 'ai_surprise')).toMatchObject({
      label: 'Nimbus Labs',
      hint: 'Cloud-free AI',
      locked: false,
    })
    // invalid offers are ignored
    for (const bad of [
      null,
      { ...offer, templateId: 'big_risk' },
      { ...offer, employerName: '  ' },
      { ...offer, employerName: 'Invented Corp' }, // not in constants.surpriseEmployers
    ])
      expect(engine.injectSurpriseOffer(content, s, bad as never)).toEqual(s)
    // the menu fixes the path, whatever the AI says; the canonical spelling is kept
    const fixed = engine.injectSurpriseOffer(content, s, { ...offer, employerName: 'nimbus labs', pathId: 'nope' })
    expect(fixed.pending?.surpriseOffer).toMatchObject({ employerName: 'Nimbus Labs', pathId: 'research' })
    const banned = pendingWith(base, 'c05_job', (x) => (x.bannedFields = ['research']))
    expect(engine.surpriseMenu(content, banned).map((m) => m.name)).not.toContain('Nimbus Labs')
    expect(engine.injectSurpriseOffer(content, banned, offer).pending).toEqual(banned.pending)
    expect(engine.injectSurpriseOffer(content, withOffer, offer)).toEqual(withOffer) // only once
    const notJobs = pendingWith(base, 'c04_after', () => {})
    expect(engine.injectSurpriseOffer(content, notJobs, offer)).toEqual(notJobs)

    const hired = engine.choose(content, withOffer, 'ai_surprise')
    expect(hired.state.path).toMatchObject({ pathId: 'research', employerName: 'Nimbus Labs' })
    expect(hired.state.path?.employerId).toBeUndefined()
    expect(hired.outcome.deltas.money).toBeGreaterThan(0)
  })

  it('startup sectors: follow-up scene, success roll, startup state, meta merge', () => {
    let s = playToScene(content, start(), 'c06_rhythm')
    s = engine.choose(content, s, 'startup').state
    const view = sceneOf(content, s)
    expect(view.id).toBe('f_startup')
    expect(view.choices.map((c) => c.id)).toEqual(['s_climate', 's_fintech'])
    const r = engine.choose(content, s, 's_climate')
    expect(r.state.startup?.sectorId).toBe('s_climate')
    expect(['success', 'failure']).toContain(r.state.startup?.outcome)
    expect(r.outcome.chance).toBe(r.state.startup?.outcome)
    const named = engine.setStartupMeta(r.state, { name: 'Coolr', pitch: 'Heat pumps for data centres', sectorId: 'hack' })
    expect(named.startup).toMatchObject({ sectorId: 's_climate', name: 'Coolr', pitch: 'Heat pumps for data centres' })
    expect(r.state.startup?.name).toBeUndefined()
  })
})

describe('chance rolls', () => {
  it('are deterministic for the same state and follow p with modifiers', () => {
    const s = playToScene(content, start(), 'c08_money')
    const a = engine.choose(content, s, 'invest')
    const b = engine.choose(content, s, 'invest')
    expect(a.outcome).toEqual(b.outcome)
    expect(a.state).toEqual(b.state)
    expect(a.outcome.chance).toBeDefined()
    expect(a.outcome.text).toBe(a.outcome.chance === 'success' ? 'It paid off.' : 'It did not.')
    let wins = 0
    const n = 400
    for (let i = 0; i < n; i++) {
      const t = cloneState(s)
      t.rng = (i * 2654435761) >>> 0
      t.stats.skillBusiness = 30 // p = 0.5 + 0.2 × (30 − 50) / 50 = 0.42
      if (engine.choose(content, t, 'invest').outcome.chance === 'success') wins++
    }
    expect(wins / n).toBeGreaterThan(0.33)
    expect(wins / n).toBeLessThan(0.51)
  })
})

describe('promotions', () => {
  const promoContent = (p: number) =>
    variantContent(content, (c) => {
      c.scenes.find((x) => x.id === 'c06_rhythm')!.choices[0].effects!.promotionChance = p
      c.scenes.find((x) => x.id === 'e_ai_shock')!.conditions = 'false'
    })

  it('roll at each 10-year anniversary in the path', () => {
    const c = promoContent(1)
    let s = playToScene(c, start(11, c), 'c06_rhythm')
    expect(s.path).toBeDefined()
    const since = s.path!.sinceAge
    const r = engine.choose(c, s, 'grind')
    expect(r.state.promotionChance).toBe(1)
    expect(r.outcome.promotions).toBe(since + 10 <= 35 ? 1 : 0)
    expect(r.state.promotions).toBe(r.outcome.promotions)
    s = playUntil(c, r.state)
    expect(s.ended).toBe(true)
    const expected = Math.floor((s.deathAge! - since) / 10)
    expect(s.promotions).toBe(expected)
    expect(s.grindYears).toBeGreaterThan(10)
  })

  it('never happen with promotionChance 0', () => {
    const c = promoContent(0)
    const s = playUntil(c, start(11, c), { c06_rhythm: 'grind' })
    expect(s.promotions).toBe(0)
  })
})

describe('AI events', () => {
  const atSlot = () =>
    playUntil(content, start(), {}, (step) => step.type === 'ai_slot')

  it('a valid draft becomes an AI event scene whose choices roll templates', () => {
    const s = atSlot()
    expect(engine.getStep(content, s)).toMatchObject({ type: 'ai_slot', slotId: 'slot_career' })
    const step = engine.getStep(content, s)
    if (step.type === 'ai_slot') expect(step.templates.map((t) => t.id)).toEqual(['big_risk', 'steady'])
    expect(() => engine.choose(content, s, 'ai_0')).toThrow(/injectAiEvent/)
    const draft = {
      title: 'A headhunter calls',
      text: 'Someone wants you for a moonshot.',
      choices: [
        { label: 'Bet big', templateId: 'big_risk' },
        { label: 'Play safe', templateId: 'steady' },
      ],
    }
    const injected = engine.injectAiEvent(content, s, 'slot_career', draft)
    const view = sceneOf(content, injected)
    expect(view).toMatchObject({ id: 'ai:slot_career', isAiEvent: true, narrate: false, kind: 'event', title: 'A headhunter calls' })
    expect(view.choices.map((c) => c.id)).toEqual(['ai_0', 'ai_1'])
    const r = engine.choose(content, injected, 'ai_1')
    expect(r.outcome.deltas.social).toBeGreaterThan(0)
    expect(r.state.history.at(-1)).toMatchObject({ sceneId: 'ai:slot_career', kind: 'event', label: 'Play safe' })
    expect(r.state.aiSlotsUsed).toEqual(['slot_career'])
    const risky = engine.choose(content, injected, 'ai_0')
    expect(['success', 'failure']).toContain(risky.outcome.chance)
  })

  it('null or invalid drafts fall back to the content scene', () => {
    const s = atSlot()
    const bad = [
      null,
      { title: 'x', text: 'y', choices: [{ label: 'only one', templateId: 'steady' }] },
      { title: 'x', text: 'y', choices: [{ label: 'a', templateId: 'offer_solid' }, { label: 'b', templateId: 'steady' }] },
      { title: '', text: 'y', choices: [{ label: 'a', templateId: 'steady' }, { label: 'b', templateId: 'steady' }] },
    ]
    for (const d of bad) {
      const f = engine.injectAiEvent(content, s, 'slot_career', d as never)
      const view = sceneOf(content, f)
      expect(view.id).toBe('e_fallback_career')
      expect(view.isFollowUp).toBe(false)
      expect(view.isAiEvent).toBe(false)
    }
    expect(() => engine.injectAiEvent(content, s, 'nope', null)).toThrow(/not the pending step/)
  })
})

describe('errors', () => {
  it('unknown, locked and out-of-turn choices throw', () => {
    expect(() => engine.choose(content, start(), 'campus')).toThrow(/No pending step/)
    const s = playToScene(content, start(), 'c04_after')
    expect(() => engine.choose(content, s, 'nope')).toThrow(/Unknown choice "nope".*Offered: offer, master, phd/)
    expect(() => engine.choose(content, s, 'phd')).toThrow(/locked: Requires grades of 95/)
    const ended = playUntil(content, start())
    expect(() => engine.choose(content, ended, 'family')).toThrow(/ended/)
    expect(engine.getStep(content, ended)).toEqual({ type: 'end' })
  })
})

describe('respawn', () => {
  const life = playUntil(content, start(21))
  const idx = life.history.findIndex((h) => h.sceneId === 'c08_money')

  it('respawnFrom restores the decision point', () => {
    const back = engine.respawnFrom(content, life, idx)
    expect(back.history).toHaveLength(idx)
    expect(back.pending?.sceneId).toBe('c08_money')
    expect(back.ended).toBe(false)
    expect(sceneOf(content, back).id).toBe('c08_money')
  })

  it('same seed + same choice reproduces the same summary; an alternative changes it', () => {
    const original = engine.summarize(content, life)
    const same = engine.respawnSimulate(content, life, idx, life.history[idx].choiceId)
    expect(same.summary).toEqual(original)
    expect(life.history[idx].choiceId).toBe('longhaul')
    const alt = engine.respawnSimulate(content, life, idx, 'lowcarbon')
    expect(alt.summary.earth.temperatureC).toBeLessThan(original.earth.temperatureC)
    expect(alt.summary.F).toBeLessThan(original.F)
    expect(alt.state.history[idx].choiceId).toBe('lowcarbon')
    expect(() => engine.respawnSimulate(content, life, idx, 'nope')).toThrow(/Unknown choice/)
  })

  it('top choices are majors with alternatives, ranked by impact', () => {
    const top = engine.summarize(content, life).topChoices
    expect(top.length).toBeGreaterThan(0)
    expect(top.length).toBeLessThanOrEqual(3)
    expect(top[0].sceneId).toBe('c08_money') // 3.6 t/yr × 20 years dominates
    for (let i = 1; i < top.length; i++) expect(top[i - 1].impact).toBeGreaterThanOrEqual(top[i].impact)
    for (const t of top) {
      expect(content.scenes.find((s) => s.id === t.sceneId)?.kind).toBe('major')
      expect(t.alternatives.length).toBeGreaterThan(0)
      expect(t.alternatives.map((a) => a.id)).not.toContain(life.history[t.historyIndex].choiceId)
    }
  })
})

describe('immutability', () => {
  it('no API function mutates its inputs (deep-frozen state and content)', () => {
    const frozenContent = deepFreeze(structuredClone(content))
    let s = engine.createGame(frozenContent, { seed: 31 })
    for (let i = 0; i < 200 && !s.ended; i++) {
      deepFreeze(s)
      const json = JSON.stringify(s)
      const next = engine.resolveNext(frozenContent, s)
      engine.getStep(frozenContent, s)
      engine.buildAiContext(frozenContent, s)
      engine.planetPace(frozenContent, s)
      expect(JSON.stringify(s)).toBe(json)
      if (next.ended) {
        s = next
        break
      }
      deepFreeze(next)
      const step = engine.getStep(frozenContent, next)
      if (step.type === 'ai_slot') {
        s = engine.injectAiEvent(frozenContent, next, step.slotId, null)
        continue
      }
      if (step.type !== 'scene') break
      const choice = step.scene.choices.find((c) => !c.locked)!
      const nextJson = JSON.stringify(next)
      s = engine.choose(frozenContent, next, choice.id).state
      expect(JSON.stringify(next)).toBe(nextJson)
    }
    expect(s.ended).toBe(true)
    deepFreeze(s)
    const json = JSON.stringify(s)
    engine.summarize(frozenContent, s)
    engine.respawnSimulate(frozenContent, s, 3, s.history[3].alternatives.find((a) => a !== s.history[3].choiceId)!)
    engine.respawnFrom(frozenContent, s, 2)
    expect(JSON.stringify(s)).toBe(json)
  })
})

describe('AI context', () => {
  it('is compact and human readable', () => {
    const s = playToScene(content, start(), 'c02_asso', { m_pm: 'skip', f_3am: 'stay' })
    const ctx = engine.buildAiContext(content, s)
    expect(ctx.name).toBe('Robin')
    expect(ctx.age).toBe(19)
    expect(ctx.memories).toEqual(expect.arrayContaining(["skipped PM's 8AM class", 'met someone fascinating at 3AM']))
    expect(ctx.characters.map((c) => c.id)).toEqual(['pm', 'stranger'])
    expect(ctx.recentChoices.at(-1)).toBe("19 · It's 3AM → Stay")
    expect(ctx.recentChoices.length).toBeLessThanOrEqual(6)
    expect(['low', 'ok', 'high']).toContain(ctx.gauges.Health)
    expect(['weak', 'decent', 'strong']).toContain(ctx.gauges['Math & AI'])
    for (const k of ['Intelligence', 'Economics', 'Charisma', 'Network', 'Integrity']) expect(typeof ctx.gauges[k]).toBe('string')
    expect(typeof ctx.gauges.money).toBe('number')
    expect(Number.isInteger(ctx.gauges.money)).toBe(true)
    expect(ctx.gauges.Grades).toBeDefined()
    const later = playToScene(content, start(), 'c06_rhythm')
    const c2 = engine.buildAiContext(content, later)
    expect(c2.career?.path).toBeDefined()
    expect(c2.exchange).toMatch(/,/)
    expect(JSON.stringify(c2).length).toBeLessThan(3000)
  })
})

describe('whole lives on the fixture', () => {
  it('end with a sane summary and in well under 50 ms', () => {
    for (let seed = 0; seed < 60; seed++) {
      const t0 = performance.now()
      const s = playUntil(content, start(seed))
      const sum = engine.summarize(content, s)
      expect(performance.now() - t0).toBeLessThan(50)
      expect(s.ended).toBe(true)
      expect(sum.deathAge).toBeGreaterThanOrEqual(76)
      expect(sum.deathAge).toBeLessThanOrEqual(98)
      expect(JSON.stringify(sum)).not.toMatch(/NaN|null/)
      expect(sum.receipt.reduce((a, l) => a + l.t, 0)).toBeCloseTo(sum.lifetimeT, 6)
    }
  })
})
