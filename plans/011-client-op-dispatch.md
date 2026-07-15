# Plan 011: Client migration — dispatch session operations over the socket with optimistic reconciliation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 991460c..HEAD -- apps/front/src/pages/RunSession.tsx apps/front/src/realtime apps/front/src/data/session.ts apps/front/src/components/session`
> Plans 009/010 legitimately touch RunSession.tsx (the useSessionChannel guard),
> the realtime dir, and data/session.ts (shared types) — expected. Anything
> else → compare excerpts before proceeding. This plan REQUIRES 009 and 010
> to be DONE; read both plans' final state notes and `docs/design/live-session.md`
> (§ Cache reconciliation) before starting.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (rewrites the core editing loop of the app's flagship screen)
- **Depends on**: plans/009 (DONE), plans/010 (DONE)
- **Category**: direction (build)
- **Planned at**: commit `991460c`, 2026-07-14

## Why this matters

After Plan 010, the server owns live session state and applies operations in receipt order — but the client still computes next-state locally and PATCHes wholesale on an 800 ms debounce, so its writes go through the room's wholesale-replace fallback and can still stomp a concurrent editor's finer-grained op. This plan completes the migration decided in `docs/design/live-session.md`: `RunSession.tsx` stops PATCHing and instead emits the named ops, applies them **optimistically** with the *same shared reducer the server runs* (guaranteed-identical next-states — that's why Plan 010 put `applyOp` in `packages/shared`), and reconciles against the server's `seq`-numbered `session:state` broadcasts. `SaveStatus` is redefined from "PATCH settled" to "operations acknowledged" — same three-state UI, truthful new signal.

Fallback stays: when the socket is disconnected, the debounced-PATCH path re-engages so a network blip never bricks the tracker (design decision — the PATCH route survives as cold-load/fallback).

## Current state (post-009/010 — verify by reading, not from memory)

- `apps/front/src/pages/RunSession.tsx` — the edit loop this plan replaces:
  - `patch(updater)` applies an updater to local `session` state and calls `persist(next)` (800 ms debounce → `update.mutate` PATCH; `dirty` flag; guarded `onSettled`; unmount cleanup; `finishSession` flushes the timer then `end.mutate`).
  - Every mutation site funnels through `patch`: `nextTurn`/`prevTurn`, `changeCombatant`, `removeCombatant`, `addCombatant`, `duplicateCombatant`, `addLog` — enumerate them all with `grep -n "patch((s)" apps/front/src/pages/RunSession.tsx` before editing; each maps 1:1 onto a `SessionOp` from `packages/shared/src/combat/reducer.ts` (Plan 010).
  - The 009 `useSessionChannel(cid, session?.id, guardedCallback)` subscription writes broadcasts into the query cache and conditionally adopts them.
- `packages/shared` (post-010): `applyOp(state, op)` pure reducer + `SessionOp` union + `OpError`; op events + `session:opError` in the contract; `Combatant`/`LogEntry` types shared.
- `apps/front/src/realtime/socket.ts` — `getSocket()`; `socket.connected` is the liveness signal; `'connect'`/`'disconnect'` events for transitions.
- `apps/front/src/data/session.ts` — `useSession`, `useUpdateSession` (PATCH), `useEndSession`. After this plan, `useUpdateSession` remains ONLY as the fallback path; `useEndSession` is replaced by the `session:end` op when connected.
- Server behavior to rely on (from 010): every accepted op broadcasts a full `SessionStatePayload` with a monotonically increasing `seq`; rejected ops emit `session:opError` with a generic message; per-op editor authz.
- Design doc § Cache reconciliation prescribes: optimistic-apply-then-reconcile via `seq`, `session:opError` → rollback + toast, REST stays the cold-load path. The repo has a toast system: `apps/front/src/components/ToastProvider.tsx` (find its hook API with `grep -n "export" apps/front/src/components/ToastProvider.tsx`).

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0              |
| Tests     | `npm test` (Node 24) | all pass           |
| Build     | `npm run build`     | exit 0              |
| Manual    | two tabs + dev servers (needs `apps/back/.env`) | Step 5 |

## Scope

**In scope** (the only files you should modify/create):
- `apps/front/src/pages/RunSession.tsx`
- `apps/front/src/realtime/useSessionChannel.ts` (extend: op dispatch + ack tracking + opError)
- `apps/front/src/realtime/useSessionChannel.test.ts` (create — the ack/reconcile state machine, extracted pure; see Test plan)
- `apps/front/src/data/session.ts` (mark `useUpdateSession` as fallback-only in a comment; no hook deletion)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- Anything server-side — 010 finished it. If the server contract seems insufficient, that's a STOP, not a server edit.
- `CombatantCard.tsx` / `DiceRoller.tsx` / `AddCombatant.tsx` — they call the callbacks RunSession passes; keep those prop signatures identical.
- The `/share` namespace — Plan 012.
- Deleting the PATCH route or `useUpdateSession` — fallback path, stays.

## Git workflow

- One commit, e.g. `Run Session dispatches ops over the socket with optimistic reconciliation`.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Extract the reconciliation state machine (pure, testable)

Create the core as a pure module inside `useSessionChannel.ts` (exported for tests):

```ts
export interface ChannelState {
  /** Server-confirmed state at `seq`. */
  confirmed: { state: GameSessionT; seq: number } | null;
  /** Ops applied locally, not yet covered by a server broadcast. */
  pending: { op: SessionOp; sentAt: number }[];
}
```

Transitions (pure functions, unit-tested in Step 4):
- `localOp(cs, op)`: push to `pending`; the *displayed* state = `pending.reduce(applyOp, confirmed.state)`.
- `serverState(cs, payload)`: if `payload.seq <= cs.confirmed?.seq` ignore (stale). Otherwise set `confirmed = payload`; **clear `pending`** — the server's broadcast after our op already includes its effect, and any interleaved foreign ops too. (Simplification over per-op acking, and correct because ops are applied server-side in receipt order and every accepted op triggers a broadcast; the design doc's "reconcile by replacing local state with the server's seq-numbered payload" sanctions exactly this.)
- `opError(cs)`: clear `pending`, keep `confirmed` — display snaps back to the last server truth (the rollback), caller shows a toast.

Display state derives from `ChannelState`; `RunSession`'s `session` local state becomes this derived value (Step 3).

### Step 2: Op dispatch with connected/fallback switch

In `useSessionChannel.ts`, expose:

```ts
dispatch(op: SessionOp): void
// connected → optimistic localOp + socket.emit('session:<kind>', payload)
// disconnected → apply op locally via applyOp AND invoke the legacy persist fallback
status: 'live' | 'fallback'   // drives SaveStatus and a small "offline" hint
pendingCount: number          // SaveStatus: pending>0 → 'Saving…'
```

Map `SessionOp.kind` → event name mechanically (`applyDamage` → `'session:applyDamage'`, etc.). On `'disconnect'`, flip to fallback and hand the current derived state to the legacy debounce (the hook takes `onFallbackPersist(state)` from RunSession); on `'connect'`, re-join, wait for the fresh snapshot (it reconciles everything), flip to live.

### Step 3: Rewire `RunSession.tsx`

- Replace each `patch((s) => …computed next state…)` call site with `dispatch({ kind: … })`: e.g. `nextTurn` → `dispatch({kind:'nextTurn'})`; `CombatantCard`'s `onChange` → diff into `updateCombatant`/`applyDamage` ops (the card already calls distinct handlers for damage/heal vs field edits — pass distinct callbacks so no diffing heuristic is needed; check `CombatantCard`'s props and keep its signature, translating in RunSession).
- `addLog` → `appendLog` op. `finishSession` → `dispatch({kind:'end'})` when live (flush pending first: the end op serializes after them on the server anyway — receipt order), legacy flush+`end.mutate` when fallback.
- `SaveStatus`: `pending = pendingCount > 0 || (fallback && (dirty || update.isPending))`; `error` = last `session:opError` within this mount (cleared on next successful broadcast) or `update.isError` in fallback. Show the toast on opError: "That change didn't save — the table's current state has been restored."
- Delete the Slice-1 dirty/timer guard from the 009 subscription (superseded by seq reconciliation) — but KEEP the debounce machinery itself for fallback mode.
- The `useEffect` that seeds local state from `loaded?.id` now seeds `confirmed` instead.

**Verify** (steps 1–3 together): `npm run typecheck` → exit 0; `npm run build` → exit 0.

### Step 4: Tests

`useSessionChannel.test.ts` over the pure transitions (no React, no socket — that's why Step 1 extracts them): optimistic op shows immediately in derived state; server broadcast with higher seq clears pending and adopts server truth; stale (lower-seq) broadcast ignored; interleaved foreign op arrives in the broadcast (derived state = server state, no re-applied pending); opError rolls back to confirmed; disconnected dispatch applies locally and flags fallback. Use `applyOp` from shared with real small fixtures — this doubles as an integration check that client and server reduce identically.

**Verify**: `npm test` (Node 24) → all pass.

### Step 5: Manual two-tab check (needs `apps/back/.env`; if unavailable, SKIP and say so — reviewer/operator runs it)

Two tabs, same session: damage in A appears in B < 1 s; simultaneous damage on the SAME combatant in both tabs sums (server ordering) instead of one edit vanishing — this is THE acceptance demo vs. Slice 1; kill the API mid-edit → tab flips to fallback, edits keep working, restart API → reconnect + snapshot reconciles.

## Test plan

Covered in Step 4 (pure state machine) plus the shared reducer suite from 010 (untouched, must stay green). Component-level rendering is manual (Step 5).

## Done criteria

- [ ] `npm run typecheck`, `npm run build`, `npm test` (Node 24) all exit 0
- [ ] `grep -c "update.mutate(" apps/front/src/pages/RunSession.tsx` → 0 on the live path (allowed only inside the fallback branch; confirm by reading — cite the line in your report)
- [ ] `grep -n "dispatch({ kind:" apps/front/src/pages/RunSession.tsx` ≥ 6 sites
- [ ] `grep -n "seq" apps/front/src/realtime/useSessionChannel.ts` shows the stale-broadcast guard
- [ ] New test file covers ≥ 6 transition cases and imports `applyOp` from `@mythbindr/shared`
- [ ] `git status --porcelain` clean; only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- 009 or 010 is not DONE in the index.
- A `patch()` call site has no clean 1:1 `SessionOp` mapping (would need a new op kind) — the contract change belongs to a 010 amendment, not here.
- The fallback switch would require server changes.
- `CombatantCard`'s props can't be preserved without a diffing heuristic — report the prop surface instead of guessing field-level intent.

## Maintenance notes

- The clear-pending-on-broadcast simplification assumes every accepted op yields a broadcast (010 guarantees it). If batching/coalescing is ever added server-side, this reconciliation needs per-op acks — leave a comment saying so at the `serverState` transition.
- Plan 012's player view is read-only and unaffected by this plan.
- Reviewer should scrutinize: fallback-mode re-entry (connect → snapshot → pending cleared) and that no code path leaves `SaveStatus` reading "Saved" with `pending > 0`.
