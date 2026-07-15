# Plan 009: Live session broadcast (Slice 1) — session room, `session:state`, live-updating tabs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 991460c..HEAD -- packages/shared/src/realtime apps/back/src/realtime apps/back/src/sessions/routes.ts apps/front/src/realtime apps/front/src/pages/RunSession.tsx apps/front/src/data/session.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the realtime layer; conflict semantics deliberately unchanged)
- **Depends on**: none (design: `docs/design/live-session.md` — READ IT FIRST; this plan implements its "Slice 1" / build-plan-A)
- **Category**: direction (build)
- **Planned at**: commit `991460c`, 2026-07-14

## Why this matters

The run-session tracker syncs by REST + React Query invalidation only — a co-DM or second device sees the GM's edits only on refetch. The app already runs a typed, authenticated Socket.IO layer for element co-editing. This plan adds the smallest useful realtime slice, exactly as decided in `docs/design/live-session.md` ("Slice 1", operator-approved 2026-07-14): a `session:<sid>` room, a `session:state` broadcast fired from the existing REST handlers after each successful write, and a client hook that feeds those broadcasts into the React Query cache and (guardedly) into `RunSession`'s local state. **Conflict semantics are deliberately unchanged** (last-writer-wins with the 800 ms debounce window) — that is Plan 010/011's job; do not "improve" it here.

## Current state

- `packages/shared/src/realtime/events.ts` — the whole Socket.IO contract (51 lines). Defines `Participant`, `PresencePayload`, `ElementRef`, `ElementBinary`, `YjsInitPayload`, and:

  ```ts
  export interface ClientToServerEvents {
    'element:join': (p: ElementRef) => void;
    'element:leave': (p: ElementRef) => void;
    'yjs:join': (p: ElementRef) => void;
    'yjs:update': (p: ElementBinary) => void;
    'yjs:awareness': (p: ElementBinary) => void;
    'yjs:leave': (p: ElementRef) => void;
  }
  export interface ServerToClientEvents {
    presence: (p: PresencePayload) => void;
    'yjs:init': (p: YjsInitPayload) => void;
    'yjs:update': (p: ElementBinary) => void;
    'yjs:awareness': (p: ElementBinary) => void;
  }
  ```

  There are NO session events. After editing this package run `npm run build:shared` (apps consume `dist/`).

- `apps/back/src/realtime/io.ts` — socket server. `initRealtime` reuses the express-session middleware on the engine (lines 36–39); `io.use` rejects userless connections (41–48); `element:join` authorizes via `canAccessElement(userId, elementId, 'viewer')` then joins room `el:${elementId}` and calls `emitPresence(room)` (lines 53–61); `canAccessElement` (124–134) resolves element → campaignId → `Membership.findOne` → `roleAtLeast`. `getIO()` (26–28) exposes the server instance to other modules — this is how the REST handlers will broadcast.

- `apps/back/src/sessions/routes.ts` — the four handlers that mutate session state, all `requireCampaignAccess('editor')`:
  - `POST /session` (start; ~line 26) → `GameSession.create(...)`, responds `{ session: publicSession(s) }`
  - `PATCH /session/:sid` (~line 62) → `findOneAndUpdate({_id, campaignId}, {$set}, {new: true})`, responds `publicSession(s)`
  - `POST /session/:sid/end` (~line 90) → sets `status:'ended'`, responds `publicSession(s)`
  - `publicSession(s)` lives in `apps/back/src/models/Session.ts:63-90` and returns `{ id, status, sourceEncounterId, round, turnIndex, combatants, log, startedAt, endedAt }` — this exact shape is the client's `GameSessionT` (`apps/front/src/data/session.ts:30-40`).

- `apps/front/src/realtime/socket.ts` — the shared client socket (11 lines):

  ```ts
  export function getSocket(): Socket {
    if (!socket) socket = io({ path: '/socket.io', withCredentials: true });
    return socket;
  }
  ```

- `apps/front/src/realtime/usePresence.ts` — the exemplar hook pattern to copy: `useEffect` keyed on the id, `socket.emit('element:join', ...)` on connect (and immediately if already connected), cleanup emits leave + removes listeners (read the whole 33-line file).

- `apps/front/src/data/session.ts` — `useSession(cid)` reads `qk.session(cid)`; `useUpdateSession.onSuccess` writes the PATCH response into that key via `qc.setQueryData(qk.session(cid), session)` (~line 93). `qk` lives in `apps/front/src/lib/queryKeys.ts` (has `session`/`sessionHistory` entries).

- `apps/front/src/pages/RunSession.tsx` — holds a local `session` state copied from the query (`useEffect` re-inits only when `loaded?.id` changes, lines 75–79), a `dirty` flag + 800 ms debounced `persist` (lines 82–117; the debounce nulls `timer.current` when it fires and clears `dirty` via a guarded `onSettled`). **The local-state copy means cache updates from a socket will NOT reach the UI on their own** — Step 5 wires that explicitly.

- Conventions: shared contract typed on both sides; `asyncHandler` on async routes; test exemplar for mocked-model tests: `apps/back/src/realtime/yElement.test.ts` (uses `vi.mock('../models/Element')`, `vi.hoisted` state). Node ≥22.12 needed for `npm test` (use `nvm use 24`).

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Build shared | `npm run build:shared` | exit 0 (run after EVERY edit to packages/shared) |
| Typecheck | `npm run typecheck` | exit 0              |
| Tests     | `npm test` (Node 24) | all pass (currently 11 files / 99 tests) |
| Build     | `npm run build`     | exit 0              |
| Manual    | `npm run dev:back` + `npm run dev:front` (needs `apps/back/.env`) | two-tab check, Step 6 |

## Scope

**In scope** (the only files you should modify/create):
- `packages/shared/src/realtime/events.ts`
- `apps/back/src/realtime/sessionRooms.ts` (create)
- `apps/back/src/realtime/sessionRooms.test.ts` (create)
- `apps/back/src/realtime/io.ts` (session:join/leave handlers + one helper)
- `apps/back/src/sessions/routes.ts` (broadcast calls only — no behavior change to the REST responses)
- `apps/front/src/realtime/useSessionChannel.ts` (create)
- `apps/front/src/pages/RunSession.tsx` (subscribe + guarded remote-state acceptance)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- Operation events, server-held state, per-op reducers — Plan 010.
- Any change to the client edit model (`patch`/`persist`/debounce/dirty) beyond the guarded remote-accept in Step 5 — Plan 011.
- ShareLink / `/share` namespace / player view — Plan 012.
- `apps/back/src/realtime/yElement.ts` — the Yjs path is untouched.
- The 409 optimistic-concurrency scheme on elements.

## Git workflow

- One commit, e.g. `Live session broadcast: session room + session:state (Slice 1)`.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Extend the shared contract

In `packages/shared/src/realtime/events.ts`, add (mirroring the design doc's contract, Slice-1 subset only):

```ts
/** Envelope identifying which game-session room an event targets. */
export interface SessionRef {
  sessionId: string;
}

/** Full session snapshot broadcast on join and after every persisted write.
 *  `session` is exactly the REST `publicSession` shape (the client's GameSessionT);
 *  `seq` is a monotonic per-room counter so clients can detect missed broadcasts. */
export interface SessionStatePayload extends SessionRef {
  seq: number;
  session: {
    id: string;
    status: 'active' | 'ended';
    sourceEncounterId: string | null;
    round: number;
    turnIndex: number;
    combatants: unknown[]; // typed loosely here; Plan 010 moves Combatant into shared
    log: unknown[];
    startedAt: string | Date;
    endedAt: string | Date | null;
  };
}
```

Add to `ClientToServerEvents`: `'session:join': (p: SessionRef) => void;` and `'session:leave': (p: SessionRef) => void;`. Add to `ServerToClientEvents`: `'session:state': (p: SessionStatePayload) => void;`.

**Verify**: `npm run build:shared` → exit 0. `npm run typecheck` → exit 0.

### Step 2: Create `apps/back/src/realtime/sessionRooms.ts`

A small module owning room naming, the per-session `seq` counter, and the broadcast:

```ts
import type { SessionDoc } from '../models/Session';
import { publicSession } from '../models/Session';
import { getIO } from './io';

const seqs = new Map<string, number>();

export function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}

/** Broadcast the full session snapshot to its room. Call after every successful
 *  session write. No-ops when the socket server isn't initialized (tests/scripts). */
export function broadcastSessionState(s: SessionDoc): void {
  const io = getIO();
  if (!io) return;
  const sessionId = String(s._id);
  const seq = (seqs.get(sessionId) ?? 0) + 1;
  seqs.set(sessionId, seq);
  io.to(sessionRoom(sessionId)).emit('session:state', {
    sessionId,
    seq,
    session: publicSession(s),
  });
  if (s.status === 'ended') seqs.delete(sessionId); // room is terminal; free the counter
}

/** Current seq (for the initial snapshot a joiner receives). */
export function currentSeq(sessionId: string): number {
  return seqs.get(sessionId) ?? 0;
}
```

Type note: `publicSession`'s return type must be assignable to the payload's `session` field — if tsc complains about `combatants`/`log` (typed `unknown[]` in shared), that is acceptable by design; cast the emitted object's `session` with a comment referencing Plan 010's typing follow-up.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: `session:join` / `session:leave` in `io.ts`

Inside the `io.on('connection', ...)` block, alongside `element:join`, add:

```ts
socket.on('session:join', async ({ sessionId }: { sessionId: string }) => {
  if (!(await canAccessSession(userId, sessionId, 'viewer'))) return;
  await socket.join(`session:${sessionId}`);
  // Fresh joiners get an immediate snapshot so they don't wait for the next write.
  const s = await GameSession.findById(sessionId);
  if (s) {
    socket.emit('session:state', {
      sessionId,
      seq: currentSeq(sessionId),
      session: publicSession(s as SessionDoc),
    });
  }
});

socket.on('session:leave', ({ sessionId }: { sessionId: string }) => {
  void socket.leave(`session:${sessionId}`);
});
```

And a `canAccessSession` helper next to `canAccessElement`, same shape:

```ts
async function canAccessSession(
  userId: string,
  sessionId: string,
  min: MembershipRole,
): Promise<boolean> {
  if (!isValidObjectId(sessionId)) return false;
  const s = await GameSession.findById(sessionId).select('campaignId');
  if (!s) return false;
  const m = await Membership.findOne({ campaignId: s.campaignId, userId });
  return !!m && roleAtLeast(m.role as MembershipRole, min);
}
```

Imports to add in `io.ts`: `GameSession, publicSession, type SessionDoc` from `../models/Session`, and `currentSeq` from `./sessionRooms`. Do NOT import `broadcastSessionState` here (it lives on the REST side); importing `currentSeq` from `sessionRooms` while `sessionRooms` imports `getIO` from `io.ts` is a cycle — Node handles this specific shape (both are late-bound function calls, nothing runs at import time), but if tsc/runtime complains, move `currentSeq`+`seqs` into a third tiny module (`sessionSeq.ts`) and have both import it. Document whichever you did.

**Verify**: `npm run typecheck` → exit 0.

### Step 4: Broadcast from the REST handlers

In `apps/back/src/sessions/routes.ts`, import `broadcastSessionState` from `../realtime/sessionRooms` and call it after each successful write, before the `res.json`:

- `POST /session` (start): after `GameSession.create(...)` → `broadcastSessionState(s as SessionDoc);` (harmless no-listener broadcast, keeps the code uniform).
- `PATCH /session/:sid`: after the `findOneAndUpdate` returns a non-null `s` → `broadcastSessionState(s as SessionDoc);`
- `POST /session/:sid/end`: same, after non-null `s`.

Do not change any response shape, status code, or validation.

**Verify**: `npm run typecheck` → exit 0. `npm test` (Node 24) → all pre-existing tests still pass.

### Step 5: Client hook + RunSession wiring

Create `apps/front/src/realtime/useSessionChannel.ts`, modeled on `usePresence.ts`:

```ts
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionStatePayload } from '@mythbindr/shared';
import { qk } from '../lib/queryKeys';
import { getSocket } from './socket';
import type { GameSessionT } from '../data/session';

/**
 * Join a game session's realtime room. Every `session:state` broadcast is
 * written into the React Query cache (same key `useSession` reads), and
 * `onRemoteState` fires so the page can decide whether to adopt it into
 * local editing state (see RunSession's guard).
 */
export function useSessionChannel(
  cid: string | undefined,
  sessionId: string | undefined,
  onRemoteState: (s: GameSessionT, seq: number) => void,
): void {
  const qc = useQueryClient();
  const cb = useRef(onRemoteState);
  cb.current = onRemoteState;

  useEffect(() => {
    if (!cid || !sessionId) return;
    const socket = getSocket();
    const onState = (p: SessionStatePayload) => {
      if (p.sessionId !== sessionId) return;
      const s = p.session as unknown as GameSessionT;
      qc.setQueryData(qk.session(cid), s);
      cb.current(s, p.seq);
    };
    const join = () => socket.emit('session:join', { sessionId });
    socket.on('session:state', onState);
    socket.on('connect', join);
    if (socket.connected) join();
    return () => {
      socket.emit('session:leave', { sessionId });
      socket.off('session:state', onState);
      socket.off('connect', join);
    };
  }, [cid, sessionId, qc]);
}
```

In `RunSession.tsx`, call it after the existing state declarations (it needs `session?.id`, `dirty`, `timer`, `update`):

```ts
useSessionChannel(cid, session?.id, (remote) => {
  // Slice-1 conflict posture (docs/design/live-session.md): adopt remote state
  // only when this tab has nothing in flight — a buffered edit (dirty/timer)
  // or a pending PATCH wins locally and reconciles on its own onSuccess.
  if (dirty || timer.current || update.isPending) return;
  setSession(remote);
});
```

Note the hook must be called unconditionally (before the early `return`s at lines ~123–141) to respect the rules of hooks — place it with the other hooks at the top; it internally no-ops while `session?.id` is undefined.

**Verify**: `npm run typecheck` → exit 0. `npm run build` → exit 0.

### Step 6: Tests + manual check

Unit test `apps/back/src/realtime/sessionRooms.test.ts` (model after `yElement.test.ts`'s mocking style):
- `vi.mock('./io', ...)` so `getIO()` returns a fake `{ to: vi.fn(() => ({ emit })) }`.
- Broadcasting the same session twice yields `seq` 1 then 2; a different session starts at 1.
- Broadcasting an `ended` session frees its counter (a subsequent broadcast restarts at 1 — assert via the emitted payloads).
- `getIO()` returning null → no throw, no emit.

Manual (requires `apps/back/.env`; if unavailable in your environment, SKIP and say so — the reviewer/operator runs it): open Run Session in two tabs as the same user; edit HP in tab A; within ~1 s tab B shows the new HP without navigation. Then start typing an edit in tab B and confirm an incoming broadcast does NOT stomp the in-progress edit (the dirty guard).

**Verify**: `npm test` (Node 24) → all pass including the new file.

## Test plan

Covered in Step 6. The client hook and the RunSession guard are component-level (no component-test infra exists); their verification is the manual two-tab check plus typecheck.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck`, `npm run build`, `npm test` (Node 24) all exit 0
- [ ] `grep -c "session:join\|session:leave\|session:state" packages/shared/src/realtime/events.ts` ≥ 3
- [ ] `grep -c "broadcastSessionState" apps/back/src/sessions/routes.ts` = 3 (start, patch, end)
- [ ] `grep -n "canAccessSession" apps/back/src/realtime/io.ts` matches
- [ ] `grep -n "useSessionChannel" apps/front/src/pages/RunSession.tsx` matches, and the guard references `dirty` and `timer.current`
- [ ] `git status --porcelain` shows changes only to in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above no longer match the live code (drift).
- The `sessionRooms` ↔ `io` import cycle cannot be resolved with the third-module fallback in one attempt.
- The typed Socket.IO `Server<ClientToServerEvents, ServerToClientEvents>` generics reject the new events in a way a plain contract fix doesn't cure — the contract change may need restructuring; report.
- You find yourself modifying `persist`, `patch`, the debounce, or the PATCH route's semantics — that is Plans 010/011 territory.

## Maintenance notes

- Plan 010 replaces the broadcast source (REST handlers → server-held room state) but keeps this contract; `broadcastSessionState`'s call sites move, the event shape stays.
- The dirty/timer guard in RunSession is Slice-1 scaffolding — Plan 011 removes it along with the debounce.
- Reviewer should scrutinize: the join snapshot path (Step 3) racing a concurrent PATCH broadcast is benign (idempotent full snapshots, seq detects ordering) — confirm no code assumes deltas.
