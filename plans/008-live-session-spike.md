# Plan 008: Design spike — live shared session table over the existing Socket.IO contract

> **Executor instructions**: This is a **design/spike plan**, not a build plan.
> The deliverable is a design document plus answered questions — code changes are
> limited to an optional throwaway prototype on a branch that is NOT merged.
> Follow the steps; if anything in "STOP conditions" occurs, stop and report.
> When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8d4cea7..HEAD -- packages/shared/src/realtime apps/back/src/realtime apps/back/src/sessions apps/front/src/data/session.ts apps/back/src/models/ShareLink.ts`
> Drift here is *input*, not a blocker: read what changed (plans 003/004 touch
> neighboring code) and account for it in the design doc.

## Status

- **Priority**: P3
- **Effort**: M (the spike; the build that follows is L and gets its own plans)
- **Risk**: LOW (no production code changes)
- **Depends on**: none to start; the design must account for plans 003/004 if they've landed
- **Category**: direction
- **Planned at**: commit `8d4cea7`, 2026-07-14

## Why this matters

The run-session tracker (initiative, HP, dice log) is the app's at-the-table core, but it syncs by REST + React Query invalidation only: the GM's edits reach other members' screens only when they happen to refetch. Meanwhile the app **already runs** a typed Socket.IO layer with session-cookie auth, per-room membership authorization, and presence — used for element co-editing. Extending that contract to broadcast combat state is disproportionately cheap and turns a GM-only screen into a table-wide one. A second, composable direction: `ShareLink.scope` is an enum with the single value `'campaign'` — a `'session'` scope could give players a live read-only initiative view on their phones with no account. This spike decides the architecture *before* anyone writes build plans, because the state-authority question (who wins when GM edits race) has real design tension with the existing debounced-REST persistence.

## Current state (all verified at `8d4cea7`)

- **The socket contract has zero session events.** `packages/shared/src/realtime/events.ts` defines only `element:join/leave`, `yjs:*`, and `presence`. Adding events means editing `ClientToServerEvents`/`ServerToClientEvents` there — both sides then get compile-time checking (that's the contract's stated purpose, lines 1–5).
- **Socket auth + authz pattern to copy** — `apps/back/src/realtime/io.ts`: session middleware reused on the engine (lines 36–39), `io.use` rejects userless connections (41–48), and every room join re-checks membership+role via `canAccessElement(userId, elementId, minRole)` (53, 72, 124–134). A session room would follow the same shape (`session:<sid>` room, campaign-membership check).
- **REST persistence today** — `apps/back/src/sessions/routes.ts`: PATCH `/session/:sid` replaces `round/turnIndex/combatants/log` wholesale (lines 62–87), fed by an 800 ms client debounce in `apps/front/src/pages/RunSession.tsx` (lines 81–98). State lives in one client's React state between saves; the server is a dumb store. This is the crux: a naive broadcast of PATCH results gives last-writer-wins with 800 ms windows.
- **Client data layer** — `apps/front/src/data/session.ts`: `useSession`/`useUpdateSession` etc.; `useUpdateSession.onSuccess` writes the server response back into the query cache (lines 87–95) — any socket design must reconcile with this cache.
- **Share links** — `apps/back/src/models/ShareLink.ts`: `scope: { type: String, enum: ['campaign'], default: 'campaign' }`, 24-byte token, expiry+revocation, `shareLinkIsLive()`. The public share routes (`apps/back/src/share/routes.ts`) are unauthenticated and serialize through the whitelist in `apps/back/src/share/serialize.ts` — the **serialization discipline must extend to any live player view** (players must not see GM notes/`tactics`, monster max HP policy is a design decision, etc.). Socket connections for share-link viewers would be *unauthenticated* — today `io.use` rejects those (io.ts:41-48), so a player-view socket needs its own namespace or token-based handshake; that's a core design question.
- **Presence** already dedups by user and broadcasts participant lists (`emitPresence`, io.ts:109–122) — reusable for "who's at the table".
- Prior art in-repo: the Yjs path shows the team's preferred shape for realtime (server-relayed events, per-room auth, debounced persistence in `yElement.ts`).

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 (only if you prototype) |
| Dev run   | `npm run dev:back` + `npm run dev:front` | two-window experiments |

## Scope

**In scope**:
- `docs/design/live-session.md` (create — the deliverable)
- Optional throwaway prototype on branch `spike/live-session` (never merged; note findings in the doc)
- `plans/README.md` (status row)

**Out of scope** (do NOT do these in this plan):
- Any merged production code change, schema migration, or shared-contract change.
- Building the feature — the spike's output is the input to future build plans.
- The AI-recap direction finding — separate concern, not this doc.

## Git workflow

- The design doc commits to `main` style (`Add live-session design doc`); prototype work stays on `spike/live-session` and is explicitly disposable.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Decide state authority (the load-bearing decision)

Study `RunSession.tsx` (debounce), `sessions/routes.ts` (wholesale PATCH), and `yElement.ts` (server-held doc + debounced persist). Write up a recommendation choosing between:

- **A. GM-authoritative broadcast** — only editors mutate; server relays their patches to the session room and persists (small delta from today; conflicts remain last-writer-wins between two GMs).
- **B. Server-authoritative state** — the server holds the live session (like a Yjs room holds a doc), applies operations (`nextTurn`, `applyDamage`…), broadcasts the result, persists on debounce. More work; eliminates the 800 ms clobber window; natural fit with the existing `yElement.ts` pattern.
- **C. CRDT (Yjs) for session state** — maximal reuse of existing machinery, but overkill for a turn-ordered state machine with clear operations; assess honestly and likely reject.

The doc must state: chosen option, why, and the migration path from the current PATCH flow (the PATCH route stays for offline/single-GM mode or gets subsumed).

### Step 2: Draft the event contract

Concrete TypeScript additions to `packages/shared/src/realtime/events.ts` (in the doc, not committed): join/leave, state snapshot on join, the mutation events per Step 1's choice, and roll-log entries as first-class events (dice results are the most latency-sensitive, most shareable payload). Name events in the existing style (`session:join`, `session:state`, …). Specify payloads with types, and which existing pieces are reused (`Participant`, presence).

### Step 3: Design the player view via share-link scope

Answer in the doc:
- `ShareLink.scope` gains `'session'` (enum addition — confirm it's non-breaking for existing docs with default `'campaign'`).
- How an unauthenticated share-link holder gets socket access: recommend a design (e.g. a read-only namespace `/share` where the handshake carries the share token and `io.use` validates it via `shareLinkIsLive`) and enumerate what the current `io.use` (userId-required) must NOT lose.
- **The player-facing state whitelist** — mirror `serialize.ts` discipline: define exactly which combatant fields players see (name, initiative order, conditions, isPlayer; policy question flagged for the operator: monster HP visibility — exact / descriptive tiers / hidden).
- Rate/abuse posture for the public namespace (plan 002's limiter covers HTTP, not sockets).

### Step 4: Reconcile with the React Query cache

Specify how socket events and `useSession`'s cache coexist (e.g. socket handler writes into `qc.setQueryData(qk.session(cid), …)`, mutations stop invalidating, REST remains the cold-load path). Account for plan 003's dirty-flag save indicator if it landed.

### Step 5: (Optional) 2-hour prototype

On `spike/live-session`, wire the smallest slice: `session:join` + broadcasting log entries between two authenticated windows. Record in the doc what surprised you (auth plumbing, event typing friction, cache reconciliation). Delete or abandon the branch after.

### Step 6: Write `docs/design/live-session.md`

Required sections (the done criteria checks these headings exist): `## Problem`, `## State authority decision`, `## Event contract`, `## Player view & share scope`, `## Cache reconciliation`, `## Security considerations`, `## Build plan sketch` (the 2–4 follow-up plans this decomposes into, each one line), `## Open questions for the operator` (monster-HP visibility policy belongs here; keep the list ≤ 5).

## Test plan

Not applicable — no production code. The doc's "Build plan sketch" must name where tests will live when the build happens (shared contract compile-checks + a socket integration harness).

## Done criteria

- [ ] `docs/design/live-session.md` exists and contains all eight required section headings (`grep -c "^## " docs/design/live-session.md` ≥ 8)
- [ ] The event contract section contains actual TypeScript event signatures, not prose
- [ ] The player-view section defines an explicit field whitelist
- [ ] No production source file is modified (`git status --porcelain` shows only the doc + plans/README.md on the main branch)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- You find session-related socket events already exist at HEAD (someone built part of this) — reconcile with what exists instead of designing in a vacuum.
- The share-link socket design cannot avoid weakening the authenticated `io.use` path — surface the tension rather than proposing a compromise of the existing auth.
- The spike prototype reveals the Socket.IO session-cookie reuse breaks for same-origin production but not dev (or vice versa) — that's an environment finding worth its own report.

## Maintenance notes

- The design doc is the source of truth for the follow-up build plans; future `/improve` runs should read it (recon ingests `docs/design/`).
- If the operator rejects the direction, record that in the doc's header and in `plans/README.md` so it isn't re-proposed.
