import { describe, expect, it } from 'vitest'
import { content } from '../src/content/index'
import { countDecisions, meanOf } from './lib/lives'

/** Playtests: the many small choices drowned the main story. Design target ≤ 28 decisions per life. */
const MAX_MEAN_DECISIONS = 28

describe('pacing', () => {
  it(`300 random lives average at most ${MAX_MEAN_DECISIONS} decisions`, () => {
    const totals = Array.from({ length: 300 }, (_, i) => countDecisions(content, 500_000 + i).total)
    expect(meanOf(totals)).toBeLessThanOrEqual(MAX_MEAN_DECISIONS)
  }, 60_000)
})
