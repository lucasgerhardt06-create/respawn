import { describe, expect, it } from 'vitest'
import { Content } from '../content/schema'
import { miniContent as content } from './__fixtures__/miniContent'
import { variantContent } from './__fixtures__/play'
import { cloneState } from './clone'
import { createGame } from './create'
import { addAnnual } from './footprint'
import {
  computeEarth,
  footprintScore,
  interpolate,
  lifespanFor,
  planetPace,
  scoreLinear,
  temperatureFor,
} from './planet'
import { applyStatDelta, arrowFor, diminish } from './stats'
import { pickEnding, summarize } from './summary'
import { fillText } from './text'
import { advanceTo } from './time'

describe('fixture', () => {
  it('is valid against the Zod Content schema', () => {
    const r = Content.safeParse(content)
    if (!r.success) throw new Error(JSON.stringify(r.error.issues.slice(0, 5), null, 2))
    expect(r.success).toBe(true)
  })
})

describe('diminishing returns', () => {
  it('follows v + d(1 − v/100) up and v + d(v/100) down', () => {
    expect(diminish(50, 10)).toBe(55)
    expect(diminish(50, -10)).toBe(45)
    expect(diminish(90, 10)).toBeCloseTo(91)
    expect(diminish(10, -10)).toBeCloseTo(9)
    expect(diminish(0, -10)).toBe(0)
  })

  it('applies DR on 0–100 stats, linear on others, and clamps to bounds', () => {
    const s = cloneState(createGame(content, { seed: 1 })).stats
    s.money = 50
    applyStatDelta(content, s, 'money', 10)
    expect(s.money).toBe(55)
    s.money = 99
    applyStatDelta(content, s, 'money', 500)
    expect(s.money).toBeLessThanOrEqual(100)
    s.ethics = 45
    applyStatDelta(content, s, 'ethics', 10)
    expect(s.ethics).toBe(50) // linear + clamp
    s.ethics = 0
    applyStatDelta(content, s, 'ethics', -10)
    expect(s.ethics).toBe(-10)
    s.aiLever = 0.04
    applyStatDelta(content, s, 'aiLever', 0.05)
    expect(s.aiLever).toBe(0.05)
    s.addiction = 0
    applyStatDelta(content, s, 'addiction', -5)
    expect(s.addiction).toBe(0)
  })

  it('arrow buckets', () => {
    expect(arrowFor(0.4)).toBe(0)
    expect(arrowFor(-0.49)).toBe(0)
    expect(arrowFor(0.5)).toBe(1)
    expect(arrowFor(2.9)).toBe(1)
    expect(arrowFor(-3)).toBe(-2)
    expect(arrowFor(6.9)).toBe(2)
    expect(arrowFor(7)).toBe(3)
    expect(arrowFor(-20)).toBe(-3)
  })
})

describe('placeholders', () => {
  it('fills every placeholder from the state, with fallbacks', () => {
    const s = cloneState(createGame(content, { seed: 3, name: 'Ines' }))
    expect(fillText(content, s, '{name} at {employer} ({path}) in {city}, {country}, {university}; {startup}; {age}')).toBe(
      'Ines at your employer (your career) in your exchange city, abroad, your host university; your startup; 18',
    )
    s.path = { pathId: 'consulting', employerId: 'sterling', employerName: 'McKinsley', sinceAge: 23 }
    s.exchange = { destinationId: 'd_ntu' }
    s.startup = { sectorId: 's_climate', name: 'Coolr' }
    s.age = 40
    expect(fillText(content, s, '{name}|{employer}|{path}|{university}|{city}|{country}|{startup}|{age}|{unknown}')).toBe(
      'Ines|McKinsley|Consulting|NTU|Singapore|Singapore|Coolr|40|{unknown}',
    )
  })
})

describe('planet formulas (GAME_DESIGN §5)', () => {
  it('average French footprint (9.2 t/yr) → 2.7 °C; 2 t/yr → ~1.7 °C', () => {
    expect(temperatureFor(content, 9.2, 0)).toBeCloseTo(2.7, 5)
    expect(temperatureFor(content, 2, 0)).toBeCloseTo(1.68, 2)
    expect(temperatureFor(content, 9.2, -0.1)).toBeCloseTo(1.4 + 1.3 * 0.9, 5)
  })

  it('footprint score: 2 t = 100, 9.2 t ≈ 50, 16 t = 0', () => {
    expect(footprintScore(content, 2)).toBe(100)
    expect(footprintScore(content, 9.2)).toBeCloseTo(48.57, 1)
    expect(footprintScore(content, 16)).toBe(0)
    expect(footprintScore(content, 30)).toBe(0)
    expect(footprintScore(content, 1)).toBe(100)
  })

  it('interpolates curves and extrapolates linearly at both ends', () => {
    const ocean = content.constants.planet.oceanCurve
    expect(interpolate(ocean, 2.7)).toBeCloseTo(0.56)
    expect(interpolate(ocean, 2.25)).toBeCloseTo(0.5)
    expect(interpolate(ocean, 1.0)).toBeCloseTo(0.38 - 0.4 * (0.06 / 0.4))
    expect(interpolate(ocean, 5.2)).toBeCloseTo(0.77 + 0.8 * (0.09 / 0.8))
    expect(scoreLinear(5, 1, 3)).toBe(0)
    expect(scoreLinear(0, 1, 3)).toBe(100)
  })

  it('computes the Earth for an average life', () => {
    const e = computeEarth(content, { F: 9.2, aiLever: 0, materialsKg: 0, tech: 40, ai: 120 })
    expect(e.temperatureC).toBeCloseTo(2.7)
    expect(e.oceanM).toBeCloseTo(0.56)
    expect(e.insectsPct).toBeCloseTo(18 + 0.7 * (31 / 1.2), 3)
    expect(e.heatBillions).toBeCloseTo(0.4 + 1.33 * 1.2)
    expect(e.scores.temperature).toBeCloseTo(100 * (1 - 1.2 / 2.9))
    expect(e.scores.tech).toBe(40)
    expect(e.scores.ai).toBe(100)
    for (const v of Object.values(e.scores)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
    const heavy = computeEarth(content, { F: 9.2, aiLever: 0, materialsKg: 4000, tech: 0, ai: 0 })
    expect(heavy.scores.biodiversity).toBeCloseTo(e.scores.biodiversity - 0.3 * 20, 5)
    const hot = computeEarth(content, { F: 40, aiLever: 0.05, materialsKg: 0, tech: 0, ai: 0 })
    expect(hot.scores.temperature).toBe(0)
    expect(hot.scores.ocean).toBe(0)
  })

  it('a whole life of baseline + average digital lands at F = 9.2 and 2.7 °C', () => {
    const s = cloneState(createGame(content, { seed: 5 }))
    s.stats.money = 50
    s.stats.screenHours = 2.33
    advanceTo(content, s, 80)
    s.ended = true
    s.deathAge = 80
    const sum = summarize(content, s)
    expect(sum.F).toBeCloseTo(9.2, 5)
    expect(sum.earth.temperatureC).toBeCloseTo(2.7, 5)
    expect(sum.lifetimeT).toBeCloseTo(9.2 * 62, 5)
    expect(sum.digitalShare).toBeCloseTo(0.4 / 9.2, 5)
    const receiptTotal = sum.receipt.reduce((a, l) => a + l.t, 0)
    expect(receiptTotal).toBeCloseTo(sum.lifetimeT, 6)
  })

  it('a 2 t/yr life lands near 1.7 °C and the receipt still adds up', () => {
    const s = cloneState(createGame(content, { seed: 5 }))
    s.stats.money = 50
    addAnnual(s, { id: 'frugal', label: 'Radical sobriety', category: 'lifestyle', tPerYear: -7.2, fromAge: 18 })
    advanceTo(content, s, 80)
    s.ended = true
    s.deathAge = 80
    const sum = summarize(content, s)
    expect(sum.F).toBeCloseTo(2, 5)
    expect(sum.earth.temperatureC).toBeCloseTo(1.7, 1)
    expect(sum.you.footprint).toBeCloseTo(100, 5)
    expect(sum.receipt.reduce((a, l) => a + l.t, 0)).toBeCloseTo(sum.lifetimeT, 6)
    expect(sum.receipt[sum.receipt.length - 1].label).toMatch(/^Just living in France/)
  })

  it('fractional ages advance exactly (no stuck loop, accrual pro rata)', () => {
    const s = cloneState(createGame(content, { seed: 5 }))
    s.stats.money = 50
    for (const t of [18.4, 19.00626320783049, 19.0062633, 20.5, 32.27229418486822, 33]) {
      advanceTo(content, s, t)
      expect(s.age).toBe(t)
    }
    expect(s.footprint.lifeT).toBeCloseTo(9.2 * 15, 6)
  })

  it('wealth adds the lifestyle modifier unless low_carbon_comfort', () => {
    const rich = cloneState(createGame(content, { seed: 5 }))
    rich.stats.money = 90
    advanceTo(content, rich, 28)
    expect(rich.footprint.lifeT).toBeCloseTo(10 * (9.2 + 1.5), 5)
    const comfy = cloneState(createGame(content, { seed: 5 }))
    comfy.stats.money = 90
    comfy.flags.push('low_carbon_comfort')
    advanceTo(content, comfy, 28)
    expect(comfy.footprint.lifeT).toBeCloseTo(10 * 9.2, 5)
  })

  it('planet pace stays in [0, 1]', () => {
    const s = createGame(content, { seed: 5 })
    const pace = planetPace(content, s)
    expect(pace).toBeGreaterThan(0)
    expect(pace).toBeLessThan(1)
    const hot = cloneState(s)
    addAnnual(hot, { id: 'x', label: 'x', category: 'other', tPerYear: 100, fromAge: 18 })
    expect(planetPace(content, hot)).toBe(1)
  })
})

describe('lifespan', () => {
  it('83.1 ± social swing − grind − addiction, clamped to [76, 98]', () => {
    expect(lifespanFor(content, { social: 50, addiction: 0 }, 0)).toBeCloseTo(83.1)
    expect(lifespanFor(content, { social: 100, addiction: 0 }, 0)).toBeCloseTo(86.1)
    expect(lifespanFor(content, { social: 50, addiction: 100 }, 10)).toBeCloseTo(83.1 - 4 - 1.5)
    expect(lifespanFor(content, { social: 0, addiction: 100 }, 100)).toBe(76)
    const generous = variantContent(content, (c) => {
      c.constants.lifespan.base = 140
    })
    expect(lifespanFor(generous, { social: 100, addiction: 0 }, 0)).toBe(98)
  })

  it('uses baseByGender for woman/man when provided, base otherwise', () => {
    const byGender = variantContent(content, (c) => {
      c.constants.lifespan.baseByGender = { woman: 85.9, man: 80.3 }
    })
    expect(lifespanFor(byGender, { social: 50, addiction: 0 }, 0, 'woman')).toBeCloseTo(85.9)
    expect(lifespanFor(byGender, { social: 50, addiction: 0 }, 0, 'man')).toBeCloseTo(80.3)
    expect(lifespanFor(byGender, { social: 50, addiction: 0 }, 0, 'nonbinary')).toBeCloseTo(83.1)
    expect(lifespanFor(byGender, { social: 50, addiction: 0 }, 0)).toBeCloseTo(83.1)
    expect(lifespanFor(content, { social: 50, addiction: 0 }, 0, 'woman')).toBeCloseTo(83.1)
  })
})

describe('endings', () => {
  it('picks the highest-priority ending whose conditions hold', () => {
    const s = cloneState(createGame(content, { seed: 9 }))
    s.stats.money = 90
    expect(pickEnding(content, s, { F: 3, footprintScore: 90, temperature: 1.8, lifespan: 85 }).id).toBe('unicorn')
    expect(pickEnding(content, s, { F: 7, footprintScore: 60, temperature: 2.3, lifespan: 85 }).id).toBe('frugal')
    s.stats.money = 40
    expect(pickEnding(content, s, { F: 3, footprintScore: 90, temperature: 1.8, lifespan: 85 }).id).toBe('frugal')
    expect(pickEnding(content, s, { F: 12, footprintScore: 20, temperature: 3.1, lifespan: 85 }).id).toBe('ordinary')
  })

  it('falls back to the lowest-priority ending when nothing matches', () => {
    const strict = variantContent(content, (c) => {
      c.endings = c.endings.map((e) => ({ ...e, conditions: 'false' }))
    })
    const s = createGame(strict, { seed: 9 })
    expect(pickEnding(strict, s, { F: 3, footprintScore: 90, temperature: 1.8, lifespan: 85 }).id).toBe('ordinary')
  })
})
