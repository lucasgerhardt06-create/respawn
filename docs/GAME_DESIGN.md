# RESPAWN — Game Design (source of truth)

> One life. Twenty choices. Eight billion consequences.

Consolidated from the team Google Doc "Cohesion Day - group 7" (tab "Plan complet : game design + IA" by Lucas = backbone, tab "Choice arch - Full choices and weights" = content and physical model, "Review" section = mandatory corrections) and Lucas's decisions of 17 Nov 2026.

## 0. Non-negotiables

1. **Language: English.** All player-facing text in English.
2. **No real company or brand in scene text: each one gets a recognisable parody from the official name list below**, and the game never invents other company names (the player's own startup, its investors and rivals excepted). ESSEC, CentraleSupélec, AIDAMS, the student associations and the partner universities keep their real names. Real names appear only where sources must be named (`facts.json` sources, the "about the data" lines).

   **Official name list** (source of truth; `server/ai/filter.ts` and `tools/check-data.ts` reject the real names, `server/ai/filter.test.ts` checks every row):

   | Real name | In the game |
   |---|---|
   | LinkedIn / YouTube / Instagram / TikTok / Facebook | LinkedOut / YouTub / InstaGran / TikTac / FaceBuk |
   | ChatGPT / OpenAI / Bitcoin | ChatGBT / OpenEye / Bitcorn |
   | Google / Meta / Apple / Amazon / Microsoft / Nvidia | Goggle / Metta / Appel / Amazoom / Microsift / Envidia |
   | Goldman Sachs / J.P. Morgan | Goldmann Sax / J.B. Morgane |
   | McKinsey / BCG / Bain | McKinsley / BCJ / Bain-Marie |
   | Interrail | InterRêve |
   | United Nations / OECD | United Notions / OECB |
   | Doctors Without Borders · Slack · iPhone | Doctors Without Orders (NGO) · Slacker (work chat) · aiPhone (Appel's phone) |
   | Palantir · TotalEnergies · LVMH · BlackRock · EDF · DeepMind · Institut Pasteur | Palantire · TotalEnnemies · LVMeh · GreenRock · EDEffort · DeepBlind · Institut Pasteurisé |

   The last row extends the original list for employers that had no match (team decision, Nov 2026).
3. **The professor is only ever called "PM".** Never write his full name anywhere (code, data, prompts, comments).
4. **Locked choices are shown, greyed out, with the reason** ("Requires grades ≥ 75"). Never hide them.
5. **Exchange (Year 3) is mandatory** for everyone. The choice is *where* (one university per continent, drawn at random; grades play no part) and *how much you travel* while there. The summer after the exchange is a mandatory research paper.
6. **If a job is lost to AI, you cannot be re-employed in the same field.**
7. **AI is always on.** Every scene is narrated by Claude. The engine still decides every number, and every scene has a base text so the game never blocks if the network drops.
8. **What matters most is the big life choices** (which employer, which career, flights, family, ethics), not gadgets. Devices are a light recurring temptation, not a major choice.
9. **Data-driven.** All content and every number live in `src/content/data/*.json`. The engine contains no story.

## 1. Vision

A pixel-art life sim played on a phone in ~12 minutes. You are admitted to AIDAMS (the ESSEC × CentraleSupélec BSc in AI, Data and Management Sciences, taught in English, Saclay and Cergy campuses). You live one whole life, from your first week at 18 to your death, through ~20 major choices plus quick moments and random events. At death you see:

1. **YOU**: a 6-pole radar of your life.
2. **THE EARTH IN 2100 if 8 billion people lived like you**: temperature, ocean rise, biodiversity, livability, tech progress, AI advancement — computed from real data.
3. **Your carbon receipt**: your life as a till receipt, line by line, each line sourced.
4. **Your epitaph**, written by Claude (obituary + "the LinkedOut post of your life" + 2 concrete tips).
5. **RESPAWN**: go back to one of the 3 choices that weighed most and see the other life's radar overlaid on yours.

The message (environment, digital sobriety, social impact) passes through trade-offs, never lectures. The planet is **hidden during play** (only ambient cues: the sky warms, the sea line rises in the pixel scene) and **revealed at the end** — that reveal is the awareness shock.

References for feel: Reigns (one decision per card, punchy), BitLife (life sim breadth), 1in8b.life (the "if everyone lived like you" frame), Papers Please / Celeste / Stardew (pixel craft). Tone: witty, warm, student humour, a little satirical about careers. Never preachy.

## 2. Core loop

Read a short scene (2–4 sentences, narrated by AI for *you*) → pick one of 2–5 options (locked ones greyed) → a one-line consequence with ↑↓ arrows on gauges and sometimes a "Did you know?" fact with its source → time jumps.

- **20 major** choices carry the story. Around them, few small moments: ~3 **minis** per life (1 tap: PM's 8AM class, one sète and its 3AM, the new phone) and ~4–5 **events**, mostly the ones whose outcome depends on earlier choices (AI shock, pandemic, war, heatwaves, burnout, scandal, addiction, loneliness, divorce, startup exit, PM again), including **one AI-generated event** (age 68) built from templates.
- Pacing target: **≤ 28 decisions per life on average, p90 ≤ 31** (`tools/pacing.test.ts`; `npm run simulate` prints the split). A full life is about 11–12 minutes at ~25 s per decision.
- The internship (C09) ends with a return-offer skill check that can open prestigious employers at C11.
- Long options consume more years ("stay 20 years") and can skip later scenes.

## 3. Stats

### Visible during play (gauges, 0–100, start ≈ 50 = an average AIDAMS life)
| Key | Name | Meaning |
|---|---|---|
| money | Money | Wealth and income |
| happiness | Happiness | Health, energy, wellbeing |
| social | Social | Friends, partner, family, community |
| fame | Fame | Visibility, network, reputation |
| contribution | Impact | Positive effect on others |

Feedback shows only arrows (↑, ↑↑, ↓…), never exact numbers.

### Character sheet (skills, 0–100, visible on demand, RPG-style)
| Key | Display | Raised by | Used for |
|---|---|---|---|
| intellect | Intelligence | PM's class, reading, research, travel, debates | research, exams, critical choices, PhD |
| skillAi | Math & AI | AI club, hackathons, coding, quant | tech/AI offers, coding interviews, AI shock |
| skillBusiness | Economics | finance/econ clubs, internships, startups | finance/consulting offers, case interviews, fundraising |
| skillSoft | Charisma | theatre, sport, parties, associations | negotiations, pitches, promotions, relationships |
| energy | Health | sleep, sport, balance | burnout < 20 |
| network | Network | assos, forums, sètes, alumni | hidden offers, fundraising |
| grades | Grades | studying, PM's class | research-lab internship, PhD |
| ethics | Integrity | refusing shady projects | scandal, endings |

Skill checks: `chance.modifiers` on skills ("Case interview: Economics + Charisma check") and locked reasons using display names ("Requires Math & AI ≥ 60"). The character sheet shows the change after each choice (+Math & AI).

### Hidden
| Key | Range | Role |
|---|---|---|
| energy | 0–100 | < 20 triggers burnout |
| network | 0–100 | Hidden offers, fundraising |
| ethics | −50..50 | Scandal < −30; colours narration and endings |
| grades | 0–100 | Student years; research-lab internship, PhD |
| addiction | 0–100 | Raised by parties/vices; costs lifespan and happiness |
| tech, ai | 0–100 | Your contribution to tech/AI progress (planet graph) |
| aiLever | −0.10..+0.05 | How your work bends world emissions (AI for climate vs scale-at-all-costs) |
| screenHours | h/day | Social video time (default 2.33) |
| workHours | h/week | Default 40; grind 55 |
| flags | strings | Memory of choices: `asso_automatants`, `skipped_pm`, `met_3am`... |

### Diminishing returns (0–100 stats)
`v' = v + d·(1 − v/100)` if d > 0, `v' = v + d·(v/100)` if d < 0, then clamp. Ethics, addiction, tech, ai: linear + clamp. Content values are "raw intensity": +10 moves a mid stat by ~5.

### Yearly accrual (applied for every year that passes)
- Career path: `perDecade` effects / 10 per year.
- Screens (rule 1): > 3 h/day: happiness −0.4/yr; ≤ 1 h/day: happiness +0.2, social +0.2/yr. +64 g CO2e per extra hour vs the 2.33 h average.
- Grind (≥ 55 h/week): happiness −0.6, social −0.6 per year; −0.15 years of life per year of grind.
- Social → happiness (rule 3): happiness += 0.025 × (social − 50) per year.
- Money ≥ 70 adds a +1.5 t/yr lifestyle modifier unless flag `low_carbon_comfort`.
- Fame > 80 with > 3 h/day screens: happiness −0.5/yr.
- Energy recovers +3/yr toward 70 unless grinding.

## 4. Footprint model (physical, sourced)

Tracked in tonnes CO2e:
- **Baseline life**: 8.8 t/yr (food, housing, public services — the part of a French footprint outside the player's digital choices; French average 9.2 t in 2022 minus 0.4 t digital). Reported honestly on the receipt as "Just living in France".
- **Annual modifiers** with age ranges: business flights +1.8 t/yr (Finance, Consulting, Diplomacy), low-carbon comfort −2.5 t/yr, Isolation path −4 t/yr, money ≥ 70 +1.5 t/yr, long-haul holidays +3.6 t/yr...
- **Digital per year**: devices 0.20 t × device multiplier + networks/data centres 0.20 t + video (screenHours − 2.33) × 365 × 0.064 kg + GenAI use (0 to 0.08 t/yr).
- **One-offs**: flights and big purchases (Paris–NY return 1.8 t, Paris–Singapore 3.2 t, Bali 2 t, Interrail 0.1 t...).
- **Work footprint** (separate): what your job runs (frontier model training ≈ 20,000 t). Feeds `aiLever`, shown on end screen, not in your personal footprint.
- **Influence footprint** (separate): watch time you generate as a creator (1 M views/day × 5 min ≈ 1,900 t/yr).
- **Raw materials** (kg): devices (laptop ~588 kg, smartphone ~200 kg to make).

F = average annual life footprint (lifetime life t / years lived since 18).

## 5. End graphs

### YOU (0–100, higher = better)
money, happiness, social, fame, contribution, **footprint** = `100 × (1 − (F − 2)/14)` (2 t/yr = 100, 9.2 t ≈ 50, 16 t = 0).
Also shown: lifespan, digital share of footprint (French average 4.4%), years spent on screens.

### THE EARTH IN 2100 if everyone lived like you
| Pole | Formula | Score 100 → 0 |
|---|---|---|
| Temperature | `T = 1.4 + 1.3 × (F / 9.2) × (1 + aiLever)` (IPCC AR6 TCRE near-linear; 1.4 °C today, 2.7 °C current policies) | 1.5 °C → 4.4 °C |
| Ocean rise | interpolate IPCC AR6 medians: 1.4→0.38 m, 1.8→0.44, 2.7→0.56, 3.6→0.68, 4.4→0.77 | 0.38 m → 0.77 m |
| Biodiversity | insects losing > half range: 1.5 °C→6%, 2→18%, 3.2→49% (Warren 2018); score = 0.7 × climate score + 0.3 × (100 − 5 × materials tonnes) | |
| Livability | billions in unprecedented heat `H = 0.4 + 1.33 × (T − 1.5)` (Lenton 2023) | 0.4 bn → 4.3 bn |
| Tech progress | tech index | higher = more advanced (neutral) |
| AI advancement | ai index (+ IEA data-centre case shown) | higher = more advanced (neutral) |

An average French life lands at 2.7 °C; a 2 t life at ~1.7 °C. Even the most frugal player stays above 2 °C because ~8.8 t/yr is systemic — the debrief says so: individual sobriety matters, system change (policy, energy, the jobs you take) does most of the work.

### Lifespan
`83.1 + 3 × (social − 50)/50 − 0.15 × grindYears − 4 × addiction/100`, clamp 76–98 (INSEE 2025: women 85.9, men 80.3).

### Titles (endings.json)
Chosen by radar shape: "Carbon Unicorn" (money+fame high, footprint low), "Frugal Researcher", "Burnt-out Consultant", "Quiet Hero", "Doomscroll Royalty", "The Whistleblower", "Panopticon Architect", "Off-Grid Sage", "Ordinary Legend" (fallback)...

### Carbon receipt
Lines = one-offs and modifiers grouped by the choice that caused them, sorted by tonnes, each with its source. Life choices dominate (career flights, exchange, holidays, lifestyle); devices appear as small lines. Bottom: "Just living in France (8.8 t/yr × N years)" and the total vs French average.

### Respawn
The 3 most impactful major choices (impact = Σ|visible deltas| + 10 × tonnes caused + path changes) are offered. Pick one + an alternative option → the engine re-simulates the rest of the life deterministically (same seed; later recorded choices kept when still available) and overlays both radars and both Earths ("+0.4 °C"). Option to replay live from that point.

## 6. Pacing (≈ 20 majors)

| Phase | Age | Majors | Minis / events |
|---|---|---|---|
| 0. Arrival | 18 | C01 | Random profile reveal |
| 1. AIDAMS Y1–Y2 | 18–20 | C02–C05 | PM 8AM ×2, one sète (+3AM), first phone temptation |
| 2. AIDAMS Y3–Y4 | 20–22 | C06–C09 | Return-offer skill check inside C09 |
| 3. Launch | 22–25 | C10–C11 | Pandemic window |
| 4. Career | 25–45 | C12–C16 | AI shock, burnout, loneliness, teen anxiety, old asso friend |
| 5. Maturity | 45–65 | C17–C18 | War/energy crisis, whistleblower |
| 6. Old age | 65–death | C19–C20 | One AI-generated event (68), heatwaves if T ≥ 2.5 °C |

Student years ≈ 9 majors of 20 (a little under half the decisions, ~25–30% of play time since minis are fast).

## 7. The majors (content outline — numbers are starting points, balance with the simulator)

Effects notation: M money, H happiness, S social, F fame, C contribution. "t" = tonnes CO2e.

**C01 — Age 18, Arrival: where do you live in Year 1?** Campus residence at Saclay (S+4, cheap), Paris flatshare and commute (S+6, M−4, energy−5, +0.1 t/yr while student), stay at your parents' (M+4, S−4). Random profile (origin, family budget, trait) is revealed first.

**C02 — Year 1: your phone habits** (persists until C15). Intentional ≤ 1 h/day social (H+6, S+4, F−3, screenHours 1); average ~2 h 20 (screenHours 2.33); doomscroll and post daily 4 h+ (H−8, S−2, F+8, screenHours 4.3, flag CREATOR). Facts: Allcott 2020 (deactivation raised wellbeing, freed ~1 h/day), Surgeon General 2023 (> 3 h/day doubles depression/anxiety risk in teens), DataReportal 2025 (141 min/day).

**C03 — Year 1: which association?** Dynamic draw: one asso per category + "No association". Categories and pools (ESSEC + CentraleSupélec):
- Sport: ERT (rugby), EFC (football), EDC (dance club), Boxing club, BDS → H+, energy+, risk of injury (event), chance of winning a tournament (F+).
- Arts: Comedia (theatre), NSB (photography), LDM (restaurant reviews) → H+, S+, soft skills.
- Corpo / tech: Utopia (ESSEC AI association), Automatants (CentraleSupélec AI), Kryptosphère (blockchain/DeFi), ECC (ESSEC Economics Club), ESSEC Transaction, CentraleSupélec Finance, Junior-Entreprise, Genius (entrepreneurship) → skills, network, unlock offers (flags TECH / FIN / STARTUP).
- Impact / other: Ultra (supporters), Peak (extreme sports), Delta (humanitarian trip to South Africa: C+, flight), Impact (sustainability: flag GREEN), OSER (tutoring for equal opportunity: C+), HumaCS (international solidarity).
- No association: grades+, S−.

**C04 — Year 2: a sète every week. What kind of student are you?** (Sète = party, ESSEC slang.) Party animal (S+8, H+4, grades−, addiction+), balanced, library monk (grades+, S−). Sets the base rate of later party minis.

**C05 — Year 2 summer: mandatory 3-month internship.** Options gated by flags/skills: AI startup (TECH or skillAi ≥ 35), investment bank (FIN), impact NGO or social enterprise (GREEN or contribution ≥ 55), corporate data analyst (always), CentraleSupélec research lab (grades ≥ 60). Sets STARTUP / BANK / IMPACT / LAB.

**C06 — Year 3: your exchange destination (mandatory).** Four cards, one per continent, each a university drawn at random (seeded) from that continent; nothing is locked and grades play no part. Europe: UCL London, Bocconi Milan, Erasmus Rotterdam. North America: NYU New York, Emory Atlanta, UT Austin, George Washington DC, ÉTS Montréal. South America: Universidad de Chile. Asia & Australia: NTU Singapore, CUHK Hong Kong, University of Western Australia Perth, Daejeon University (Korea). Each card shows the trip footprint next to the university ("UCL · London · Train ≈ 0.02 t"). Getting there: return flight t by distance (Singapore 3.2, Hong Kong 2.9, New York 1.8, Austin 2.1, Atlanta 2.0, DC 1.8, Perth 4.6, Montréal 1.5, Daejeon 2.6, Santiago 3.4); London/Milan/Rotterdam by train 0.02–0.05. Flag INTL.

**C07 — Year 3: how much do you travel during the exchange?** Stay local and study (grades+, S+2), trains and buses around the region (S+5, H+5, +0.1 t), a flight every other weekend (S+6, H+6, F+3, +2.5 t). The text adapts to the destination.

**C08 — Summer after the exchange: the mandatory research paper. How do you use GenAI?** All-in (≈ 50 prompts + 5 short videos a day: +0.08 t/yr while kept, skillAi+, flag SHALLOW), targeted (~10 text prompts a day: +0.002 t/yr, skillAi+, flag COMPLEMENT), none (grades+, skillSoft+). Facts: IEA (2 Wh per text answer, ~115 Wh per 6-s video), Google 2025 (median prompt 0.24 Wh).

**C09 — Year 4: the 6-month internship** (converts into an offer, flag OFFER_<path>). Big Tech AI product team (TECH or STARTUP), investment bank or asset manager (FIN or BANK), strategy consulting (always), research lab ML/health/economics (LAB or skillAi ≥ 55), international organisation on AI or climate policy (INTL and (GREEN or TECH)), NGO (GREEN or IMPACT), corporate strategy in energy or industry (always).

**C10 — Age 22: after AIDAMS.** Take the offer now (M+3), Master's e.g. ESSEC–CentraleSupélec DSBA (1 yr, M−2, skillAi+, unlocks research econ/health), PhD (3 yrs, M−4, C+2, skillAi++, required for Research ML), gap year off-grid volunteering (1 yr, H+4, S+2, M−3, unlocks NGO).

**C11 — Your first real job (THE big choice).** Dynamic: 3 eligible offers + up to 2 locked prestigious ones + 1 "surprise offer" written by AI (from a template; its name is picked from a fixed menu of unused parody names, `constants.surpriseEmployers`). Employers per path (parody names from §0):
- Big Tech: *Palantire* (defense & surveillance analytics: M++, tech+, ai+, C−−, ethics−−; "Your code will help 'keep people safe'. Which people is a later question."), *Metta* (social media: you build the addiction), *Goggle* (cloud & AI), *OpenEye* (frontier lab: M+, tech++, ai++, F+).
- Research: *DeepBlind* (AI research, needs a PhD), *Institut Pasteurisé* (health economics).
- Finance: *Goldmann Sax* (investment bank: M+++, H−−, energy−), *J.B. Morgane* (quant fund), *GreenRock* (ESG funds).
- Consulting: *McKinsley* (strategy: M++, network+, energy−−, business flights), *Bain-Marie* (audit & consulting).
- Public policy: *OECB* (AI governance), *United Notions* (climate): M+, C+, flights.
- Corporate strategy: *LVMeh* (luxury), *Amazoom* (e-commerce).
- Energy: *TotalEnnemies* (oil & gas: M++, ethics−, business flights), *EDEffort* (renewables & grid).
- NGO: *Doctors Without Orders* (M−, C++, ethics+).
Choosing sets the career path (paths.json) and the employer.

**C12 — Age ~25: your work rhythm for the next 10 years** (the "extreme time" choice). Grind 55 h+ (promotion chance 0.7, H−6, S−6 per decade, life −1.5 yr per decade; WHO/ILO 2021: +35% stroke risk), balanced 40 h (0.5), 4-day week (0.3, H+5, S+5, M−5), change job (1 yr, re-opens C11 offers). Each promotion: M+6, F+3.

**C13 — Age 30: family.** Partner and kids with screens limited, partner and kids with tablets early (teen-anxiety event at ~45: H−4), partner no kids, solo career-first (loneliness if grind or isolation). If flag `met_3am`, the partner is the person from the 3AM sète conversation (AI references it).

**C14 — Age ~33: your flagship project.** Text adapts to path (a model at Big Tech, a trading system in Finance, a client programme in Consulting, a treaty in Diplomacy). Scale it at all costs (M+8, F+6, C−4, tech+8, ai+10, aiLever +0.005, work 20,000 t), frugal AI (AFNOR Spec 2314: question the need, smaller models, measure and disclose: M+4, F+3, C+3, aiLever −0.01, work ~6,000 t), AI for climate or health (requires GREEN or path Research/NGO/Diplomacy/Strategic: C+8, F+4, aiLever −0.05), no AI, simple statistics (C+1). Facts: IEA (GPT-4 training ~42 GWh; widespread AI applications could cut ~5% of energy emissions by 2035).

**C15 — Age ~36: your online presence for the rest of your life** (replaces C02). Personal brand ~3 h/day (F+10, M+3, H−5, influence 1,900 t/yr), as needed ~2 h, delete social apps (H+6, S+4, F−8, C−1).

**C16 — Age 40: mid-career.** Stay 20 years (M+10, H−2, promotion 0.7, skips C18), stay 10 years, pivot to impact (M−5, C+10, H+4, path change), found a startup (sector choice → AI names it, pitches it, invents the investor and the rival; success odds by sector risk and network/skills, ~10–35%), step back to a low-tech life (path Isolation, −4 t/yr). If the AI shock cost you your job, both "stay" options are greyed out and you cannot pick an employer in the same field.

**C17 — Age 45: what do you do with your money?** Two long-haul holidays a year for 20 years (+3.6 t/yr), low-carbon comfort (insulate, train, EV, less meat: −2.5 t/yr for life, flag low_carbon_comfort), give 10% to climate and health charities (M−5, C+8), invest in AI and tech (M+6, tech+2, ai+2).

**C18 — Age 55: late-career influence** (skipped if "stay 20"). Join the board and make frugality and impact disclosure mandatory (C+5, aiLever −0.01), maximise last bonuses, mentor and teach at ESSEC–CentraleSupélec (S+5, C+4; PM shows up as a colleague), retire early.

**C19 — Age 65: retirement.** Always connected (smart home, AI companion, 5 h screens), connected but local (video calls with family, volunteering), travel the world (3 long-haul trips/yr for 10 yrs: +5.4 t/yr).

**C20 — Age 75: your legacy.** Leave everything to family, fund climate/health research or a frugal-AI foundation (C+10, aiLever −0.01), fund an AI lab (F+4, tech+6, ai+6). Side myth-buster toggle: "delete your cloud archives" (negligible — the point).

## 8. Minis (1 tap, don't count toward the 20)

Few on purpose (~3 per life): playtests showed that many small choices drown the main story.

- **PM's 8AM class** (×2 in Year 1, the second one 60% of the time): "It's 8AM. PM is already writing on the board. Do you go?" Go (grades+, energy−) / skip (energy+, H+, grades−, flag skipped_pm; PM remembers, and the AI calls back later). Second one: "PM looks straight at you." Going to both earns the "Front Row" badge.
- **Sète tonight?** (×1 in Year 2, after C04, not for library monks): Go / stay in. If go → follow-up "It's 3AM. You're deep in a great conversation with someone you just met." Go home (energy+) / stay (S+, flag met_3am, addiction+ small). Vices: the party-animal years (C04) and sètes raise addiction.
- **"The new phone just dropped"** (×1, age ~20, 40% of lives): buy it (H+2, +0.085 t, +200 kg materials), refurbished, or keep yours (badge "Kept it"; 80% of a device's footprint is manufacturing, ADEME–Arcep).
- **ESSEC asso fair** (only if you waited for the ESSEC assos at C03) and **Grounded** (old age, only if you never flew: badge).

## 9. Events

| Event | When / p | Effect | Depends on |
|---|---|---|---|
| Pandemic | once, 24–30, p 0.35, 2 years | screens +1.5 h/day for 2 yrs, business flights −80% | Social < 50: H−6 else H−3; health research C+6 F+4; Big Tech M+4; Finance/Consulting M−3 |
| Rapid AI advance | once, 38–45, p 0.8 | world ai +10 | Low-complementarity path (Finance, Consulting) without COMPLEMENT, or SHALLOW: job lost, M−8, H−5, flag `ai_job_loss_<path>` (no re-employment in that path), both "stay" options greyed. COMPLEMENT or skillAi ≥ 60: M+5. No AI skill: M−3. (IMF 2024: ~60% of jobs in advanced economies exposed, about half complementary.) |
| War, energy and minerals crisis | once, 48–55, p 0.3 | H−3, device prices up | Diplomacy C+6 F+4; Big Tech M−3; Finance M±5 |
| Burnout | energy < 20 | forced 1-year break, H−8, M−4 | |
| Scandal | ethics < −30 | F−10, choice: own it / deny | employer |
| PM again | flag skipped_pm or attended all | PM crosses your path at 40+ (conference, jury, your kid's teacher) | AI-written callback |
| Old asso friend | asso flag | offers you a CTO role in their startup | |
| Teen anxiety | tablets early (C13), p 0.5 | H−4 at ~45 | |
| Heatwave summers | age > 65 and projected T ≥ 2.5 °C | H−4 | the planet hits back |
| Addiction | addiction > 57 (party-animal years and sètes feed it) | H−6, lifespan − | |
| Injury / tournament | sport asso | | |
| Whistleblower | 44–58, 2+ years in a path | blow the whistle / fix it inside / stay quiet | Whistleblower ending |
| Loneliness, divorce, startup exit | solo + overwork; partner + overwork or unhappiness; startup success | | |

Every event has a cooldown and fires at most once. Global events affect everyone differently by path.

## 10. AI (Claude) — "AI narrates, the engine decides"

Claude never sets numbers. It writes text and picks from menus the engine offers; the engine validates everything with Zod.

| # | Role | Model | When |
|---|---|---|---|
| 1 | Narrator: rewrites each scene in 2–4 sentences with your name, city, past choices, recurring characters | Haiku 5.5 (fast) | every major, mini text optional, events |
| 2 | Character memory: PM, your roommate, the 3AM stranger, your first manager, your old asso friend come back and remember | Haiku 5.5 | via narrator context (flags) |
| 3 | Custom events (3–4 per life): invents an event tied to your path and picks a template per option (e.g. `big_risk_tech` = 40%: tech+20 M+15, else M−15) | Haiku 5.5 | AI event slots |
| 4 | Surprise job offer at C11 and your startup (name, product, pitch, investor, rival) | Opus 5.5 | 1–2 per life |
| 5 | Epitaph: obituary + "the LinkedOut post of your life" + 2 concrete, sourced tips tied to your weakest poles | Opus 5.5 | end |

Guardrails: base text always exists (shown instantly, replaced when the narration lands); prefetch the next scene while the player reads; 3 s timeout; API key server-side only; per-IP rate limit; per-game call cap (≈ 45); player text is data, never instructions; prompts forbid inventing facts about real people or real companies, and forbid the professor's full name (only "PM").

### Budget (≈ €95 total)
Per life ≈ 30 Haiku 5.5 calls (≈ $0.012) + 2 Opus 5.5 calls (≈ $0.07) ≈ **$0.08 per life → ~1,200 lives**. Narration-only on Haiku drops to ≈ $0.012 per life (~8,000 lives). Models are env-configurable. Hard cap: a dedicated API key with a $100 spend limit in the Anthropic Console.

## 11. Promo live mode (stretch)
After each choice: "62% of players chose this". A projected `/#/live` screen shows the whole promo's planet in 2100 and the distribution of titles. Storage adapter (Supabase if configured, otherwise disabled).

## 12. Sources (cite in facts.json)
IEA *Energy and AI* (2025); ADEME–Arcep digital footprint (2022, 2025 update); ADEME refurbishing study (2022); Impact CO2 (ADEME); Base Carbone / DGAC flight factors; IPCC AR6 (TCRE, SSP table, Table 9.9); WMO 2025; Warren et al., Science 2018; Lenton et al., Nature Sustainability 2023; US Surgeon General advisory 2023; Allcott et al., AER 2020; WHO/ILO 2021; Holt-Lunstad 2010; IMF 2024 (AI and jobs); INSEE 2025; SDES / Selectra (French footprint 9.2 t, 2 t target); AFNOR Spec 2314 (frugal AI); DataReportal 2025; CGE 2026 (graduate salaries).
