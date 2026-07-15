import { describe, expect, it } from 'vitest';
import { applyOp } from '@mythbindr/shared';
import type { Combatant } from '@mythbindr/shared';
import {
  deriveState,
  localOp,
  opError,
  planDispatch,
  seedConfirmed,
  serverState,
  type ChannelState,
} from './useSessionChannel';
import type { GameSessionT } from '../data/session';

// Pure reconciliation state machine tests (Plan 011 Step 4) — no React, no
// socket. `applyOp` is imported straight from `@mythbindr/shared` (not the
// `/combat` subpath the runtime hook uses) so these tests double as an
// integration check that the client's optimistic apply and the server's
// authoritative apply are the exact same function.

function combatant(over: Partial<Combatant> = {}): Combatant {
  return {
    cid: 'c1',
    name: 'Goblin',
    initiative: 10,
    maxHp: 7,
    currentHp: 7,
    tempHp: 0,
    conditions: [],
    deathSaves: { successes: 0, failures: 0 },
    isPlayer: false,
    sourceElementId: null,
    notes: '',
    ...over,
  };
}

function session(over: Partial<GameSessionT> = {}): GameSessionT {
  return {
    id: 'sess1',
    status: 'active',
    sourceEncounterId: null,
    round: 1,
    turnIndex: 0,
    // Two combatants so `nextTurn` advances `turnIndex` (0 -> 1) instead of
    // wrapping straight back to 0 and incrementing `round`.
    combatants: [combatant(), combatant({ cid: 'c2', name: 'Bandit', initiative: 5 })],
    log: [],
    startedAt: '2026-07-14T00:00:00.000Z',
    endedAt: null,
    ...over,
  };
}

describe('useSessionChannel reconciliation', () => {
  it('shows an optimistic op immediately in the derived state', () => {
    const cs = seedConfirmed(session());
    const withOp = localOp(cs, { kind: 'nextTurn' });
    expect(withOp.pending).toHaveLength(1);
    expect(deriveState(withOp)?.turnIndex).toBe(1);
  });

  it('clears pending and adopts server truth on a higher-seq broadcast', () => {
    let cs = seedConfirmed(session());
    cs = localOp(cs, { kind: 'nextTurn' });
    const serverTruth = session({ turnIndex: 1 });
    cs = serverState(cs, { state: serverTruth, seq: 0 });
    expect(cs.pending).toHaveLength(0);
    expect(cs.confirmed).toEqual({ state: serverTruth, seq: 0 });
    expect(deriveState(cs)).toEqual(serverTruth);
  });

  it('ignores a stale (lower-or-equal seq) broadcast', () => {
    const cs: ChannelState = { confirmed: { state: session(), seq: 5 }, pending: [] };
    const result = serverState(cs, { state: session({ round: 99 }), seq: 3 });
    expect(result).toBe(cs); // untouched — stale broadcast ignored
    const tied = serverState(cs, { state: session({ round: 99 }), seq: 5 });
    expect(tied).toBe(cs); // equal seq is also stale (already have it)
  });

  it('adopts an interleaved foreign op from the broadcast without re-applying local pending', () => {
    let cs = seedConfirmed(session());
    // Our optimistic op:
    cs = localOp(cs, { kind: 'applyDamage', cid: 'c1', amount: 3 });
    // The server's broadcast already reflects our damage AND a foreign
    // nextTurn, applied server-side in receipt order — build it with the
    // exact same reducer to simulate that.
    const ops = [
      { kind: 'applyDamage', cid: 'c1', amount: 3 },
      { kind: 'nextTurn' },
    ] as const;
    const serverTruth = ops.reduce<GameSessionT>(
      (acc, op) => ({ ...acc, ...applyOp(acc, op) }),
      session(),
    );
    cs = serverState(cs, { state: serverTruth, seq: 1 });
    expect(cs.pending).toHaveLength(0);
    expect(deriveState(cs)).toEqual(serverTruth);
    expect(deriveState(cs)?.combatants[0].currentHp).toBe(4);
    expect(deriveState(cs)?.turnIndex).toBe(1);
  });

  it('optimistic applyDamage runs the shared reducer path (tempHp absorbs first)', () => {
    const cs = seedConfirmed(
      session({ combatants: [combatant({ tempHp: 3, currentHp: 7 })] }),
    );
    const withOp = localOp(cs, { kind: 'applyDamage', cid: 'c1', amount: 5 });
    const shown = deriveState(withOp)?.combatants[0];
    // 3 absorbed by tempHp, 2 through to HP — proves the derived state comes
    // from the reducer's tempHp-absorb math, not simple subtraction (which
    // would give currentHp 2 and leave tempHp untouched).
    expect(shown?.tempHp).toBe(0);
    expect(shown?.currentHp).toBe(5);
  });

  it('rolls back to confirmed on opError', () => {
    let cs = seedConfirmed(session());
    cs = localOp(cs, { kind: 'nextTurn' });
    cs = opError(cs);
    expect(cs.pending).toHaveLength(0);
    expect(deriveState(cs)).toEqual(cs.confirmed?.state);
    expect(deriveState(cs)?.turnIndex).toBe(0);
  });

  it('planDispatch emits over the socket when live', () => {
    const cs = seedConfirmed(session());
    const plan = planDispatch(cs, { kind: 'nextTurn' }, 'sess1', true);
    expect(plan.wire).toEqual({ event: 'session:nextTurn', payload: { sessionId: 'sess1' } });
    expect(plan.fallbackState).toBeUndefined();
    expect(plan.next.pending).toHaveLength(1);
  });

  it('planDispatch applies locally and flags fallback when disconnected', () => {
    const cs = seedConfirmed(session());
    const plan = planDispatch(cs, { kind: 'nextTurn' }, 'sess1', false);
    expect(plan.wire).toBeUndefined();
    expect(plan.fallbackState?.turnIndex).toBe(1);
    expect(plan.next.pending).toHaveLength(1);
  });

  it('strips appendLog down to kind/text on the wire but keeps the full entry for local apply', () => {
    const cs = seedConfirmed(session());
    const entry = { kind: 'note' as const, text: 'hi', by: 'GM', at: '2026-07-14T00:00:01.000Z' };
    const plan = planDispatch(cs, { kind: 'appendLog', entry }, 'sess1', true);
    expect(plan.wire).toEqual({
      event: 'session:appendLog',
      payload: { sessionId: 'sess1', kind: 'note', text: 'hi' },
    });
    expect(deriveState(plan.next)?.log).toEqual([entry]);
  });
});
