# RESPAWN content guide

For teammates who want to write or tweak the story **without touching code**. Everything a player reads and every number the engine uses lives in `src/content/data/`. The engine only reads that data; the AI narrator rewrites texts but never sets numbers.

**Golden rule: after any edit, run `npm run check-data`.** It validates every file against the contract (`src/content/schema.ts`), checks ids and references, then plays 2,000 random lives to find unreachable scenes, never-chosen options and never-obtained endings. `npm test` runs the same contract tests plus the "forbidden words" check. `npm run simulate` prints the balance report (temperature, lifespan, radar poles per strategy).

## 1. Where things live

| File | What |
|---|---|
| `constants.json` | Start stats, bounds, footprint and planet numbers, yearly rules, promotion effects, the 4 AI event slots, **flag memories** (what the narrator remembers), badges |
| `profiles.json` | Random origin, family budget, trait (with their stat bumps) and default first names |
| `scenes/arrival.json` … `scenes/oldage.json` | The 20 **majors** (`c01_…` to `c20_…`) by life phase, plus their follow-up scenes |
| `scenes/minis.json` | One-tap **minis** (`m_…`): PM's 8AM ×2, one sète + 3AM, the new phone, the ESSEC asso fair, Grounded. Keep them few (pacing budget below) |
| `scenes/events.json` | **Events** (`e_…`): global (pandemic, AI shock, war, heatwaves), consequence (burnout, scandal, addiction, loneliness, divorce, startup exit, teen anxiety, whistleblower, PM again, sport), the AI-slot fallback |
| `assos.json` | The asso pool for C03 (4 categories, ESSEC + CentraleSupélec) |
| `destinations.json` | The 13 exchange universities with continent and trip tonnes (C06 offers one per continent) |
| `paths.json` | Careers: yearly effects, business flights, AI exposure, `field` (for the AI job-loss ban) |
| `employers.json` | Employers offered at C11 (and when changing job), under the parody names of `docs/GAME_DESIGN.md` §0 |
| `startup_sectors.json` | The 6 sectors offered when you found a startup |
| `ai_templates.json` | Outcome menus the AI picks from for generated events and the surprise job offer |
| `facts.json` | "Did you know?" facts. **Each needs a real source.** |
| `endings.json` | End titles, chosen by the highest `priority` whose conditions hold |
| `characters.json` | Recurring characters (PM, Lou, Noa, Bertrand, Malik, your partner, your kid) |

## 2. Life timeline (ages)

Scenes are ordered by `age` (decimals are fine: `18.6`). At the same age the engine shows events, then minis, then AI slots, then the major.

| Age | What happens |
|---|---|
| 18 | C01 housing · C02 phone habits · C03 asso fair |
| 18.2–19.4 | PM's 8AM (18.2, and 18.75 at p 0.6) · ESSEC asso fair (19, if you waited) · C04 (19) · sète + 3AM (19.4, not library monks) |
| 20–21.5 | C05 summer internship · new phone (20.2, p 0.4) · C06 exchange (20.4) · C07 travel · C08 research paper (21) · C09 6-month internship + return-offer skill check |
| 22–24 | C10 after AIDAMS (Master's +1 yr, PhD +3 yrs, gap year +1 yr) · C11 first job · pandemic window (24–30) |
| 25–40 | C12 work rhythm · C13 family (30) · C14 flagship project (33) · C15 online presence (36) · AI shock (38–40) · C16 mid-career (40) |
| 41–60 | C17 money (45) · war (48–55) · whistleblower (44–58) · C18 late career (55, skipped if you stayed 20 years) |
| 65–death | C19 retirement · AI slot 68 · heatwaves · Grounded (74.5, never flew) · C20 legacy (75) |

Consequence events (burnout, scandal, addiction, loneliness, divorce…) fire whenever their conditions hold.

**Pacing budget.** Playtests showed that many small choices drown the main story. A life must average **≤ 28 decisions** (p90 ≤ 31): 20 majors plus ~3 minis and ~4–5 events. `tools/pacing.test.ts` fails above 28, and `npm run simulate` prints the split per strategy. Before adding a mini or an event, prefer making it depend on an earlier choice, and check the budget.

Choices with `years` make time jump: majors and minis whose age is passed are **skipped** unless they have `"mandatory": true` (all 20 majors and the ESSEC asso fair are mandatory).

## 3. Stats and the character sheet

Use these **display names** in every `lockedReason` ("Requires Math & AI ≥ 60"), never the raw keys.

| Key | Display | Scale | Notes |
|---|---|---|---|
| money | Wealth | 0–100 | ≥ 70 adds a rich-lifestyle footprint |
| happiness | Happiness | 0–100 | |
| social | Social | 0–100 | Drives happiness and lifespan |
| fame | Fame | 0–100 | |
| contribution | Impact | 0–100 | |
| intellect | Intelligence | 0–100 | PM's class, research, debates; gates the PhD |
| skillAi | Math & AI | 0–100 | AI club, hackathons, coding interviews, AI shock |
| skillBusiness | Economics | 0–100 | Finance clubs, case interviews, investing, pitches |
| skillSoft | Charisma | 0–100 | Theatre, sport, sètes, negotiations, relationships |
| energy | Health | 0–100 | < 20 (or < 30 while grinding) triggers burnout |
| network | Network | 0–100 | Hidden offers, skill checks on contacts |
| grades | Grades | 0–100 | Student years; research-lab internship, PhD |
| ethics | Integrity | −50..50 | < −30 triggers the scandal |
| addiction | Vices | 0–100 | > 57 triggers the addiction event; costs lifespan |
| tech, ai | Tech / AI progress | 0–100 | Planet graph only |
| aiLever | AI lever | −0.10..0.05 | How your work bends world emissions |
| screenHours | Screen time | h/day | 2.33 = average |
| workHours | Work hours | h/week | ≥ 55 = grinding |

### Effect intensity scale

Values in `stats` are **raw intensities**. On the 0–100 stats (all visible stats, skills, Health, Network, Grades) they have diminishing returns: `+10` on a stat at 50 only adds about `+5`, and the higher the stat, the smaller the gain. Integrity, Vices, tech, ai, aiLever, screen time and work hours are linear.

| Raw value | Feels like | Arrow shown |
|---|---|---|
| ±3 | small (a good evening, a minor setback) | ↑ |
| ±6 | medium (a real choice, a new habit) | ↑↑ |
| ±10 | big (a job, a family, a scandal) | ↑↑ or ↑↑↑ |
| ±15 | huge (a life-defining move) — use rarely | ↑↑↑ |

**Every major option needs at least one cost** (a negative stat, tonnes, a lock later on). If an option has no downside the simulator will flag it as dominant.

## 4. How to add things

### A choice (inside any scene's `choices`)

```json
{
  "id": "c17_garden",
  "label": "Grow your own vegetables",
  "hint": "Dirt under your nails",
  "conditions": "money >= 30",
  "lockedReason": "Requires Wealth ≥ 30",
  "effects": {
    "stats": { "happiness": 4, "money": -2 },
    "flags": ["gardener"],
    "footprint": [{ "label": "Home-grown vegetables", "category": "lifestyle", "annual": { "id": "garden", "tPerYear": -0.1 } }],
    "factId": "f_carbone4",
    "text": "Your first tomato costs you forty euros and is the best thing you have ever eaten."
  }
}
```

- `id`: snake_case, unique, prefixed by the scene (`c17_…`, `m_…`, `e_…`).
- `label` ≤ 40 characters (phone screens). `hint` ≤ 60 characters and **never a number**.
- `conditions` false → the choice is shown **greyed** with `lockedReason` (required). `visibleIf` false → hidden (use sparingly, e.g. "only for finance people").
- `effects.text` is the one-line consequence; the AI may rewrite it.
- `next: "scene_id"` opens a follow-up scene, which must have `"followUpOnly": true`.
- A **skill check** is a `chance` with `modifiers` on skills; name the check in both texts:

```json
"chance": {
  "p": 0.4,
  "modifiers": [{ "stat": "skillSoft", "per": 0.35 }],
  "success": { "stats": { "money": 7 }, "text": "Salary negotiation: your Charisma closed it." },
  "failure": { "stats": { "happiness": -3 }, "text": "Charisma check failed: 'we'll revisit in six months'." }
}
```

`p` moves by `per × (stat − 50) / 50` for each modifier (so `per: 0.35` gives +35% at 100, −35% at 0), clamped to 2–98%.

### Effects reference

| Field | Meaning |
|---|---|
| `stats` | Additive deltas (see scale) |
| `set` | Absolute values, applied first (`screenHours`, `workHours`) |
| `flags` / `unflags` | Memory of the choice. Add a sentence for each new flag in `constants.flagMemories` |
| `footprint` | Tonnes CO2e: `oneOffT`, or `annual` `{ id, tPerYear, years | untilAge }`, `workT` (what your job runs), `influenceTPerYear` (your audience), `materialsKg`, `deviceMultiplier`, `genAiTPerYear`. Label as it should appear on the receipt; add "(design estimate)" when it is not a sourced number |
| `years` | Time jump after the choice |
| `path` | `{ "pathId": "ngo", "employerId": "verdant" }` starts a career; `leavePath: true` ends it |
| `promotionChance` | Chance of promotion at each decade in the path |
| `skipScenes` | Scenes that won't happen any more |
| `badges` | End-screen badges (defined in `constants.badges`) |
| `factId` | Shows a "Did you know?" from `facts.json` |

### A scene (major, mini or event)

```json
{
  "id": "m_bake_sale",
  "kind": "mini",
  "phase": "aidams12",
  "age": 19.15,
  "order": 1,
  "p": 0.8,
  "conditions": "flag:in_asso",
  "title": "The Bake Sale",
  "text": "Your asso needs money for the gala. Someone suggests a bake sale. Someone else suggests a crypto token. Everyone looks at you.",
  "art": "campus",
  "ai": { "tone": "student chaos", "hints": ["Name the player's asso."] },
  "choices": [ … ]
}
```

- **Base texts**: 2–4 sentences, ≤ 420 characters, second person ("you"), no gendered pronouns for the player. The narrator rewrites them with the player's name and history; the base text is what shows if the network drops.
- `art` must be one of: campus, lecture, party, library, dorm, airport, research, exchange_asia, exchange_west, finance, bigtech, lab, ngo, garage, home, burnout, beach, retirement, graveyard, stage, pandemic.
- `variants`: `[{ "conditions": …, "text": "…", "effects": { … } }]`. The first matching variant with `text` replaces the base text; **all** matching variants' `effects` are added to whatever the player chooses (that is how the pandemic hits finance differently from Big Tech).
- `speaker`: a character id (`pm`, `roommate`, `stranger_3am`, `first_manager`, `asso_friend`, `partner`, `kid`).
- `ai.hints`: tell the narrator what to call back ("If flag skipped_pm, PM remembers the empty seat").
- **Majors**: `kind: "major"`, `order` 1..20, `age`, `mandatory: true`. Keep exactly 20 (follow-ups use `followUpOnly: true` and don't count).
- **Minis**: `kind: "mini"`, `age`, optional `p` (rolled when due) and `conditions` (false → skipped).

### An event

- **Timed** (`family` `global`, `life` or `student`): give a `window: [minAge, maxAge]` and `p`. The engine rolls once per life at the start whether it fires and at what age; `conditions` are checked when that age arrives.
- **Consequence** (`family: "consequence"`): no window; fires as soon as its `conditions` hold (burnout, scandal, addiction, loneliness, the startup cash-out). Fires once unless `repeatable`.
- **AI-slot fallbacks**: `followUpOnly: true`, referenced by `constants.aiEventSlots[].fallbackSceneId`. They show when the AI is offline or returns something invalid.

Planet feedback during play: conditions can use the **projected end metrics** `temperature`, `F` (t/yr), `footprintScore`, `lifespan`. The heatwave event uses `"temperature >= 2.5"`, so it only hits lives whose "everyone like you" Earth is hot; its variant softens it for insulated / low-tech homes.

### An asso (`assos.json`)

A choice plus `category` (`sport`, `arts`, `corpo`, `impact`), `school` (`ESSEC` or `CentraleSupélec`) and a one-sentence `blurb`. Always add `in_asso` and `asso_<id>` flags, and a category flag where it unlocks things: `SPORT` (tournament and injury events), `TECH` (AI offers), `FIN` (finance offers), `STARTUP`, `GREEN` (impact offers). C03 draws one asso per category each life.

### An employer (`employers.json`)

A choice plus `pathId`, `name` (**a parody name from the official list in `docs/GAME_DESIGN.md` §0, never a real company and never a new invented one**), `tagline` (satirical, one line), `prestige` (1–10: higher is offered more often and shown greyed as an aspiration when locked) and optional `perDecade` effects on top of the path. Add `worked_<id>` to its flags (endings use them) and `flew` if the path has business flights. Keep the `id` stable when renaming (saves, sprites, conditions and tests use it); `npm run check-data` warns if one of the old invented names (list in `tools/check-data.ts`) comes back.

**Names in text.** Companies, apps and products in any player-facing text use the official parody list too (a social app → InstaGran or TikTac, the chatbot → ChatGBT, the work chat → Slacker, the phone → the aiPhone, a rail pass → InterRêve). The surprise offer at C11 picks its name from `constants.surpriseEmployers` (parody names that are not regular employers). Gate prestigious employers with `conditions` on internship flags (`OFFER_*`), interview flags (`aced_case`, `aced_coding`, `aced_quant`, `aced_policy`) or skills, with a display-name `lockedReason`.

### A path (`paths.json`)

`field` is shown to the player after an AI job loss ("No one in **consulting** hires after the AI shock"), so write it in plain words. `annual` is the path's yearly footprint (business flights). `aiExposure` documents how the AI shock treats it (the shock's logic itself lives in the `e_ai_advance` variants).

### A fact (`facts.json`)

One sentence, real numbers, and a `source` (organisation + year). Attach it with `factId` on the choice where the number matters. Design values that are our own estimates must say so ("design estimate").

### An ending (`endings.json`)

`conditions` can use stats, flags and the end metrics (`temperature`, `F`, `footprintScore`, `lifespan`). Highest `priority` wins. Keep `end_ordinary_legend` last with `"conditions": "age >= 0"` (always true).

## 5. Condition syntax

| Form | Example |
|---|---|
| Compare a stat, `age`, `promotions`, `yearsInPath` | `"skillAi >= 60"`, `"age > 30"` |
| End metrics (projected during play) | `"temperature >= 2.5"`, `"F < 5"` |
| Path / employer (`none` when unemployed) | `"path == finance"`, `"employer != panoptis"`, `"path != none"` |
| Profile | `"profile.budget == tight"`, `"profile.origin == intl"`, `"profile.trait == math"` |
| Flags | `"flag:TECH"`, `"!flag:SHALLOW"` |
| A recorded choice | `"chose:c03_asso=asso_utopia"` |
| Combine | `{ "all": [ … ] }`, `{ "any": [ … ] }`, `{ "not": … }` |

Operators: `>= <= > < == !=`. `!` only works before `flag:` or `chose:`; otherwise use `{ "not": … }`.

## 6. Placeholders

Usable in titles, texts, labels and hints: `{name}`, `{employer}` (falls back to "your employer"), `{path}`, `{university}`, `{city}`, `{country}` (the exchange), `{startup}`, `{age}`. Footprint labels are **not** filled, so don't use placeholders there.

## 7. Tone guide

Witty, warm, specific, a little satirical. Reigns punch, BitLife breadth. Rooted in real AIDAMS life: the plateau de Saclay wind, the RER B, Cergy vs Saclay, sètes, the forum entreprises, Parcoursup, PM's 8AM class. **The planet message comes through trade-offs and facts, never through lectures.** No real company or brand names (fictional employers, fictional apps like Blipz); real schools, partner universities and student assos are fine. The professor is only ever **PM**.

| Bad | Good | Why |
|---|---|---|
| "You decide to fly to New York, which is very bad for the planet." | "A $9 coffee, a $3,000 room, a priceless skyline. Your stories have never looked this expensive." | Show the fun; the receipt and the fact do the rest. Never moralise. |
| "You join a social media company. Social media is addictive and harmful." | "Your first project: make people scroll four seconds longer. You succeed. Somewhere, a teenager misses their bus stop." | Satire through a concrete, specific image. |
| "Choose an option for your work-life balance." (label: "Option A: Work 55 hours per week for promotion") | "Your manager calls you 'high potential', which is how they say 'stay late'." (label: "Grind: fifty-five hours and up") | Short labels, a voice, a joke the player recognises. |

Checklist before committing: second person, no gendered pronouns for the player, ≤ 420 characters, a cost on every major option, a source on every fact, a display name in every locked reason, and `npm run check-data` with 0 errors.
