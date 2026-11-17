# Engine semantics (how content is interpreted)

Contract types: `src/content/schema.ts` (content) and `src/engine/types.ts` (engine API). This file says what the engine does with the data, so content authors and the engine agree.

## Life flow
1. `createGame(content, { seed, name })`: start stats = `constants.startStats`; random profile (origin, budget, trait, weighted by `weight`) whose `effects` are applied; name = given or random from `profiles.names`. Age 18, phase `arrival`. Windowed events are **pre-rolled** with the seed: for each scene of kind `event` with a `window`, roll `fires = rng < p` and `fireAge = window[0] + rng × (window[1] − window[0])`.
2. `resolveNext(content, state)` finds the next step and stores it in `state.pending`. Order of precedence:
   1. A follow-up (`choice.next`) from the previous choice.
   2. **Consequence events** (`family: "consequence"`, no window or window containing the current age) whose `conditions` hold and that have not fired (or `repeatable` and cooldown elapsed): roll `p` (default 1) → fire now.
   3. The **earliest timed item** among: the next major (lowest `order` not done/skipped), minis (`kind: "mini"`, by `age`), pre-rolled windowed events that fire, unused AI slots (`constants.aiEventSlots`). Ties at the same age: events, then minis (by `order`), then AI slots, then the major. Time advances to that age (yearly accrual, see below), then its `conditions` are evaluated **at that moment**: false → skipped (majors and minis) or dropped (events). Minis roll `p` at that moment.
   4. When major #20 is done (or no major remains): advance to the death age (accrual continues), `ended = true`, step = `end`.
3. `getStep` returns the pending step (pure). `choose(content, state, choiceId)` applies the choice, records history, then the UI calls `resolveNext` again.

## Time
- Every year passed applies **yearly accrual** (`constants.yearly`, path `perDecade` / 10, footprint for that year, promotions at each 10-year anniversary in the path with `promotionChance`, grind years, screen hours).
- `effects.years` makes time jump right after the choice. Majors and minis whose age is passed during a jump are **skipped** (unless `mandatory`). Windowed events whose fire age passed during a jump fire right after the jump (still relevant).
- Phase = the phase of the scene being shown (majors set it).

## Applying a choice
Order: locked check (must be unlocked) → `effects.set` → `effects.stats` (diminishing returns on 0–100 stats) → flags/unflags → footprint entries (one-offs dated now, annual modifiers from now) → path/leavePath → promotionChance → skipScenes → badges → matching scene `variants[].effects` → `chance` roll (p with modifiers, clamped [0.02, 0.98]) and its success/failure effects → `years` jump.
- `Outcome.arrows` buckets for visible stats: |Δ| < 0.5 → 0, < 3 → ±1, < 7 → ±2, ≥ 7 → ±3.
- Text placeholders filled by the engine in titles, texts, labels, hints: `{name}`, `{employer}`, `{path}`, `{university}`, `{city}`, `{country}`, `{startup}`, `{age}`.

## Dynamic choices (built once when the scene becomes pending, then frozen in `pending.dynamicChoices`)
- `assoDraw`: one asso per category (seeded draw among those whose `visibleIf` holds), then the scene's static `choices` (e.g. "No association"). Asso `conditions` false → greyed with `lockedReason`.
- `exchange`: one destination per continent (`europe`, `north_america`, `south_america`, `asia_oceania`), each drawn at random (seeded) among that continent's destinations whose `visibleIf` holds. Nothing is locked and grades play no part. Each card's hint is `{short name} · {city} · Train|Plane ≈ {tripT} t`, so the low-carbon option is visible before clicking. Choosing sets `state.exchange` and applies the destination's effects + its trip footprint (`tripT`, category `flights` unless `byTrain` → `travel`).
- `jobOffers`: eligible employers (`conditions` true, path allowed, path `field` not in `state.bannedFields`) → `count` drawn (seeded, weighted toward higher `prestige`), then up to `lockedCount` of the highest-prestige **ineligible** employers shown greyed with their `lockedReason` (banned fields show "No one in {field} hires after the AI shock"). Choosing an employer applies its `effects` and sets `path = { pathId, employerId }`, `promotionChance = path.defaultPromotionChance` unless the effects set one. `injectSurpriseOffer` appends choice id `ai_surprise` (validated: path exists and is not banned, template id in `constants.surpriseOfferTemplateIds`); choosing it rolls the template and sets the path with `employerName` from the draft.
- `startupSectors`: one choice per sector; choosing rolls `successP` (+ modifiers) → `success` / `failure` effects, sets `state.startup = { sectorId, outcome }`.
- Static `choices` of a dynamic scene are appended after the dynamic ones.

## Careers
- A path applies `perDecade` / 10 every year, plus the employer's `perDecade`, plus the path `annual` footprint as modifier id `path:<pathId>` (removed when leaving).
- AI job loss: an event effect sets flag `ai_job_loss` + `leavePath: true`; the engine also adds the lost path's `field` to `bannedFields`.

## Footprint and end
- Each year: baseline `constants.footprint.baselineTPerYear` + active annual modifiers + digital (devices × multiplier + networks + video delta + GenAI) + influence (separate) — summed into `lifeT` / `digitalT` / `influenceT`. One-offs add to `lifeT` when applied. Money ≥ `richThreshold` adds `richLifestyleTPerYear` unless flag `low_carbon_comfort`.
- End: formulas of GAME_DESIGN §5 with `constants.planet`, lifespan with `constants.lifespan`. Title = highest-`priority` ending whose conditions hold (extra keys: `footprintScore`, `temperature`, `lifespan`, `F`). Receipt groups one-offs and modifiers by label, sorted by tonnes, plus the baseline line.

## AI slots
At a slot's age the step is `{ type: 'ai_slot' }`. The UI asks Claude for an `AiEventDraft` (2–3 choices, each with a `templateId` from `content.aiTemplates`) and calls `injectAiEvent`. Invalid draft or `null` → the slot's `fallbackSceneId` (a normal event scene, `followUpOnly: true` so it never fires on its own). Choosing an AI choice rolls the template outcomes by `p`.

## Respawn
`respawnSimulate` restores `history[i].before`, applies the alternative choice, then auto-plays: at each later scene, re-pick the originally recorded choice id if it is offered and unlocked, else the first unlocked choice; AI slots use the fallback; no surprise offer. Same seed → only the decision changes.
