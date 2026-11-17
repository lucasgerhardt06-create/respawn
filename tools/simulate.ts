/**
 * npm run simulate [-- --n 1000] [-- --samples 1]
 * Plays N lives per strategy (random, money-, planet-, happiness-, fame-greedy, balanced) and prints
 * mean/p10/p90 of temperature, lifespan and each YOU pole, the title distribution, and dominance flags.
 */
import { VISIBLE_STATS } from '../src/content/schema.ts'
import type { Content } from '../src/content/schema.ts'
import { summarize } from '../src/engine/summary.ts'
import type { EndSummary, YouPole } from '../src/engine/types.ts'
import { loadContent } from './lib/loadContent.ts'
import { STRATEGIES, STRATEGY_LABEL, meanOf, playLife, quantile } from './lib/lives.ts'
import type { DecisionCounts, Strategy } from './lib/lives.ts'

function arg(name: string, fallback: number): number {
  const i = process.argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (i === -1) return fallback
  const raw = process.argv[i].includes('=') ? process.argv[i].split('=')[1] : process.argv[i + 1]
  const v = Number(raw)
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback
}

const N = arg('n', 1000)
const SAMPLES = arg('samples', 1)
const POLES: YouPole[] = [...VISIBLE_STATS, 'footprint']
const GREEDY_TARGET: Partial<Record<Strategy, string>> = {
  money: 'money',
  planet: 'tonnes',
  happiness: 'happiness',
  fame: 'fame',
  balanced: 'min pole',
}

interface Run {
  strategy: Strategy
  summaries: EndSummary[]
  /** sceneId → choiceId → count (only decisions with ≥ 2 unlocked options). */
  picks: Map<string, Map<string, number>>
  offered: Map<string, number>
  errors: Map<string, number>
  /** Every decision per life (single-option ones included), by scene kind. */
  decisions: DecisionCounts[]
  ms: number
}

function run(content: Content, strategy: Strategy): Run {
  const r: Run = { strategy, summaries: [], picks: new Map(), offered: new Map(), errors: new Map(), decisions: [], ms: 0 }
  const t0 = performance.now()
  for (let seed = 0; seed < N; seed++) {
    const counts: DecisionCounts = { major: 0, mini: 0, event: 0, total: 0 }
    try {
      const s = playLife(content, 100_000 + seed, {
        strategy,
        samples: SAMPLES,
        onDecision: (d) => {
          counts[d.kind]++
          counts.total++
          if (d.unlocked.length < 2 || d.kind !== 'major' || (strategy !== 'random' && d.indifferent)) return
          r.offered.set(d.sceneId, (r.offered.get(d.sceneId) ?? 0) + 1)
          let m = r.picks.get(d.sceneId)
          if (!m) r.picks.set(d.sceneId, (m = new Map()))
          m.set(d.picked, (m.get(d.picked) ?? 0) + 1)
        },
      })
      r.summaries.push(summarize(content, s))
      r.decisions.push(counts)
    } catch (e) {
      const msg = (e as Error).message
      r.errors.set(msg, (r.errors.get(msg) ?? 0) + 1)
    }
  }
  r.ms = performance.now() - t0
  return r
}

const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : 'NaN')
function stat(xs: number[], d = 1): string {
  const sorted = xs.slice().sort((a, b) => a - b)
  return `${fmt(meanOf(xs), d).padStart(5)} [${fmt(quantile(sorted, 0.1), d)}–${fmt(quantile(sorted, 0.9), d)}]`
}

async function main() {
  const loaded = await loadContent()
  if (!loaded.content) {
    console.error('simulate: content does not load. Run `npm run check-data` for details.')
    for (const i of loaded.issues.filter((x) => x.level === 'error').slice(0, 10)) console.error(`  ${i.where}: ${i.message}`)
    process.exit(1)
  }
  const content = loaded.content
  console.log(`RESPAWN balance — ${N} lives per strategy, lookahead samples ${SAMPLES}\n`)

  const runs = STRATEGIES.map((s) => run(content, s))
  const header = ['strategy'.padEnd(17), 'temp °C'.padEnd(18), 'lifespan'.padEnd(18), ...POLES.map((p) => p.padEnd(18))].join('')
  console.log(header)
  const meanPoles = new Map<Strategy, Record<YouPole, number>>()
  for (const r of runs) {
    const S = r.summaries
    const means = {} as Record<YouPole, number>
    for (const p of POLES) means[p] = meanOf(S.map((s) => s.you[p]))
    meanPoles.set(r.strategy, means)
    console.log(
      [
        STRATEGY_LABEL[r.strategy].padEnd(17),
        stat(S.map((s) => s.earth.temperatureC), 2).padEnd(18),
        stat(S.map((s) => s.deathAge)).padEnd(18),
        ...POLES.map((p) => stat(S.map((s) => s.you[p])).padEnd(18)),
      ].join(''),
    )
  }

  console.log('\nTitles (top 8) and extra figures')
  for (const r of runs) {
    const counts = new Map<string, number>()
    for (const s of r.summaries) counts.set(s.title.title, (counts.get(s.title.title) ?? 0) + 1)
    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([t, n]) => `${t} ${((100 * n) / Math.max(1, r.summaries.length)).toFixed(0)}%`)
    const S = r.summaries
    console.log(
      `  ${STRATEGY_LABEL[r.strategy].padEnd(17)} F ${stat(S.map((s) => s.F))} t/yr · ${(r.ms / N).toFixed(2)} ms/life\n` +
        `  ${''.padEnd(17)} ${top.join(' · ') || '(none)'}`,
    )
    for (const [msg, n] of r.errors) console.log(`  ${''.padEnd(17)} ERROR ×${n}: ${msg}`)
  }

  console.log('\nDecisions per life (every scene played, single-option ones included): mean [p90]')
  console.log(`  ${'strategy'.padEnd(17)}${['total', 'major', 'mini', 'event'].map((k) => k.padEnd(14)).join('')}`)
  for (const r of runs) {
    const cell = (k: keyof DecisionCounts) => {
      const xs = r.decisions.map((d) => d[k])
      const sorted = xs.slice().sort((a, b) => a - b)
      return `${fmt(meanOf(xs))} [${quantile(sorted, 0.9)}]`.padEnd(14)
    }
    console.log(`  ${STRATEGY_LABEL[r.strategy].padEnd(17)}${cell('total')}${cell('major')}${cell('mini')}${cell('event')}`)
  }

  // Dominance flags
  const flags: string[] = []
  for (const s of STRATEGIES) {
    const mine = meanPoles.get(s)!
    const tops = POLES.filter((p) => STRATEGIES.every((o) => o === s || mine[p] >= meanPoles.get(o)![p]))
    if (tops.length >= 5) flags.push(`${STRATEGY_LABEL[s]} tops ${tops.length}/6 YOU poles (${tops.join(', ')}): one strategy dominates`)
  }
  const dominantFor = new Map<string, string[]>() // "scene:choice" → targets
  for (const r of runs) {
    const target = GREEDY_TARGET[r.strategy]
    if (!target) continue
    for (const [sceneId, m] of r.picks) {
      const total = r.offered.get(sceneId) ?? 0
      if (total < Math.max(10, N * 0.1)) continue
      for (const [choiceId, n] of m) {
        if (n / total <= 0.9) continue
        const key = `${sceneId}:${choiceId}`
        dominantFor.set(key, [...(dominantFor.get(key) ?? []), `${target} ${((100 * n) / total).toFixed(0)}%`])
      }
    }
  }
  const multi = [...dominantFor.entries()].filter(([, t]) => t.length >= 3)
  for (const [key, targets] of multi)
    flags.push(`${key} is picked > 90% by ${targets.length} greedy targets (${targets.join(', ')}): likely a dominant option`)
  const single = [...dominantFor.entries()].filter(([, t]) => t.length < 3)

  console.log('\nDominance')
  if (flags.length === 0) console.log('  no strategy or choice dominates')
  for (const f of flags) console.log(`  FLAG ${f}`)
  if (single.length) {
    console.log(`  > 90% picks for a single target (${single.length}, expected for greedy play):`)
    const lines = single.map(([k, t]) => `${k} (${t.join(', ')})`)
    for (let i = 0; i < lines.length; i += 3) console.log(`    ${lines.slice(i, i + 3).join(' · ')}`)
  }
}

main().catch((e) => {
  console.error('simulate crashed:', e)
  process.exit(1)
})
