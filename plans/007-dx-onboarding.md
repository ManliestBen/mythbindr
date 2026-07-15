# Plan 007: DX & onboarding — CLAUDE.md, env drift, shared watch mode, Spotify doc, query-key consolidation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8d4cea7..HEAD -- apps/back/src/lib/env.ts apps/back/.env.example packages/shared/package.json package.json README.md apps/front/src/lib/queryKeys.ts apps/front/src/data`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Plan 002 legitimately edits
> `env.ts`'s sessionSecret line and `.env.example`'s session section — that
> is expected, not drift.)

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (001 recommended so `npm test` exists; 002 touches `env.ts` — land 002 first to avoid a merge conflict)
- **Category**: dx / docs / tech-debt
- **Planned at**: commit `8d4cea7`, 2026-07-14

## Why this matters

Five small frictions that each waste a debugging cycle or an onboarding session:

1. **No `CLAUDE.md`** — this repo is developed with coding agents (`.claude/` tree exists), and every session re-derives the same non-obvious facts: the mandatory `build:shared` step, the env setup, and the share-serializer security invariant.
2. **Env drift** — `env.ts` reads `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` but `.env.example` never mentions them; error messages point to `server/.env`, a path from the pre-monorepo layout that doesn't exist.
3. **No watch mode for `packages/shared`** — edits silently ship stale `dist/` to both apps until a manual rebuild.
4. **`docs/spotify-setup.md` is referenced twice but doesn't exist.**
5. **Two React Query key conventions** — a `qk` factory *and* hand-rolled inline arrays that must stay byte-identical with it for invalidation to work.

## Current state

- No `CLAUDE.md`/`AGENTS.md` anywhere. Repo facts an agent needs (all verified):
  - Monorepo: npm workspaces — `apps/back` (Express+Mongoose+Socket.IO+Yjs, CommonJS tsc build), `apps/front` (Vite+React 18), `packages/shared` (zod schemas + Socket.IO contract; apps consume its **built `dist/`**).
  - Commands (root): `npm run typecheck` (builds shared first), `npm run build`, `npm run dev:back` (needs `apps/back/.env`, copy from `.env.example`), `npm run dev:front`, `npm test` (if plan 001 landed), `npm run seed:srd` / `seed:demo` / `db:check` (in `apps/back`).
  - Invariants: after editing `packages/shared`, rebuild it or nothing sees the change; `apps/back/src/share/serialize.ts` is a **whitelist** — never add fields to `sharedElement`'s output or weaken `sanitizeBody` without a security review; all AI routes must keep `requireAdmin` (project rule: AI provider calls are admin-gated server-side).
- `apps/back/src/lib/env.ts`:
  - line 4–5: `// Load server/.env regardless of the process cwd.` + `dotenv.config({ path: path.resolve(__dirname, '../../.env') });` (the path itself is correct — it resolves to `apps/back/.env`; only the comment is wrong)
  - lines 10–13 (inside `required()`): the error text says ``Set it in server/.env (see server/.env.example).``
  - lines 40–44: reads `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` (default `claude-opus-4-8`), plus a comment referencing `PLAN.md §5.14`.
- `apps/back/.env.example` — sections: Server, Database, Sessions, Passkeys/WebAuthn, Spotify (with `# ... see docs/spotify-setup.md`), Production notes. **No Anthropic section.** `apps/back/src/lib/env.ts:31` comment also says "see docs/spotify-setup.md". `docs/` contains only `deploy/cloudflare-caddy.md` and `deploy/raspberry-pi-setup.md`.
- `packages/shared/package.json` — scripts: only `build` and `typecheck` (both `tsc`). Root `package.json` scripts listed in plan 001's Current state.
- `README.md:44-45` — the manual-rebuild warning: "After editing `packages/shared`, re-run `npm run build:shared` …".
- `apps/front/src/lib/queryKeys.ts` — the full factory (17 lines): keys for campaigns, campaign, elements(cid, filters), element, backlinks, dashboard, search, members, invites, activity, invitePreview. **Missing**: session, session history, share, srd, spotify.
- Hand-rolled key sites (all verified):
  - `apps/front/src/data/session.ts:42` — `const key = (cid) => ['campaign', cid, 'session']` used by 4 hooks; line 58 — `['campaign', cid, 'sessions', 'history']`
  - `apps/front/src/data/share.ts:16,26,46` — share keys
  - `apps/front/src/data/srd.ts:36,46,57` — SRD keys
  - `apps/front/src/data/spotify.ts:11` — spotify key
  - `apps/front/src/data/elements.ts:46-48` — `invalidateElements` uses a raw prefix `['campaign', cid, 'elements']` while reads use `qk.elements(cid, opts)`; this works today only because `qk.elements` = `['campaign', cid, 'elements', filters]` and invalidation prefix-matches.
- Spotify integration facts for the doc (verified in `apps/back/.env.example` and `apps/back/src/integrations/spotify/spotify.ts` — re-read them when writing): Client ID + Client Secret from the Spotify Developer Dashboard (https://developer.spotify.com/dashboard), secret stays server-side; `SPOTIFY_REDIRECT_URI` must byte-for-byte match a Redirect URI registered in the dashboard; local dev must use `127.0.0.1` not `localhost` (Spotify rejects localhost); OAuth uses an HMAC-signed state; tokens are encrypted at rest; production redirect URI is the public API origin + `/api/integrations/spotify/callback`.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0              |
| Build     | `npm run build`     | exit 0              |
| Tests     | `npm test` (if 001 landed) | all pass     |
| Shared watch (new) | `npm run dev:shared` | tsc watch banner, recompiles on edit |

## Scope

**In scope** (the only files you should modify/create):
- `CLAUDE.md` (create, repo root)
- `apps/back/src/lib/env.ts` (comments/messages only — no logic)
- `apps/back/.env.example` (add Anthropic section)
- `docs/spotify-setup.md` (create)
- `packages/shared/package.json` (add `dev` script), root `package.json` (add `dev:shared`), `README.md` (watch-mode note)
- `apps/front/src/lib/queryKeys.ts`, `apps/front/src/data/session.ts`, `apps/front/src/data/share.ts`, `apps/front/src/data/srd.ts`, `apps/front/src/data/spotify.ts`, `apps/front/src/data/elements.ts`
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- Any change to actual query/invalidation *semantics* — Step 5 is a pure refactor; every key's array shape must stay byte-identical.
- `env.ts` logic (the sessionSecret change is plan 002's).
- Adding `concurrently`/new dependencies — the watch mode is a plain script, run in its own terminal.
- ESLint/Prettier setup — rejected for now (see `plans/README.md`).

## Git workflow

- Two commits work well: `Add CLAUDE.md, fix env drift, shared watch mode, Spotify setup doc` and `Consolidate React Query keys into qk factory`.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Write `CLAUDE.md`

Create `CLAUDE.md` at the repo root covering, in this order (keep it under ~80 lines; terse, imperative):

1. One-paragraph what-this-is (TTRPG campaign companion; monorepo layout table: `apps/back`, `apps/front`, `packages/shared`).
2. **Commands** — the root scripts table from "Current state", including `npm test` if it exists by then, and per-workspace seeds (`npm run seed:srd -w @mythbindr/back` etc.).
3. **The shared-package footgun** — apps consume `packages/shared`'s built `dist/`; after editing it run `npm run build:shared` (or keep `npm run dev:shared` running).
4. **Env setup** — copy `apps/back/.env.example` → `apps/back/.env`; list which vars are required vs optional (MONGODB_URI required; SESSION_SECRET required in production; Spotify + Anthropic optional, routes 503 until configured).
5. **Guardrails** (verbatim-ish):
   - `apps/back/src/share/serialize.ts` is a whitelist for the public player share view — never add output fields or weaken `sanitizeBody` without treating it as a security change.
   - All AI routes keep `requireAdmin` — AI provider calls are admin-gated server-side, always.
   - Every async Express handler is wrapped in `asyncHandler` — match that.
   - `plans/` holds advisor-written implementation plans; read `plans/README.md` before starting improvement work.

**Verify**: file exists; `wc -l CLAUDE.md` < 120; every command named in it copy-pastes successfully from the repo root (spot-check `npm run typecheck`).

### Step 2: Fix env drift

In `apps/back/src/lib/env.ts` (text only):
- line 4 comment → `// Load apps/back/.env regardless of the process cwd.`
- `required()` error text → `Set it in apps/back/.env (see apps/back/.env.example).`

In `apps/back/.env.example`, append after the Spotify section:

```
# ── AI assist (Anthropic) — optional; admin-only feature ─────────────────
# The AI routes return 503 until this is set.
ANTHROPIC_API_KEY=
# Optional override; defaults to the model pinned in src/lib/env.ts.
# ANTHROPIC_MODEL=
```

(Do not put a real key or a specific model id in the example — the default lives in code.)

**Verify**: `grep -rn "server/.env" apps/back/src` → no matches; `grep -n "ANTHROPIC_API_KEY" apps/back/.env.example` → 1 match.

### Step 3: Shared watch mode

- `packages/shared/package.json` scripts: add `"dev": "tsc -p tsconfig.json --watch --preserveWatchOutput"`.
- Root `package.json` scripts: add `"dev:shared": "npm run dev -w @mythbindr/shared"`.
- `README.md`: in the Develop section, change the rebuild warning to mention the watch alternative, e.g.: "After editing `packages/shared`, re-run `npm run build:shared` — or keep `npm run dev:shared` running in a third terminal so the apps always see fresh `dist/`."

**Verify**: `npm run dev:shared` → tsc watch starts, initial compile succeeds; touch a file in `packages/shared/src`, watch recompiles; Ctrl-C.

### Step 4: Write `docs/spotify-setup.md`

Create it from the facts in "Current state" (re-read `apps/back/.env.example`'s Spotify section and `apps/back/src/integrations/spotify/spotify.ts` first). Structure: prerequisites (Spotify account, dev dashboard app), dashboard steps (create app → copy Client ID/Secret → register the redirect URI), env vars table, the **127.0.0.1-not-localhost** gotcha called out in a blockquote, production redirect URI note, and troubleshooting (redirect-URI mismatch = byte-for-byte comparison). Do not include secrets or invent dashboard UI details beyond generic steps — where the dashboard flow is uncertain, link to Spotify's own docs (https://developer.spotify.com/documentation/web-api/concepts/apps).

**Verify**: file exists; both existing references now resolve: `grep -rn "spotify-setup" apps/back` → the two references point at a file that exists.

### Step 5: Consolidate query keys

In `apps/front/src/lib/queryKeys.ts`, extend `qk` (array shapes must be **byte-identical** to the current inline literals — copy them from the cited lines, don't redesign):

```ts
session: (cid: string) => ['campaign', cid, 'session'] as const,
sessionHistory: (cid: string) => ['campaign', cid, 'sessions', 'history'] as const,
elementsPrefix: (cid: string) => ['campaign', cid, 'elements'] as const,
// plus share/srd/spotify keys — copy the exact arrays from data/share.ts:16,26,46,
// data/srd.ts:36,46,57, data/spotify.ts:11 (read them; name by what they key)
```

Then replace every inline literal at the cited sites with the factory call:
- `data/session.ts`: delete the local `const key = ...` (line 42), use `qk.session(cid)` / `qk.sessionHistory(cid)`.
- `data/elements.ts:47`: `qc.invalidateQueries({ queryKey: qk.elementsPrefix(cid) })` — a deliberate *prefix* key; add a one-line comment `// prefix-invalidates every qk.elements(cid, filters) variant`.
- `data/share.ts`, `data/srd.ts`, `data/spotify.ts`: swap each literal for its new factory entry.

Rule: if any existing literal disagrees with another for the same concept, STOP (see conditions) — do not "unify" shapes, that changes cache identity.

**Verify**: `npm run typecheck` → exit 0. `grep -rn "\['campaign'" apps/front/src/data` → no matches outside `queryKeys.ts` (allow `queryKeys.ts` itself). Manual: start a session, add a combatant, end it → session panel updates without refresh; element create → list refreshes (prefix invalidation still works).

## Test plan

No behavior changes intended anywhere; the regression gate is `npm test` (if present) plus Step 5's manual checks. No new tests required — key-factory consistency is enforced by the grep in Done criteria.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `CLAUDE.md` and `docs/spotify-setup.md` exist
- [ ] `grep -rn "server/.env" apps/back/src` → no matches
- [ ] `grep -n "ANTHROPIC_API_KEY" apps/back/.env.example` → exactly 1 match
- [ ] `npm run dev:shared` starts a tsc watch (manual check, note in report)
- [ ] `grep -rn "\['campaign'" apps/front/src/data --include='*.ts'` → 0 matches
- [ ] `npm run typecheck` and `npm run build` exit 0; `npm test` exits 0 (if present)
- [ ] `git status --porcelain` shows changes only to in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Two inline key literals for the *same* data disagree in shape (e.g. one query reads `['campaign', cid, 'session']` and another invalidates `['session', cid]`) — that's a live cache bug, not a refactor; report it as a finding.
- `env.ts` at HEAD no longer matches the cited lines beyond plan 002's expected sessionSecret change.
- Writing the Spotify doc requires guessing at behavior you can't confirm from `spotify.ts`/`routes.ts` — write what's verifiable and flag the gap instead of inventing.

## Maintenance notes

- `CLAUDE.md` should be updated whenever root scripts change (CI from plan 001, tests from 005) — reviewers should flag drift.
- New data hooks must take keys from `qk` — a reviewer should reject inline key arrays in `apps/front/src/data/`.
- Deferred: authoring shared REST DTO schemas (Member/Invite/Dashboard/Activity) in `packages/shared` — that's MIGRATION.md's item 5, a larger contract change tracked there, not here.
