# RESPAWN — guide for Claude Code and teammates

Pixel-art life-choice game for the AIDAMS Cohesion Day (ESSEC × CentraleSupélec). You live one life from AIDAMS Year 1 to death in ~20 choices; at the end you see your life radar, **the Earth in 2100 if everyone lived like you**, your carbon receipt, an AI epitaph, and you can **Respawn** a key choice.

**Read `docs/GAME_DESIGN.md` first. It is the source of truth.**

## Non-negotiables
- Player-facing text in **English**.
- **No real company or brand in scene text**: use the parody names from the official list in `docs/GAME_DESIGN.md` §0 (Goggle, Metta, McKinsley, LinkedOut…) and never invent other company names (the player's own startup, investors and rivals excepted). Real schools, assos and partner universities keep their names; real names only in fact sources.
- The professor is **only ever "PM"**. Never write his full name, anywhere.
- Locked choices are **shown greyed with a reason**, never hidden.
- **AI narrates, the engine decides.** Claude never sets numbers. Every scene has a base text so the game never blocks.
- **Data-driven**: story and numbers live in `src/content/data/*.json`, validated by `src/content/schema.ts`. No story in engine code.
- **No API key in the browser or in git.** Keys live in `.env.local` (dev) and Vercel env vars (prod).

## Architecture
| Folder | What | Rules |
|---|---|---|
| `src/content/` | `schema.ts` (Zod contract), `data/*.json` (all content), `index.ts` (parsed bundle) | Edit JSON, run `npm run check-data` |
| `src/engine/` | Pure TS game engine (`types.ts` = public contract) | No React, no fetch, no Math.random (seeded RNG in state) |
| `src/ai/` | Browser AI client (`types.ts` contract) → `/api/ai/*` | Always resolves (null on failure) |
| `server/ai/` | Prompts, Anthropic SDK calls, guards (rate limit, caps, Zod validation) | Runs server-side only |
| `api/` | Vercel functions (thin wrappers over `server/`) | |
| `src/store/` | Zustand store gluing engine + AI for the UI | |
| `src/ui/` | Pixel UI (screens, components, procedural pixel art, sfx) | Mobile-first, keyboard 1–5 shortcuts |
| `tools/` | `check-data.ts` (content linter), `simulate.ts` (10k-life balancing) | |

## Commands
```bash
npm install
npm run dev          # game + AI API on http://localhost:5173 (needs ANTHROPIC_API_KEY in .env.local)
npm test             # engine + content tests
npm run check-data   # validate all content JSON
npm run simulate     # balance report over thousands of simulated lives
npm run build        # typecheck + production build
```

## Conventions
- TypeScript strict. Engine functions are pure `(content, state, ...) => newState`.
- Content ids: snake_case, majors `c01_…` to `c20_…`, minis `m_…`, events `e_…`.
- Facts must carry a source (`facts.json`). Design values must be labelled as such.
- Commit small, descriptive messages. Open a PR for anything touching `schema.ts` or `engine/types.ts`.
