import { describe, expect, it } from 'vitest'
import { miniContent as content } from './__fixtures__/miniContent'
import { cloneState } from './clone'
import { ConditionError, evaluate, parseCondition } from './conditions'
import { createGame } from './create'
import { makeEnv } from './planet'
import type { GameState, HistoryEntry } from './types'

function baseState(): GameState {
  const s = cloneState(createGame(content, { seed: 7, name: 'Tess' }))
  s.stats.skillAi = 65
  s.stats.grades = 55
  s.age = 31
  s.promotions = 1
  s.flags = ['TECH']
  s.path = { pathId: 'consulting', employerId: 'sterling', employerName: 'McKinsley', sinceAge: 20 }
  s.player.profile = { originId: 'intl', budgetId: 'tight', traitId: 'math' }
  return s
}

const ev = (cond: Parameters<typeof evaluate>[0], s: GameState, extra?: Parameters<typeof makeEnv>[2]) =>
  evaluate(cond, makeEnv(content, s, extra))

describe('conditions: string forms', () => {
  const s = baseState()

  it('numeric stat comparisons', () => {
    expect(ev('skillAi >= 60', s)).toBe(true)
    expect(ev('skillAi > 65', s)).toBe(false)
    expect(ev('skillAi == 65', s)).toBe(true)
    expect(ev('skillAi != 65', s)).toBe(false)
    expect(ev('grades < 50', s)).toBe(false)
    expect(ev('grades <= 55', s)).toBe(true)
    expect(ev('ethics >= -10', s)).toBe(true)
  })

  it('age, promotions, yearsInPath', () => {
    expect(ev('age > 30', s)).toBe(true)
    expect(ev('promotions >= 1', s)).toBe(true)
    expect(ev('yearsInPath >= 11', s)).toBe(true)
    expect(ev('yearsInPath >= 12', s)).toBe(false)
  })

  it('path / employer / phase / profile', () => {
    expect(ev('path == consulting', s)).toBe(true)
    expect(ev('path != research', s)).toBe(true)
    expect(ev('employer == sterling', s)).toBe(true)
    expect(ev('employer != sterling', s)).toBe(false)
    expect(ev('phase == arrival', s)).toBe(true)
    expect(ev('profile.budget == tight', s)).toBe(true)
    expect(ev('profile.origin == intl', s)).toBe(true)
    expect(ev('profile.trait == people', s)).toBe(false)
    const jobless = cloneState(s)
    jobless.path = undefined
    expect(ev('path == none', jobless)).toBe(true)
    expect(ev('employer == none', jobless)).toBe(true)
  })

  it('flags', () => {
    expect(ev('flag:TECH', s)).toBe(true)
    expect(ev('!flag:TECH', s)).toBe(false)
    expect(ev('flag:SHALLOW', s)).toBe(false)
    expect(ev('!flag:SHALLOW', s)).toBe(true)
  })

  it('chose: recorded choices, any choice, negation and the current choice', () => {
    const h = cloneState(s)
    h.history = [{ sceneId: 'c01_home', choiceId: 'campus' } as HistoryEntry]
    expect(ev('chose:c01_home=campus', h)).toBe(true)
    expect(ev('chose:c01_home=parents', h)).toBe(false)
    expect(ev('chose:c01_home', h)).toBe(true)
    expect(ev('!chose:c01_home=parents', h)).toBe(true)
    expect(ev('chose:c02_asso=no_asso', h, { current: { sceneId: 'c02_asso', choiceId: 'no_asso' } })).toBe(true)
  })

  it('end metrics: given explicitly or projected during play', () => {
    expect(ev('temperature >= 2.5', s, { metrics: { temperature: 2.6 } })).toBe(true)
    expect(ev('lifespan > 90', s, { metrics: { lifespan: 85 } })).toBe(false)
    expect(ev('F < 20', s)).toBe(true) // projected from the state
    expect(ev('footprintScore >= 0', s)).toBe(true)
  })

  it('object forms and constants', () => {
    expect(ev({ all: ['flag:TECH', 'age > 30'] }, s)).toBe(true)
    expect(ev({ all: ['flag:TECH', 'age > 40'] }, s)).toBe(false)
    expect(ev({ any: ['flag:NOPE', 'age > 30'] }, s)).toBe(true)
    expect(ev({ any: ['flag:NOPE', 'age > 40'] }, s)).toBe(false)
    expect(ev({ not: 'flag:TECH' }, s)).toBe(false)
    expect(ev({ not: { any: [] } }, s)).toBe(true)
    expect(ev({ all: [] }, s)).toBe(true)
    expect(ev({ all: [{ any: ['true', 'false'] }, { not: 'false' }] }, s)).toBe(true)
    expect(ev(undefined, s)).toBe(true)
  })
})

describe('conditions: parse errors', () => {
  const bad: unknown[] = [
    '',
    'skilAi >= 60',
    'money >= lots',
    'path > consulting',
    'money = 3',
    'flag:',
    '!money > 3',
    'phase == retirement',
    'chose:a=b=c',
    'just words',
    {},
    { all: 'flag:X' },
    { all: [], any: [] },
    { xor: [] },
    { all: ['flag:OK', 'bogus >= 2'] },
  ]
  for (const cond of bad) {
    it(`rejects ${JSON.stringify(cond)}`, () => {
      expect(() => parseCondition(cond as never)).toThrow(ConditionError)
    })
  }

  it('error messages name the condition and the problem', () => {
    expect(() => parseCondition('skilAi >= 60')).toThrow(/Invalid condition "skilAi >= 60": unknown key "skilAi"/)
    expect(() => parseCondition('money = 3')).toThrow(/use "=="/)
  })

  it('accepts every documented form', () => {
    for (const c of [
      'skillAi >= 60',
      'age > 30',
      'grades < 50',
      'promotions >= 2',
      'yearsInPath >= 10',
      'path == finance',
      'employer != panoptis',
      'profile.budget == tight',
      'profile.origin == intl',
      'profile.trait == math',
      'flag:TECH',
      '!flag:SHALLOW',
      'chose:c03_asso=asso_utopia',
      'footprintScore >= 70',
      'temperature >= 2.5',
      'lifespan > 90',
      'F < 3',
      'aiLever <= -0.01',
    ])
      expect(() => parseCondition(c)).not.toThrow()
  })
})
