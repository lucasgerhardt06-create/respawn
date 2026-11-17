/**
 * Realistic sample payloads (shaped like the engine's AIContext / SceneView / EndSummary output).
 * Used by tools/ai-smoke.ts and the tests. Not imported by the runtime.
 */
import type { AIContext, SceneView } from '../../src/engine/types.js'
import type { EpitaphInput, EventInput, NarrateInput, StartupInput, SurpriseInput } from './schemas.js'
import type { Task } from './models.js'

export const sampleCtx: AIContext = {
  name: 'Inès',
  lastName: 'Morel',
  pronouns: { subject: 'she', object: 'her', possessive: 'her' },
  age: 19,
  phase: 'aidams12',
  profile: { origin: 'Lyon', budget: 'tight', trait: 'math whiz' },
  gauges: { money: 38, happiness: 61, social: 72, fame: 44, contribution: 52, energy: 'low', grades: 'average' },
  memories: [
    'joined Automatants, the CentraleSupélec AI club',
    'skipped PM\'s 8AM class once',
    'stayed until 3AM talking with Noor after a sète',
  ],
  recentChoices: [
    '18 · Where do you live in Year 1? → Campus residence at Saclay',
    '18 · Your phone habits → Average, about 2h20 a day',
    '18 · Which association? → Automatants',
    '19 · A sète every week → Party animal',
  ],
  characters: [
    { id: 'pm', name: 'PM', role: 'the professor of the legendary 8AM class' },
    { id: 'roommate', name: 'Malo', role: 'your roommate at the Saclay residence' },
    { id: 'stranger_3am', name: 'Noor', role: 'the person you met at 3AM after a sète' },
  ],
}

export const sampleScene: SceneView = {
  id: 'm_pm_8am_1',
  kind: 'mini',
  phase: 'aidams12',
  age: 19,
  majorCount: 20,
  title: "PM's 8AM class",
  text: "It's 8AM. PM is already writing on the board. Do you go?",
  speaker: 'pm',
  art: 'lecture_hall',
  narrate: true,
  tone: 'dry humour',
  hints: ['If the player skipped before, PM noticed.'],
  choices: [
    { id: 'go', label: 'Go to class', locked: false },
    { id: 'skip', label: 'Stay in bed', locked: false },
  ],
  isFollowUp: false,
  isAiEvent: false,
}

export const sampleMajorScene: SceneView = {
  id: 'c06_exchange',
  kind: 'major',
  phase: 'aidams34',
  age: 20,
  majorIndex: 6,
  majorCount: 20,
  title: 'Year 3: your exchange destination',
  text: 'Year 3 means leaving for a semester abroad. Four continents, one university each. Where do you go?',
  art: 'airport',
  narrate: true,
  choices: [
    { id: 'dest_erasmus', label: 'Erasmus, Rotterdam', hint: 'Erasmus · Rotterdam · Train ≈ 0.03 t', locked: false },
    { id: 'dest_utaustin', label: 'UT Austin, Texas', hint: 'UT Austin · Austin · Plane ≈ 2.1 t', locked: false },
    { id: 'dest_uchile', label: 'Universidad de Chile, Santiago', hint: 'Universidad de Chile · Santiago · Plane ≈ 3.4 t', locked: false },
    { id: 'dest_ntu', label: 'NTU, Singapore', hint: 'NTU · Singapore · Plane ≈ 3.2 t', locked: false },
  ],
  isFollowUp: false,
  isAiEvent: false,
}

const careerCtx: AIContext = {
  ...sampleCtx,
  age: 34,
  phase: 'career',
  gauges: { money: 71, happiness: 47, social: 49, fame: 58, contribution: 41, energy: 'low' },
  career: { path: 'Big Tech / AI product', employer: 'OpenEye', years: 8, promotions: 2 },
  exchange: 'UT Austin, Texas (flew there, a few weekend trips)',
  memories: [...sampleCtx.memories, 'grinds 55-hour weeks', 'partner and kids with screens limited'],
  recentChoices: [
    '22 · After AIDAMS → Take the offer now',
    '22 · Your first real job → OpenEye',
    '25 · Work rhythm → Grind 55h+',
    '30 · Family → Partner and kids, screens limited',
    '33 · Flagship project → Scale it at all costs',
  ],
  characters: [
    ...sampleCtx.characters,
    { id: 'manager', name: 'Hélène', role: 'your first manager at OpenEye' },
  ],
}

const templates = [
  { id: 'big_risk_tech', description: 'big risk, big tech upside: 40% huge success, else money loss' },
  { id: 'safe_small_gain', description: 'safe choice, small money gain, a bit boring' },
  { id: 'social_warmth', description: 'time with people you love: social and happiness up, money down a little' },
  { id: 'ethics_shortcut', description: 'ethically dubious shortcut: money and fame up, ethics down' },
]

export const samples: Record<Task, unknown> = {
  narrate: {
    ctx: sampleCtx,
    scene: sampleScene,
    previous: { title: 'Sète tonight?', choiceLabel: 'Go to the sète', consequence: 'You got home at 4AM.' },
  } satisfies NarrateInput,
  event: { ctx: careerCtx, templates } satisfies EventInput,
  surprise: {
    ctx: { ...sampleCtx, age: 22, phase: 'launch', memories: [...sampleCtx.memories, 'interned at a CentraleSupélec research lab'] },
    employers: [
      { name: 'Envidia', pathId: 'bigtech', pathName: 'Big Tech / AI product' },
      { name: 'Microsift', pathId: 'bigtech', pathName: 'Big Tech / AI product' },
      { name: 'BCJ', pathId: 'consulting', pathName: 'Consulting' },
    ],
    templates: [
      { id: 'offer_high_pay_low_impact', description: 'very well paid, prestige up, impact down' },
      { id: 'offer_mission_driven', description: 'modest pay, impact and happiness up' },
      { id: 'offer_wildcard', description: 'chaotic startup: fame up, energy down, money uncertain' },
    ],
  } satisfies SurpriseInput,
  startup: { ctx: { ...careerCtx, age: 40, phase: 'career' }, sector: { id: 'climate_tech', label: 'Climate tech' } } satisfies StartupInput,
  epitaph: {
    ctx: { ...careerCtx, age: 84, phase: 'oldage' },
    summary: {
      name: 'Inès',
      deathAge: 84,
      title: { title: 'Burnt-out Consultant', description: 'Brilliant, busy, and permanently at an airport.' },
      you: { money: 74, happiness: 41, social: 46, fame: 62, contribution: 38, footprint: 31 },
      earth: {
        temperatureC: 3.12,
        oceanM: 0.61,
        scores: { temperature: 44, ocean: 41, biodiversity: 46, livability: 40, tech: 71, ai: 78 },
      },
      F: 12.4,
      lifetimeT: 819,
      frenchAverageLifetimeT: 607,
      receiptTop: [
        { label: 'Business flights (Tech career)', t: 54 },
        { label: 'Two long-haul holidays a year', t: 72 },
        { label: 'Return flight Paris–Austin (exchange)', t: 2.1 },
      ],
      topChoices: [
        { title: 'Your first real job', chosenLabel: 'OpenEye', age: 22 },
        { title: 'Work rhythm', chosenLabel: 'Grind 55h+', age: 25 },
        { title: 'What do you do with your money?', chosenLabel: 'Two long-haul holidays a year', age: 45 },
      ],
      path: { pathName: 'Big Tech / AI product', employerName: 'OpenEye' },
      badges: ['Kept it'],
    },
  } satisfies EpitaphInput,
}

export const narrateMajorSample: NarrateInput = {
  ctx: { ...sampleCtx, age: 20, phase: 'aidams34' },
  scene: sampleMajorScene,
}
