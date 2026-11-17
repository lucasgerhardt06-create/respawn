/** Mock data for the ?gallery page: every screen in its states, no engine or AI needed. */
import type { Epitaph } from '../../ai/types'
import type { EndSummary, SceneView, Stats } from '../../engine/types'
import type { Beat, RespawnResult, StartupCard } from '../../store/game'
import type { SheetData } from '../components/CharacterSheet'

export const mockStats: Stats = {
  money: 46,
  happiness: 62,
  social: 71,
  fame: 28,
  contribution: 54,
  intellect: 58,
  skillAi: 64,
  skillBusiness: 31,
  skillSoft: 47,
  energy: 66,
  network: 40,
  grades: 72,
  ethics: 12,
  addiction: 18,
  tech: 10,
  ai: 8,
  aiLever: 0,
  screenHours: 2.33,
  workHours: 40,
}

export const mockSheet: SheetData = {
  name: 'Lina Moreau',
  age: 19,
  phase: 'aidams12',
  stats: mockStats as unknown as Record<string, number>,
  profile: { origin: 'Grew up in Lyon', budget: 'Tight budget', trait: 'Math brain' },
}

export const sceneMajor: SceneView = {
  id: 'c03_asso',
  kind: 'major',
  phase: 'aidams12',
  age: 18,
  majorIndex: 3,
  majorCount: 20,
  title: 'Which association?',
  text: 'Asso fair day on the Saclay campus. Forty stands, free crêpes, and a guy in a rugby jersey who has already hugged you twice. You have room for one association this year.',
  art: 'campus',
  narrate: true,
  choices: [
    { id: 'asso_automatants', label: 'Automatants, the CentraleSupélec AI club', hint: 'GPUs, late nights, very serious memes' },
    { id: 'asso_comedia', label: 'Comedia, the theatre troupe', hint: 'Stage fright, then applause' },
    { id: 'asso_oser', label: 'OSER, tutoring for equal opportunity' },
    { id: 'asso_transaction', label: 'ESSEC Transaction', locked: true, lockedReason: 'Requires Economics 40+' },
    { id: 'none', label: 'No association: more time to study' },
  ].map((c) => ({ locked: false, ...c })),
  isFollowUp: false,
  isAiEvent: false,
}

export const sceneMini: SceneView = {
  id: 'm_pm_8am_1',
  kind: 'mini',
  phase: 'aidams12',
  age: 18,
  majorCount: 20,
  title: "PM's 8AM class",
  text: "It's 8AM. PM is already writing on the board. Do you go?",
  speaker: 'PM',
  art: 'lecture',
  narrate: true,
  choices: [
    { id: 'go', label: 'Go', locked: false },
    { id: 'skip', label: 'Sleep in', locked: false },
  ],
  isFollowUp: false,
  isAiEvent: false,
}

export const sceneGlobal: SceneView = {
  id: 'e_pandemic',
  kind: 'event',
  phase: 'launch',
  age: 26,
  majorCount: 20,
  title: 'A pandemic shuts the world',
  text: 'Offices empty overnight. Your laptop becomes your office, your gym and your social life. Flights are grounded for two years.',
  art: 'pandemic',
  narrate: true,
  choices: [
    { id: 'adapt', label: 'Build a home routine', locked: false },
    { id: 'scroll', label: 'Doomscroll until it ends', locked: false },
  ],
  isFollowUp: false,
  isAiEvent: false,
}

export const sceneAi: SceneView = {
  id: 'ai_slot_2',
  kind: 'event',
  phase: 'career',
  age: 34,
  majorCount: 20,
  title: 'Your old asso friend calls',
  text: 'Nadia from Automatants wants you as CTO of her climate-data startup. Half your salary, all of the adventure.',
  art: 'garage',
  narrate: false,
  choices: [
    { id: 'ai_0', label: 'Jump in', locked: false },
    { id: 'ai_1', label: 'Advise her on weekends', locked: false },
    { id: 'ai_2', label: 'Wish her luck', locked: false },
  ],
  isFollowUp: false,
  isAiEvent: true,
}

export const sceneJobs: SceneView = {
  id: 'c11_first_job',
  kind: 'major',
  phase: 'launch',
  age: 23,
  majorIndex: 11,
  majorCount: 20,
  title: 'Your first real job',
  text: 'Three offers in your inbox, two dream ones you did not quite get, and a strange email from a recruiter.',
  art: 'bigtech',
  narrate: true,
  choices: [
    { id: 'emp_tramontane', label: 'OpenEye, the frontier-AI lab', hint: 'Equity and chaos', locked: false },
    { id: 'emp_verdant', label: 'Doctors Without Orders, an impact NGO', locked: false },
    { id: 'emp_sterling', label: 'McKinsley, strategy consulting', locked: false },
    { id: 'emp_goldbridge', label: 'Goldmann Sax, investment bank', locked: true, lockedReason: 'Requires Economics 60+' },
    { id: 'ai_surprise', label: 'Hydra Grid, an AI start-up for power grids', hint: 'A recruiter slid into your DMs', locked: false },
  ],
  isFollowUp: false,
  isAiEvent: false,
}

export const beatSimple: Beat = {
  id: 1,
  sceneTitle: 'Which association?',
  sceneKind: 'major',
  choiceLabel: 'Automatants, the CentraleSupélec AI club',
  outcome: {
    deltas: { skillAi: 6, social: 3, energy: -4 },
    arrows: { social: 1, happiness: 1 },
    text: 'You spend your first Friday night training a model to recognise croissants. It works. Mostly.',
    tonnes: 0,
    years: 0,
    promotions: 0,
  },
  ageFrom: 18,
  ageTo: 18,
  promotions: 0,
  student: true,
}

export const beatFull: Beat = {
  id: 2,
  sceneTitle: 'Your work rhythm',
  sceneKind: 'major',
  choiceLabel: 'Grind 55 hours a week',
  outcome: {
    deltas: { money: 9, happiness: -6, social: -5, skillBusiness: 5, energy: -12 },
    arrows: { money: 3, happiness: -2, social: -2, fame: 1 },
    text: 'Ten years of late trains and early decks. The bonus is real. So is the back pain.',
    fact: {
      id: 'who_ilo_2021',
      text: 'Working 55 hours or more a week raises the risk of stroke by about 35% compared with 35 to 40 hours.',
      source: 'WHO / ILO, 2021',
    },
    tonnes: 0,
    chance: 'success',
    years: 10,
    promotions: 1,
  },
  ageFrom: 25,
  ageTo: 35,
  promotions: 1,
  checkStat: 'skillBusiness',
  student: false,
}

export const startupLoading: StartupCard = { sectorId: 'climate', sectorLabel: 'Climate tech', status: 'loading', seen: false }
export const startupReady: StartupCard = {
  sectorId: 'climate',
  sectorLabel: 'Climate tech',
  outcome: 'success',
  status: 'ready',
  seen: false,
  meta: {
    name: 'Fernlight',
    product: 'Grid batteries that bargain with the weather forecast.',
    pitch: 'We store the sun when nobody wants it and sell it when everybody does.',
    investor: 'Northwind Ventures',
    rival: 'Voltasaurus',
  },
}

export const mockSummary: EndSummary = {
  name: 'Lina',
  player: { name: 'Lina', lastName: 'Moreau', gender: 'woman' },
  deathAge: 84,
  title: {
    id: 'burnt_out_consultant',
    title: 'Burnt-out Consultant',
    description: 'Every slide was perfect. Every weekend was a deck. You flew a lot and slept a little.',
    conditions: 'money >= 0',
    priority: 1,
  },
  you: { money: 78, happiness: 41, social: 52, fame: 63, contribution: 34, footprint: 38 },
  earth: {
    scores: { temperature: 41, ocean: 44, biodiversity: 46, livability: 40, tech: 62, ai: 71 },
    temperatureC: 2.9,
    oceanM: 0.59,
    insectsPct: 33,
    heatBillions: 2.2,
    techIndex: 62,
    aiIndex: 71,
  },
  F: 10.8,
  lifetimeT: 713,
  frenchAverageLifetimeT: 607,
  digitalShare: 0.061,
  screenYears: 8.4,
  workT: 6200,
  influenceT: 0,
  materialsT: 1.8,
  receipt: [
    { label: 'Just living in France (8.8 t/yr x 66 yrs)', category: 'other', t: 580.8 },
    { label: 'Business flights, consulting (20 yrs)', category: 'flights', t: 36, sceneId: 'c11_first_job', factId: 'dgac' },
    { label: 'Two long-haul holidays a year', category: 'flights', t: 54, sceneId: 'c17_money', factId: 'dgac' },
    { label: 'Exchange in Singapore (return flight)', category: 'flights', t: 3.2, sceneId: 'c06_exchange', factId: 'dgac' },
    { label: 'Weekend flights during the exchange', category: 'flights', t: 2.5, sceneId: 'c07_travel' },
    { label: 'Comfortable lifestyle (wealth)', category: 'lifestyle', t: 30, sceneId: 'c16_mid' },
    { label: 'Phones, laptops, screens', category: 'digital', t: 5.6, factId: 'ademe_arcep' },
    { label: 'New phone, three times', category: 'digital', t: 0.26, factId: 'ademe_arcep' },
  ],
  topChoices: [
    {
      historyIndex: 10,
      sceneId: 'c11_first_job',
      title: 'Your first real job',
      chosenLabel: 'McKinsley, strategy consulting',
      age: 23,
      impact: 80,
      alternatives: [
        { id: 'emp_tramontane', label: 'OpenEye' },
        { id: 'emp_verdant', label: 'Doctors Without Orders, an impact NGO' },
      ],
    },
    {
      historyIndex: 16,
      sceneId: 'c17_money',
      title: 'What do you do with your money?',
      chosenLabel: 'Two long-haul holidays a year',
      age: 45,
      impact: 60,
      alternatives: [
        { id: 'low_carbon', label: 'Low-carbon comfort' },
        { id: 'give', label: 'Give 10% to climate and health charities' },
      ],
    },
    {
      historyIndex: 11,
      sceneId: 'c12_rhythm',
      title: 'Your work rhythm',
      chosenLabel: 'Grind 55 hours a week',
      age: 25,
      impact: 44,
      alternatives: [
        { id: 'balanced', label: 'Balanced 40 hours' },
        { id: 'four_day', label: 'Four-day week' },
      ],
    },
  ],
  badges: [
    { id: 'kept_it', label: 'Kept it', description: 'You kept your phone instead of buying the new one.' },
    { id: 'pm_regular', label: "PM's regular", description: 'Never missed an 8AM class.' },
  ],
  path: { pathName: 'Consulting', employerName: 'McKinsley' },
  stats: mockStats,
  flags: ['asso_automatants'],
}

export const mockFacts = {
  dgac: { id: 'dgac', text: '', source: 'Base Carbone / DGAC flight factors' },
  ademe_arcep: { id: 'ademe_arcep', text: '', source: 'ADEME-Arcep, digital footprint 2022' },
}

export const mockEpitaph: Epitaph = {
  obituary:
    'Lina Moreau, 84, consultant, sailor of spreadsheets and reluctant early riser, died peacefully in Lyon. She once trained a model to recognise croissants and never stopped bringing it up.',
  linkedinPost:
    'Thrilled to announce my final career move. 61 years, 412 decks, 3 near-burnouts and one croissant classifier later, I want to thank PM for the 8AM classes I attended. Agree?',
  tips: [
    { text: 'Swap one long-haul holiday for a train trip: a Paris-New York return is about 1.8 t CO2e.', source: 'Base Carbone / DGAC' },
    { text: 'Protect two evenings a week from work: long hours raise stroke risk by about 35%.', source: 'WHO / ILO, 2021' },
  ],
}

export const mockRespawn: RespawnResult = {
  historyIndex: 10,
  altChoiceId: 'emp_verdant',
  altLabel: 'Doctors Without Orders, an impact NGO',
  summary: {
    ...mockSummary,
    deathAge: 87,
    title: { ...mockSummary.title, id: 'quiet_hero', title: 'Quiet Hero', description: 'Less money, more meaning.' },
    you: { money: 44, happiness: 66, social: 70, fame: 40, contribution: 82, footprint: 61 },
    earth: { ...mockSummary.earth, temperatureC: 2.4 },
  },
}

export const mockPools = {
  origins: [
    { id: 'lyon', label: 'Grew up in Lyon', blurb: 'Two hours from Saclay by train. Your mum still sends saucisson.' },
    { id: 'intl', label: 'Came from abroad', blurb: 'New country, new language, same group chat at 3AM.' },
    { id: 'paris', label: 'Paris suburbs', blurb: 'You know every RER delay by heart.' },
  ],
  budgets: [
    { id: 'tight', label: 'Tight budget', blurb: 'You will count every euro. It builds character, apparently.' },
    { id: 'comfy', label: 'Comfortable', blurb: 'Parents help. You try not to mention it.' },
  ],
  traits: [
    { id: 'math', label: 'Math brain', blurb: 'Integrals relax you. Worrying.' },
    { id: 'social', label: 'Social butterfly', blurb: 'You know everyone by week two.' },
  ],
}

/** ~45-word narration with four choices: the fold test on a 375×812 phone. */
export const sceneLong: SceneView = {
  id: 'c07_travel',
  kind: 'major',
  phase: 'aidams34',
  age: 21,
  majorIndex: 7,
  majorCount: 20,
  title: 'Life in New York',
  text: 'Your NYU dorm smells of burnt bagels and ambition. Everyone in your seminar has a podcast. Weekends stretch out like an open map: Boston, Montreal, a cheap flight to Miami. Your bank account and your conscience are having a long, awkward conversation about it.',
  art: 'exchange_west',
  narrate: true,
  choices: [
    { id: 'local', label: 'Stay local and study', hint: 'Grades up, wallet intact', locked: false },
    { id: 'trains', label: 'Trains and buses around the region', hint: 'Slow travel, big stories', locked: false },
    { id: 'flights', label: 'A flight every other weekend', hint: 'Seven cities, one tan', locked: false },
    { id: 'yacht', label: 'Charter a sailboat to the Bahamas', locked: true, lockedReason: 'Requires Wealth 80+' },
  ],
  isFollowUp: false,
  isAiEvent: false,
}

export const beatMini: Beat = {
  id: 3,
  sceneTitle: "PM's 8AM class",
  sceneKind: 'mini',
  choiceLabel: 'Go',
  outcome: {
    deltas: { grades: 3, energy: -3 },
    arrows: { happiness: -1 },
    text: 'PM nods at you. You think. It might have been a yawn.',
    tonnes: 0,
    years: 0,
    promotions: 0,
  },
  ageFrom: 18,
  ageTo: 18,
  promotions: 0,
  student: true,
}
