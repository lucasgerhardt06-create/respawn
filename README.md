<p align="center"><img src="public/brand/wordmark-light.png" alt="respawn" width="420"></p>

<p align="center"><b>One life. Twenty choices. Eight billion consequences.</b></p>

<p align="center"><a href="https://lucasgerhardt06-create.github.io/respawn/"><b>▶ Play it on your phone</b></a></p>

A pixel-art life sim built for the **AIDAMS Cohesion Day** (ESSEC × CentraleSupélec, group 7). You start your first week at AIDAMS, make the choices that shape a life (associations, PM's 8AM class, sètes, the exchange, your first job, your rhythm, family, money, legacy) and, when you die, you see **what the Earth would look like in 2100 if 8 billion people lived like you**, your **carbon receipt**, your **AI-written epitaph**, and you can **RESPAWN** one key choice to compare the other life.

Every scene is narrated by Claude for *your* life. Every number comes from sourced data (IEA, ADEME, IPCC, WHO, INSEE…). The AI writes the words; the engine decides every consequence.

## What's inside
| | |
|---|---|
| **20 life choices** + a few quick moments and events (~28 decisions, ~12 minutes per life) | `src/content/data/*.json` (no code needed to edit) |
| **RPG character sheet** | Wealth, Happiness, Social, Fame, Impact + Intelligence, Math & AI, Economics, Charisma, Health, Network, Grades, Integrity |
| **Real physical model** | tonnes of CO2e per choice → temperature, sea level, biodiversity and heat exposure in 2100 (`docs/GAME_DESIGN.md` §4–5) |
| **Claude narrator** | Haiku 5.5 narrates each scene, Opus 5.5 writes your startup and your epitaph (`docs/AI.md`) |
| **Deterministic engine** | seeded, pure TypeScript, 1 ms per life, Respawn re-simulates the alternate life (`src/engine`) |
| **Pixel art** | brand palette from the logo, Codex-generated scenes and sprites (`docs/BRAND.md`) |

## Run it locally (2 minutes)
```bash
git clone https://github.com/lucasgerhardt06-create/respawn.git
cd respawn
npm install
cp .env.example .env.local
npm run dev
```
Open http://localhost:5173. The AI layer needs **one** of these in `.env.local`:
- `VITE_AI_BASE_URL=https://ovvlzllldfeebhqbhhow.supabase.co/functions/v1/respawn-ai` → use the team's deployed Claude backend (simplest), or
- `ANTHROPIC_API_KEY=sk-ant-...` → **your own Claude key**, served by the local dev API, or
- `GEMINI_API_KEY=...` → a Gemini key, for testing.

No key at all? The game still works with its base texts.

## Work on it with your Claude
The repo is set up for [Claude Code](https://claude.com/claude-code): it reads [`CLAUDE.md`](CLAUDE.md) automatically (rules, architecture, commands). Good first prompts:
- *"Add 3 events for the career phase about remote work, following docs/CONTENT_GUIDE.md, then run npm run check-data."*
- *"Make the PM 8AM class scenes funnier and add a callback when PM shows up at 50."*
- *"Run npm run simulate and rebalance whatever strategy dominates."*
- *"Improve the Earth 2100 reveal animation in src/ui/screens/End.tsx."*

Rules that matter (also in `CLAUDE.md`): English only, **no real company names: parodies from the official list** (Goggle, Metta, McKinsley…, `docs/GAME_DESIGN.md` §0), the professor is only ever **"PM"**, locked choices are shown greyed, AI never sets numbers, **never commit a key**.

## Contribute without coding
1. Edit a file in [`src/content/data/`](src/content/data) (see [`docs/CONTENT_GUIDE.md`](docs/CONTENT_GUIDE.md)).
2. `npm run check-data` (validates everything, finds unreachable choices).
3. Open a pull request. CI runs tests, content checks and the build; merging to `main` deploys the site.

## Deploy your own copy
- **Site**: GitHub Pages via `.github/workflows/deploy.yml` (set `VITE_AI_BASE_URL` to your backend).
- **AI backend**: a Supabase Edge Function. Set `ANTHROPIC_API_KEY` as a project secret, then
  ```bash
  node scripts/build-edge.mjs
  supabase functions deploy respawn-ai --no-verify-jwt --project-ref <your-ref>
  npx tsx tools/ai-remote-smoke.ts https://<your-ref>.supabase.co/functions/v1/respawn-ai
  ```
  Add your site's origin with the `RESPAWN_ALLOWED_ORIGINS` secret. Vercel also works (`vercel.json`, `api/`).

## Security
API keys live only in server-side secrets (Supabase) or your local `.env.local` (gitignored). The browser bundle contains no key. The backend rejects scripted calls without an allowed origin, rate-limits per IP, caps calls per life and validates every input and output. Emergency stop: secret `RESPAWN_AI_DISABLED=1` (the game falls back to base texts). Put a spend limit on the API key you use.

## Docs
[Game design](docs/GAME_DESIGN.md) · [Engine semantics](docs/ENGINE_SEMANTICS.md) · [Content guide](docs/CONTENT_GUIDE.md) · [AI layer](docs/AI.md) · [Brand](docs/BRAND.md) · [Pitch](docs/PITCH.md)

## Stack
Vite · React · TypeScript · Tailwind · Motion · Zustand · Zod · Claude API · Supabase Edge Functions · GitHub Pages
