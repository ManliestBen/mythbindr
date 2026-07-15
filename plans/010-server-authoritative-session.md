# Plan 010: Server-authoritative session state — shared types, combat reducer, operation events

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 991460c..HEAD -- packages/shared/src apps/back/src/realtime apps/back/src/sessions apps/front/src/data/session.ts apps/front/src/lib/combat.ts`
> Plan 009 legitimately touches `events.ts`, `io.ts`, `sessions/routes.ts` and
> creates `sessionRooms.ts` — that is EXPECTED, not drift (this plan depends on
> 009 being DONE). Anything else changed → compare excerpts before proceeding.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED-HIGH (moves state ownership; the reducer is new domain logic)
- **Depends on**: plans/009-live-session-broadcast.md (DONE required)
- **Category**: direction (build)
- **Planned at**: commit `991460c`, 2026-07-14

## Why this matters

Plan 009 made session state *visible* live but kept last-writer-wins conflicts: each client computes its own next-state and PATCHes wholesale, so two editors racing inside the 800 ms debounce silently clobber each other. Per the decision in `docs/design/live-session.md` (option **B**, operator-approved 2026-07-14 — READ THE DOC FIRST), this plan moves state ownership to the server: a per-session in-memory room (directly modeled on `yElement.ts`'s `Room`) holds the live session, clients emit named *operations* (`session:applyDamage`, `session:nextTurn`, …), the server applies them through one reducer in receipt order, broadcasts the result, and persists on a debounce. The reducer lives in `packages/shared` so Plan 011's client-side optimistic apply computes byte-identical next-states — and en route this fulfills `MIGRATION.md` dedup item 1 (session types derived from the shared zod schemas instead of hand-mirrored on the front).

This plan is **server + shared only**. The client keeps its Slice-1 edit model (local patch + debounced PATCH); Plan 011 migrates it. Both paths coexist safely because the PATCH route is rewired to apply *through* the room (Step 6), preserving the single-applier invariant.

## Current state

- `packages/shared/src/schemas/session.ts` — `condition`, `combatant`, `logEntry` zod sub-schemas exist but are **not exported** (only `sessionStartSchema`/`sessionUpdateSchema` are). The front hand-mirrors them as interfaces in `apps/front/src/data/session.ts:4-40` (`Condition`, `Combatant`, `LogEntry`, `GameSessionT`) — the exact duplication MIGRATION.md item 1 flags. Note two shape nuances to preserve when deriving types: the zod `combatant.notes` and `sourceElementId` are `.optional()`/nullable while the front interfaces require them; the front's runtime always supplies them (see `newCombatant`, `parseCombatants`), so derive with `z.infer` and keep the front interfaces as aliases of the inferred types WITH a compatibility check (Step 1).
- `apps/front/src/lib/combat.ts` — pure `applyHeal(c, amount)` (heal-from-0 + death-save reset), with tests in `combat.test.ts`. This logic must become shared so server and client heal identically (Step 2 moves it; the front file becomes a re-export).
- `apps/back/src/realtime/yElement.ts` — the pattern to copy for the room holder: `Room` interface (`doc/sockets/saveTimer/dirty/ready/seedFrom/seedClaimed`), synchronous `rooms.set` before any `await`, shared `ready` hydration promise, `scheduleSave` debounce (2000 ms), `saveRoom(cleanup)` destroying the room when `sockets.size === 0`. Read the whole file (~135 lines) before writing `sessionState.ts`.
- `apps/back/src/realtime/sessionRooms.ts` (from plan 009) — owns `sessionRoom(id)`, `broadcastSessionState(doc)`, per-session `seq`. This plan refactors it: the seq moves into the room state; the broadcast gains a from-room variant.
- `apps/back/src/realtime/io.ts` (post-009) — has `session:join`/`session:leave` + `canAccessSession(userId, sessionId, minRole)`. Per the design doc's **Security considerations**: mutating ops re-check `roleAtLeast(role,'editor')` **per op at call time** (a deliberate deviation from the yjs join-time-only pattern; a demoted co-DM must lose write access immediately).
- `apps/back/src/sessions/routes.ts` (post-009) — PATCH/end handlers call `broadcastSessionState` after writing. `sessionUpdateSchema` validates PATCH bodies. `RunSession.tsx` (unchanged by this plan) still PATCHes on debounce.
- `apps/back/src/models/Session.ts` — `combatantSchema` etc.; `publicSession(s)` returns the wire shape. `GameSession` model.
- The design doc's event contract section lists the op payloads verbatim (`NextTurnOp`, `ApplyDamageOp` with tempHp-absorbs-first, `UpdateCombatantOp` with `patch: Partial<Combatant>` never `cid`, `AddCombatantOp`, `RemoveCombatantOp`, `AppendLogOp`, `EndSessionOp`) plus `session:opError`.
- Turn-pointer semantics to preserve in the reducer: `RunSession.tsx`'s `changeCombatant`/`removeCombatant` "follow the combatant whose turn it is" logic (see `apps/front/src/pages/RunSession.tsx` ~lines 150–185 — copy the semantics, and the initiative sort order from its `sortByInit`), and condition-duration countdown in `nextTurn` (read RunSession's `nextTurn`/`prevTurn` before writing the reducer — the reducer must reproduce what the UI does today, including the round increment and `log` cap of 500).
- Test exemplars: pure-logic `apps/front/src/lib/combat.test.ts`; mocked-model `apps/back/src/realtime/yElement.test.ts`. Node ≥22.12 for `npm test` (`nvm use 24`).

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Build shared | `npm run build:shared` | exit 0 — after EVERY packages/shared edit |
| Typecheck | `npm run typecheck` | exit 0              |
| Tests     | `npm test` (Node 24) | all pass           |
| Build     | `npm run build`     | exit 0              |

## Scope

**In scope** (the only files you should modify/create):
- `packages/shared/src/schemas/session.ts` (export sub-schemas + inferred types)
- `packages/shared/src/combat/reducer.ts`, `packages/shared/src/combat/index.ts` (create), `packages/shared/src/index.ts` (re-export)
- `packages/shared/src/combat/reducer.test.ts` (create)
- `packages/shared/src/realtime/events.ts` (op events + `session:opError`)
- `apps/front/src/data/session.ts` (derive types from shared — type-level only, no hook changes)
- `apps/front/src/lib/combat.ts` (re-export from shared; keep `combat.test.ts` passing against the shared impl)
- `apps/back/src/realtime/sessionState.ts` (create — the room holder), `sessionState.test.ts` (create)
- `apps/back/src/realtime/sessionRooms.ts` (seq moves into rooms; broadcast-from-room)
- `apps/back/src/realtime/io.ts` (op handlers with per-op editor checks)
- `apps/back/src/sessions/routes.ts` (PATCH/end apply through a live room when one exists)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `apps/front/src/pages/RunSession.tsx` and the client edit model — Plan 011.
- The `/share` namespace and player view — Plan 012.
- `yElement.ts` — pattern source only.
- Removing the PATCH route — it stays as the cold-load/fallback path (design decision).

## Git workflow

- Two commits work well: `Shared session types + combat reducer` then `Server-authoritative session rooms and operation events`.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Export shared session schemas + derived types

In `packages/shared/src/schemas/session.ts`: export the sub-schemas (`export const conditionSchema = condition; ...` or rename in place) and add:

```ts
export type Condition = z.infer<typeof conditionSchema>;
export type Combatant = z.infer<typeof combatantSchema>;
export type LogEntry = z.infer<typeof logEntrySchema>;
export interface GameSessionState {
  round: number;
  turnIndex: number;
  combatants: Combatant[];
  log: LogEntry[];
  status: 'active' | 'ended';
}
```

In `apps/front/src/data/session.ts`, replace the hand-written `Condition`/`Combatant`/`LogEntry` interfaces with re-exports of the shared types. Compatibility caveat: the inferred `Combatant` has `notes?: string` and `sourceElementId?: string | null` where the old front interface required them — if typecheck breaks at usage sites, PREFER tightening the zod schema (`.default('')` is a behavior change — do NOT; instead make the two fields required in the schema only if the API already always sends them, which `publicSession` does) — the minimal safe move is `.nullable()`→ keep, and change `notes: z.string().max(500).optional()` to required `z.string().max(500)` ONLY if `sessionUpdateSchema` round-trips existing payloads (`parseCombatants` and `newCombatant` always send `notes`/`sourceElementId`; the schemas.test fixtures from plan 005 will catch a break). If this becomes a rabbit hole, STOP condition 3 applies.

**Verify**: `npm run build:shared` → exit 0; `npm run typecheck` → exit 0; `npm test` → all pass (plan 005's schema fixtures are the canary).

### Step 2: The shared combat reducer

Create `packages/shared/src/combat/reducer.ts`. Define the op union + one pure reducer:

```ts
import type { Combatant, GameSessionState, LogEntry } from '../schemas/session';

export type SessionOp =
  | { kind: 'nextTurn' }
  | { kind: 'prevTurn' }
  | { kind: 'applyDamage'; cid: string; amount: number } // + damage / − healing; tempHp absorbs first
  | { kind: 'updateCombatant'; cid: string; patch: Partial<Omit<Combatant, 'cid'>> }
  | { kind: 'addCombatant'; combatant: Combatant }
  | { kind: 'removeCombatant'; cid: string }
  | { kind: 'appendLog'; entry: LogEntry }
  | { kind: 'end' };

export function applyOp(s: GameSessionState, op: SessionOp): GameSessionState;
export function applyHeal(c: Combatant, amount: number): Combatant; // moved verbatim from apps/front/src/lib/combat.ts
```

Semantics (each must match today's UI behavior — read `RunSession.tsx`'s `nextTurn`/`prevTurn`/`changeCombatant`/`removeCombatant`/`duplicateCombatant` and `CombatantCard.tsx`'s damage handler before coding):
- `nextTurn`: advance `turnIndex` through the initiative-sorted order (reproduce `sortByInit` — port it into this module); wrap increments `round`; decrement finite condition `rounds` on the combatant whose turn begins (match the UI's exact rule) and drop expired ones.
- `applyDamage` positive: `tempHp` absorbs first, remainder off `currentHp`, floor −99 (matches `CombatantCard.tsx:40-46`). Negative: route through `applyHeal` (heal-from-0, death-save reset).
- `removeCombatant`: the follow-the-acting-combatant turnIndex logic from `RunSession.tsx` (plan 003's version).
- `updateCombatant`: shallow-merge `patch`, then the follow-the-turn re-derivation (mirrors `changeCombatant`).
- `appendLog`: append, cap at 500 (`.slice(-500)` — matches `addLog`).
- `end`: `status: 'ended'`; every op against an `'ended'` session throws an `OpError` (a small exported error class) — the server maps it to `session:opError`.
- The reducer never mutates its input (return new objects; this is what makes client optimistic-apply safe in Plan 011).

Update `apps/front/src/lib/combat.ts` to `export { applyHeal } from '@mythbindr/shared';` (or the sub-path) so `combat.test.ts` and `CombatantCard.tsx` keep working unchanged. Wire `packages/shared/src/index.ts` to re-export the combat module.

Tests in `reducer.test.ts` — table-driven, at minimum: tempHp absorption ordering; damage floor; heal-from-negative parity with the old `applyHeal` cases; nextTurn wrap increments round; condition expiry on turn start; removeCombatant pointer-follow (removing above/below/at the acting slot); appendLog cap; every op on an ended session throws; input not mutated (`Object.isFrozen`-based or deep-equal-before/after).

**Verify**: `npm run build:shared` → exit 0; `npx vitest run packages/shared/src/combat/reducer.test.ts` (Node 24) → all pass; `npm test` → all pass (front `combat.test.ts` now exercises the shared impl).

### Step 3: Contract — op events + opError

In `packages/shared/src/realtime/events.ts`, add the design doc's op payload interfaces (each `extends SessionRef`, carrying the matching `SessionOp` fields) and:

- `ClientToServerEvents` += `'session:nextTurn' | 'session:prevTurn' | 'session:applyDamage' | 'session:updateCombatant' | 'session:addCombatant' | 'session:removeCombatant' | 'session:appendLog' | 'session:end'`
- `ServerToClientEvents` += `'session:opError': (p: SessionRef & { message: string }) => void;`
- Retype `SessionStatePayload.session.combatants/log` from `unknown[]` to the now-shared `Combatant[]`/`LogEntry[]` (closing plan 009's typing note).

**Verify**: `npm run build:shared`; `npm run typecheck` → exit 0.

### Step 4: The server room holder — `apps/back/src/realtime/sessionState.ts`

Model on `yElement.ts` (same race discipline — synchronous registration, shared `ready`):

```ts
interface SessionRoom {
  state: GameSessionState & { id: string };
  seq: number;
  dirty: boolean;
  saveTimer: ReturnType<typeof setTimeout> | null;
  ready: Promise<void>;
  sockets: Set<string>;
}
```

API: `joinSessionRoom(sessionId, socketId)` → hydrates from `GameSession.findById` (register room in the map BEFORE the await, exactly like `joinRoom` in `yElement.ts` — same check-then-act race applies); `applySessionOp(sessionId, op)` → `applyOp` on held state, `seq++`, mark dirty, `scheduleSave` (2000 ms debounce like yElement), return the new state (the caller broadcasts); `leaveSessionRoom(sessionId, socketId)` → on last leave, flush-save and delete the room; `saveRoom` persists via `GameSession.findByIdAndUpdate(sessionId, { $set: { round, turnIndex, combatants, log, status, ...(status==='ended' ? { endedAt: new Date() } : {}) } })`. An op throwing `OpError` must NOT mutate state/seq. `getLiveRoom(sessionId)` exposes the room to the REST layer (Step 6).

Refactor `sessionRooms.ts`: `broadcastSessionState` gains a sibling `broadcastRoomState(room)` emitting from held state with the room's own `seq`; the standalone `seqs` map is deleted (rooms own seq; the REST-only path in `POST /session` start, where no room exists yet, may emit seq 0 — document that).

**Verify**: `npm run typecheck` → exit 0.

### Step 5: Op handlers in `io.ts`

`session:join` now goes through `joinSessionRoom` (snapshot from held state once hydrated) instead of a direct `findById`. For each mutating op event: per-op `canAccessSession(userId, sessionId, 'editor')` check (design decision — per op, NOT cached from join), then `applySessionOp`, then broadcast to the room; on `OpError` → `socket.emit('session:opError', { sessionId, message: 'Could not apply that change' })` (generic message — design doc's security note; log the real reason server-side). `disconnect` handler also calls `leaveSessionRoom` for any joined session rooms (track a per-socket set like the existing `yrooms`).

**Verify**: `npm run typecheck` → exit 0.

### Step 6: Rewire PATCH/end through live rooms

In `sessions/routes.ts`, PATCH `/session/:sid`: if `getLiveRoom(sid)` exists, apply the body as a wholesale-replace through the room (a special `{ kind: 'replace', patch }` op you add to the reducer, or apply the `$set` to held state + `seq++` + broadcast + mark dirty) instead of writing Mongo directly — the room's debounced save persists it. If no room is live, the existing direct-write path stands (cold/fallback clients). Same for `/end`. This preserves the single-applier invariant while Slice-1 clients (current `RunSession`) still PATCH.

**Verify**: `npm run typecheck` → exit 0; `npm test` → all pass.

## Test plan

- `packages/shared/src/combat/reducer.test.ts` — Step 2's table (the core of this plan's risk).
- `apps/back/src/realtime/sessionState.test.ts` — mock `../models/Session` (yElement.test pattern): concurrent `joinSessionRoom` race (one hydration, both get same state); `applySessionOp` increments seq and marks dirty; debounced save fires once for two rapid ops (fake timers); op on ended session raises without changing seq; last-leave flushes and deletes.
- Existing suites (now ~110+ tests) must stay green — plan 005's schema fixtures guard Step 1's type derivation.

## Done criteria

- [ ] `npm run typecheck`, `npm run build`, `npm test` (Node 24) all exit 0
- [ ] `grep -n "z.infer" packages/shared/src/schemas/session.ts` matches; `grep -n "interface Combatant" apps/front/src/data/session.ts` → no matches (derived, not hand-written)
- [ ] `grep -c "session:applyDamage\|session:nextTurn\|session:opError" packages/shared/src/realtime/events.ts` ≥ 3
- [ ] `grep -n "canAccessSession(userId, sessionId, 'editor')" apps/back/src/realtime/io.ts` shows one check per mutating op handler (≥ 7 sites)
- [ ] `grep -n "getLiveRoom" apps/back/src/sessions/routes.ts` matches in PATCH and end handlers
- [ ] Reducer test file exists with ≥ 10 cases; sessionState test file exists with the race case
- [ ] `git status --porcelain` clean; only in-scope files (plus 009's, which are prerequisites)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 009 is not DONE in `plans/README.md`.
- Reproducing `nextTurn`'s condition-countdown or the turn-pointer semantics from `RunSession.tsx` is ambiguous after reading the code (two plausible readings) — report both readings; do not pick silently.
- Step 1's type derivation forces changes to zod schema *validation behavior* (not just types) to satisfy the front — that alters the API contract; report.
- The PATCH-through-room rewiring (Step 6) can't preserve the existing REST response shape.
- Any mutating op handler would need to skip the per-op editor check to work — that's a design violation, not an implementation detail.

## Maintenance notes

- Plan 011 consumes the reducer for optimistic client apply — reducer purity (no mutation) is load-bearing; reviewer must check it.
- The in-memory room means session state on a crashed/restarted server rehydrates from the last debounced save (≤ 2 s loss) — same tradeoff `yElement.ts` already accepts; documented here so nobody "fixes" it with sync writes.
- Plan 012 broadcasts a *filtered* variant of room state to the `/share` namespace — keep `broadcastRoomState` factored so a second serializer can hook in.
