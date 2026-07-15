import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionStatePayload } from '@mythbindr/shared';
// Runtime value import: prefer the `/combat` subpath, not the package root —
// the front's production (Rollup) build cannot statically trace a named
// binding through the root's compiled CommonJS `export *` chain, but resolves
// it cleanly one hop from the subpath entry (see apps/front/vite.config.ts's
// `commonjsOptions.include` and apps/front/src/lib/combat.ts for the same
// pattern).
import { applyOp, type SessionOp } from '@mythbindr/shared/combat';
import { qk } from '../lib/queryKeys';
import { getSocket } from './socket';
import type { GameSessionT } from '../data/session';

// ── Pure reconciliation state machine (Plan 011 Step 1) ─────────────────────
// No React, no socket — every transition here is a plain data-in/data-out
// function so `useSessionChannel.test.ts` can exercise the reconciliation
// logic directly, and so the tests double as an integration check that the
// client reduces identically to the server's `applyOp` (packages/shared).

/** Confirmed-plus-pending view of a live session, used to reconcile
 *  optimistic local edits against the server's authoritative, `seq`-numbered
 *  broadcasts. */
export interface ChannelState {
  /** Server-confirmed state at `seq`, or a REST cold-load snapshot seeded at
   *  `seq: -1` (always superseded by the first real broadcast — see
   *  `seedConfirmed`). */
  confirmed: { state: GameSessionT; seq: number } | null;
  /** Ops applied optimistically, not yet covered by a server broadcast. */
  pending: { op: SessionOp; sentAt: number }[];
}

export const EMPTY_CHANNEL_STATE: ChannelState = { confirmed: null, pending: [] };

/** Extract the subset of `GameSessionT` that `applyOp` operates on — `applyOp`
 *  works on `GameSessionState` (round/turnIndex/combatants/log/status), not
 *  the full `GameSessionT` (which adds id/sourceEncounterId/startedAt/endedAt). */
function toSessionState(g: GameSessionT) {
  const { round, turnIndex, combatants, log, status } = g;
  return { round, turnIndex, combatants, log, status };
}

/** Apply one op to a full `GameSessionT`, spreading the reducer's result back
 *  over the fields `applyOp` doesn't know about (id/sourceEncounterId/…). */
function applyOpToSession(g: GameSessionT, op: SessionOp): GameSessionT {
  return { ...g, ...applyOp(toSessionState(g), op) };
}

/** Seed `confirmed` from a REST cold-load snapshot (first mount, or a new
 *  session's `loaded?.id` changing, or a just-started session's mutation
 *  response) — always accepted: a change of session identity makes any prior
 *  confirmed/pending state moot. The `seq: -1` sentinel guarantees the first
 *  real broadcast (whose `seq` starts at 0) is never mistaken for stale. */
export function seedConfirmed(session: GameSessionT): ChannelState {
  return { confirmed: { state: session, seq: -1 }, pending: [] };
}

/** Optimistically push a locally-dispatched op onto `pending`. */
export function localOp(cs: ChannelState, op: SessionOp): ChannelState {
  return { ...cs, pending: [...cs.pending, { op, sentAt: Date.now() }] };
}

/**
 * Reconcile against a server broadcast. A stale (already-seen-or-older) `seq`
 * is ignored; otherwise the server's snapshot becomes `confirmed` and
 * `pending` is cleared entirely — the broadcast already reflects our own op
 * (if any) plus any interleaved foreign ops, applied server-side in receipt
 * order.
 *
 * This is a simplification over per-op acking: it assumes every accepted op
 * yields exactly one broadcast (true as of Plan 010 — see
 * `apps/back/src/realtime/sessionState.ts`'s `applySessionOp`). If
 * batching/coalescing is ever added server-side, this needs per-op acks
 * instead of "clear everything on any broadcast."
 */
export function serverState(
  cs: ChannelState,
  payload: { state: GameSessionT; seq: number },
): ChannelState {
  if (cs.confirmed && payload.seq <= cs.confirmed.seq) return cs;
  return { confirmed: { state: payload.state, seq: payload.seq }, pending: [] };
}

/** Roll back: drop unconfirmed ops, keep the last server truth. */
export function opError(cs: ChannelState): ChannelState {
  return cs.pending.length === 0 ? cs : { ...cs, pending: [] };
}

/** The state actually shown on screen: confirmed + every pending op applied
 *  in order, so a local edit appears instantly while still reconciling. */
export function deriveState(cs: ChannelState): GameSessionT | null {
  if (!cs.confirmed) return null;
  return cs.pending.reduce((acc, { op }) => applyOpToSession(acc, op), cs.confirmed.state);
}

/**
 * Map a `SessionOp` onto its wire event + payload. Mechanical 1:1 mapping for
 * every kind except `appendLog`: the reducer's op carries a full `LogEntry`
 * (so local optimistic apply has something to show immediately), but the
 * wire `AppendLogOp` only carries `kind`/`text` — the server stamps its own
 * `at`/`by` from the authenticated socket, which is what the next
 * `session:state` broadcast will confirm with (superseding our locally
 * stamped `at`/`by` via `serverState`'s clear-pending-on-broadcast).
 */
function wireEventFor(sessionId: string, op: SessionOp): [string, unknown] {
  switch (op.kind) {
    case 'nextTurn':
      return ['session:nextTurn', { sessionId }];
    case 'prevTurn':
      return ['session:prevTurn', { sessionId }];
    case 'applyDamage':
      return ['session:applyDamage', { sessionId, cid: op.cid, amount: op.amount }];
    case 'updateCombatant':
      return ['session:updateCombatant', { sessionId, cid: op.cid, patch: op.patch }];
    case 'addCombatant':
      return ['session:addCombatant', { sessionId, combatant: op.combatant }];
    case 'removeCombatant':
      return ['session:removeCombatant', { sessionId, cid: op.cid }];
    case 'appendLog':
      return ['session:appendLog', { sessionId, kind: op.entry.kind, text: op.entry.text }];
    case 'end':
      return ['session:end', { sessionId }];
    default: {
      const exhaustive: never = op;
      throw new Error(`Unknown op: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** What `dispatch` should do, decided purely (no React, no socket) so it's
 *  directly testable — including the "disconnected" branch. */
export interface DispatchPlan {
  next: ChannelState;
  /** Present when live: emit this over the socket. */
  wire?: { event: string; payload: unknown };
  /** Present when in fallback: hand this derived state to the legacy
   *  debounced-PATCH persist. */
  fallbackState?: GameSessionT;
}

/**
 * Plan a dispatched op: always optimistic-apply locally; when `live`, also
 * emit over the socket; when not, derive the resulting state for the legacy
 * fallback persist instead (docs/design/live-session.md § Cache
 * reconciliation — "Fallback stays").
 */
export function planDispatch(
  cs: ChannelState,
  op: SessionOp,
  sessionId: string,
  live: boolean,
): DispatchPlan {
  const next = localOp(cs, op);
  if (live) {
    const [event, payload] = wireEventFor(sessionId, op);
    return { next, wire: { event, payload } };
  }
  const fallbackState = deriveState(next);
  return fallbackState ? { next, fallbackState } : { next };
}

// ── React hook (Plan 011 Step 2) ─────────────────────────────────────────────

export interface UseSessionChannelResult {
  /** Confirmed + pending, derived — what `RunSession` should render. */
  session: GameSessionT | null;
  /** Dispatch a session operation: optimistic-apply, then either emit it
   *  over the socket (live) or hand it to the legacy debounced-PATCH
   *  fallback (offline / not yet (re)joined). */
  dispatch: (op: SessionOp) => void;
  /** Reseed from a REST cold-load snapshot or a fresh mutation response —
   *  call whenever a (possibly new) session becomes the active one. */
  seed: (session: GameSessionT) => void;
  /** 'live': socket connected and the room snapshot has been received since
   *  the last connect. 'fallback': disconnected, or reconnecting and still
   *  awaiting the fresh snapshot — the legacy debounced PATCH re-engages. */
  status: 'live' | 'fallback';
  /** Ops sent but not yet covered by a server broadcast. */
  pendingCount: number;
  /** True since the last `session:opError`; cleared by the next accepted
   *  broadcast. */
  hasError: boolean;
  /** Increments once per `session:opError` — key a toast effect off this so
   *  a repeat error re-fires even while `hasError` was already true. */
  errorToken: number;
}

/**
 * Own a live session's realtime room end to end: join/leave, optimistic op
 * dispatch, and seq-based reconciliation against the server's broadcasts.
 * `RunSession` renders `session` (the derived display state) and calls
 * `dispatch`/`seed` instead of computing next-state locally and PATCHing.
 */
export function useSessionChannel(
  cid: string | undefined,
  onFallbackPersist: (state: GameSessionT) => void,
): UseSessionChannelResult {
  const qc = useQueryClient();
  const fallbackRef = useRef(onFallbackPersist);
  fallbackRef.current = onFallbackPersist;

  const channelRef = useRef<ChannelState>(EMPTY_CHANNEL_STATE);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const commit = useCallback((next: ChannelState) => {
    channelRef.current = next;
    bump();
  }, []);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'live' | 'fallback'>('fallback');
  const [hasError, setHasError] = useState(false);
  const [errorToken, setErrorToken] = useState(0);

  const seed = useCallback(
    (session: GameSessionT) => {
      setSessionId(session.id);
      setHasError(false);
      commit(seedConfirmed(session));
    },
    [commit],
  );

  useEffect(() => {
    if (!cid || !sessionId) return;
    const socket = getSocket();
    const join = () => socket.emit('session:join', { sessionId });
    const onState = (p: SessionStatePayload) => {
      if (p.sessionId !== sessionId) return;
      const s = p.session as unknown as GameSessionT;
      qc.setQueryData(qk.session(cid), s);
      setHasError(false);
      setStatus('live');
      commit(serverState(channelRef.current, { state: s, seq: p.seq }));
    };
    const onOpError = (p: { sessionId: string; message: string }) => {
      if (p.sessionId !== sessionId) return;
      setHasError(true);
      setErrorToken((n) => n + 1);
      commit(opError(channelRef.current));
    };
    const onConnect = () => join();
    const onDisconnect = () => setStatus('fallback');
    socket.on('session:state', onState);
    socket.on('session:opError', onOpError);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) join();
    return () => {
      socket.emit('session:leave', { sessionId });
      socket.off('session:state', onState);
      socket.off('session:opError', onOpError);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [cid, sessionId, qc, commit]);

  const dispatch = useCallback(
    (op: SessionOp) => {
      if (!sessionId) return;
      const plan = planDispatch(channelRef.current, op, sessionId, status === 'live');
      commit(plan.next);
      if (plan.wire) {
        getSocket().emit(plan.wire.event, plan.wire.payload);
      } else if (plan.fallbackState) {
        fallbackRef.current(plan.fallbackState);
      }
    },
    [sessionId, status, commit],
  );

  return {
    session: deriveState(channelRef.current),
    dispatch,
    seed,
    status,
    pendingCount: channelRef.current.pending.length,
    hasError,
    errorToken,
  };
}
