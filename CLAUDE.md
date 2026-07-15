# MythBindr

A TTRPG campaign companion: real-time co-editing, run-session tools (initiative,
dice, rules drawer, improv generators), quests/factions/party tracking, a
relationship map, player share view, campaign export/import, SRD reference,
Spotify mood slots, and AI assist.

npm workspaces monorepo:

| Path              | What                                                          |
|-------------------|----------------------------------------------------------------|
| `apps/back`       | Express + Mongoose + Socket.IO + Yjs API server                |
| `apps/front`      | Vite + React 18 SPA                                             |
| `packages/shared` | zod schemas + Socket.IO contract; consumed by both apps as a built package |

## Commands

Run from the repo root unless noted:

```bash
npm install
npm run build:shared   # build packages/shared (apps import its dist/)
npm run typecheck      # builds shared, then typechecks back + front
npm run build          # builds shared, back (tsc), and front (vite)
npm test               # builds shared, then vitest run — requires Node >= 22.12 (Vitest 4)
npm run dev:back        # API on :4000 — needs apps/back/.env (copy apps/back/.env.example)
npm run dev:front       # SPA on :5173
npm run dev:shared      # tsc --watch for packages/shared (keep running in a third terminal)
```

Per-workspace (from `apps/back`, or with `-w @mythbindr/back`):

```bash
npm run seed:srd -w @mythbindr/back    # seed SRD reference data
npm run seed:demo -w @mythbindr/back   # seed demo campaign data
npm run db:check -w @mythbindr/back    # sanity-check the Mongo connection
```

## The shared-package footgun

`apps/back` and `apps/front` both consume `packages/shared`'s **built** `dist/`,
not its source. If you edit anything under `packages/shared/src`, you must
either re-run `npm run build:shared` or keep `npm run dev:shared` running —
otherwise both apps keep compiling/running against stale types and code with
no error.

## Env setup

Copy `apps/back/.env.example` to `apps/back/.env` and fill in values.

- `MONGODB_URI` — always required.
- `SESSION_SECRET` — required in production (server refuses to boot without
  it); has an insecure dev default otherwise.
- Spotify (`SPOTIFY_CLIENT_ID`/`SECRET`/`REDIRECT_URI`) and Anthropic
  (`ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`) are optional — the relevant routes
  return 503 until configured. See `docs/spotify-setup.md` for the Spotify
  OAuth app setup.

## Guardrails

- `apps/back/src/share/serialize.ts` (`sharedElement`) is a **whitelist** for
  the public player share view. Never add fields to its output or weaken
  `sanitizeBody` without treating it as a security change — there is a
  key-set test locking this down.
- Every AI route keeps `requireAdmin` — AI provider calls are admin-gated
  server-side, always, no exceptions.
- Every async Express handler is wrapped in `asyncHandler` — match that
  pattern for new routes.
- `plans/` (if present) holds advisor-written implementation plans for other
  agents to execute — read `plans/README.md` before starting improvement work.
