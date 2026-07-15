import { describe, expect, it } from 'vitest';
import { applyHeal, applyOp, OpError, type SessionOp } from './reducer';
import type { Combatant, GameSessionState } from '../schemas/session';

function combatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    cid: 'c1',
    name: 'Test',
    initiative: 10,
    maxHp: 20,
    currentHp: 10,
    tempHp: 0,
    conditions: [],
    deathSaves: { successes: 0, failures: 0 },
    isPlayer: true,
    sourceElementId: null,
    notes: '',
    ...overrides,
  };
}

function state(overrides: Partial<GameSessionState> = {}): GameSessionState {
  return {
    round: 1,
    turnIndex: 0,
    combatants: [],
    log: [],
    status: 'active',
    ...overrides,
  };
}

describe('applyHeal', () => {
  // Parity cases with the old apps/front/src/lib/combat.test.ts suite.
  it('heal from positive HP clamps at maxHp', () => {
    const c = combatant({ currentHp: 15, maxHp: 20 });
    expect(applyHeal(c, 10).currentHp).toBe(20);
  });

  it('heal from negative HP starts at 0', () => {
    const c = combatant({ currentHp: -15, maxHp: 20 });
    expect(applyHeal(c, 10).currentHp).toBe(10);
  });

  it('crossing 0 resets deathSaves to {successes: 0, failures: 0}', () => {
    const c = combatant({ currentHp: -5, maxHp: 20, deathSaves: { successes: 2, failures: 1 } });
    const result = applyHeal(c, 10);
    expect(result.currentHp).toBe(10);
    expect(result.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it('healing while already above 0 leaves deathSaves untouched', () => {
    const c = combatant({ currentHp: 5, maxHp: 20, deathSaves: { successes: 1, failures: 1 } });
    const result = applyHeal(c, 5);
    expect(result.currentHp).toBe(10);
    expect(result.deathSaves).toEqual({ successes: 1, failures: 1 });
  });

  it('maxHp === 0 fallback (unset max) does not clamp below the healed value', () => {
    const c = combatant({ currentHp: -10, maxHp: 0 });
    expect(applyHeal(c, 15).currentHp).toBe(15);
  });
});

describe('applyOp: applyDamage', () => {
  it('tempHp absorbs damage before currentHp', () => {
    const s = state({ combatants: [combatant({ tempHp: 5, currentHp: 10 })] });
    const next = applyOp(s, { kind: 'applyDamage', cid: 'c1', amount: 3 });
    expect(next.combatants[0].tempHp).toBe(2);
    expect(next.combatants[0].currentHp).toBe(10);
  });

  it('damage beyond tempHp spills onto currentHp', () => {
    const s = state({ combatants: [combatant({ tempHp: 5, currentHp: 10 })] });
    const next = applyOp(s, { kind: 'applyDamage', cid: 'c1', amount: 8 });
    expect(next.combatants[0].tempHp).toBe(0);
    expect(next.combatants[0].currentHp).toBe(7);
  });

  it('damage floors at -99', () => {
    const s = state({ combatants: [combatant({ tempHp: 0, currentHp: 5 })] });
    const next = applyOp(s, { kind: 'applyDamage', cid: 'c1', amount: 500 });
    expect(next.combatants[0].currentHp).toBe(-99);
  });

  it('negative amount routes through applyHeal (heal-from-0, death-save reset)', () => {
    const s = state({
      combatants: [
        combatant({ currentHp: -5, maxHp: 20, deathSaves: { successes: 2, failures: 1 } }),
      ],
    });
    const next = applyOp(s, { kind: 'applyDamage', cid: 'c1', amount: -10 });
    expect(next.combatants[0].currentHp).toBe(10);
    expect(next.combatants[0].deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it('throws OpError for an unknown cid', () => {
    const s = state({ combatants: [combatant()] });
    expect(() => applyOp(s, { kind: 'applyDamage', cid: 'nope', amount: 1 })).toThrow(OpError);
  });
});

describe('applyOp: nextTurn / prevTurn', () => {
  it('advances turnIndex within a round', () => {
    const s = state({
      combatants: [
        combatant({ cid: 'a', initiative: 20 }),
        combatant({ cid: 'b', initiative: 10 }),
      ],
      turnIndex: 0,
    });
    const next = applyOp(s, { kind: 'nextTurn' });
    expect(next.turnIndex).toBe(1);
    expect(next.round).toBe(1);
  });

  it('wraps turnIndex to 0 and increments round, logging "Round N begins"', () => {
    const s = state({
      combatants: [
        combatant({ cid: 'a', initiative: 20 }),
        combatant({ cid: 'b', initiative: 10 }),
      ],
      turnIndex: 1,
      round: 1,
    });
    const next = applyOp(s, { kind: 'nextTurn' });
    expect(next.turnIndex).toBe(0);
    expect(next.round).toBe(2);
    expect(next.log.at(-1)).toMatchObject({ kind: 'event', text: 'Round 2 begins' });
  });

  it('decrements finite condition rounds on the combatant whose turn begins, dropping expired ones', () => {
    const s = state({
      combatants: [
        combatant({ cid: 'a', initiative: 20, conditions: [{ name: 'Prone', rounds: null }] }),
        combatant({
          cid: 'b',
          initiative: 10,
          conditions: [
            { name: 'Poisoned', rounds: 1 },
            { name: 'Blessed', rounds: 3 },
          ],
        }),
      ],
      turnIndex: 0,
    });
    const next = applyOp(s, { kind: 'nextTurn' });
    const b = next.combatants.find((c) => c.cid === 'b')!;
    // Poisoned (rounds: 1) expires (1 - 1 = 0, dropped); Blessed decrements to 2.
    expect(b.conditions).toEqual([{ name: 'Blessed', rounds: 2 }]);
    // Combatant not on turn is untouched.
    const a = next.combatants.find((c) => c.cid === 'a')!;
    expect(a.conditions).toEqual([{ name: 'Prone', rounds: null }]);
  });

  it('prevTurn steps back within a round without restoring conditions', () => {
    const s = state({
      combatants: [
        combatant({ cid: 'a', initiative: 20 }),
        combatant({ cid: 'b', initiative: 10 }),
      ],
      turnIndex: 1,
      round: 2,
    });
    const next = applyOp(s, { kind: 'prevTurn' });
    expect(next.turnIndex).toBe(0);
    expect(next.round).toBe(2);
  });

  it('prevTurn at the top of round 1 is a no-op', () => {
    const s = state({
      combatants: [combatant({ cid: 'a' })],
      turnIndex: 0,
      round: 1,
    });
    const next = applyOp(s, { kind: 'prevTurn' });
    expect(next).toEqual(s);
  });

  it('prevTurn wraps to the last combatant and decrements round when stepping before round start', () => {
    const s = state({
      combatants: [
        combatant({ cid: 'a', initiative: 20 }),
        combatant({ cid: 'b', initiative: 10 }),
      ],
      turnIndex: 0,
      round: 2,
    });
    const next = applyOp(s, { kind: 'prevTurn' });
    expect(next.turnIndex).toBe(1);
    expect(next.round).toBe(1);
  });
});

describe('applyOp: removeCombatant pointer-follow', () => {
  const three = () => [
    combatant({ cid: 'a', initiative: 30 }),
    combatant({ cid: 'b', initiative: 20 }),
    combatant({ cid: 'c', initiative: 10 }),
  ];

  it('removing a combatant above the acting slot keeps following the acting combatant', () => {
    // turnIndex 1 -> acting combatant is 'b' (order a, b, c).
    const s = state({ combatants: three(), turnIndex: 1 });
    const next = applyOp(s, { kind: 'removeCombatant', cid: 'a' });
    // Order is now b, c; 'b' is still the acting combatant, now at index 0.
    expect(next.combatants.map((c) => c.cid)).toEqual(['b', 'c']);
    expect(next.turnIndex).toBe(0);
  });

  it('removing the acting combatant itself clamps to the same/next slot', () => {
    const s = state({ combatants: three(), turnIndex: 1 }); // acting = 'b'
    const next = applyOp(s, { kind: 'removeCombatant', cid: 'b' });
    expect(next.combatants.map((c) => c.cid)).toEqual(['a', 'c']);
    expect(next.turnIndex).toBe(1); // clamped to remaining length - 1... see below
  });

  it('removing a combatant below the acting slot does not move the pointer', () => {
    const s = state({ combatants: three(), turnIndex: 0 }); // acting = 'a'
    const next = applyOp(s, { kind: 'removeCombatant', cid: 'c' });
    expect(next.combatants.map((c) => c.cid)).toEqual(['a', 'b']);
    expect(next.turnIndex).toBe(0);
  });

  it('throws OpError for an unknown cid', () => {
    const s = state({ combatants: three() });
    expect(() => applyOp(s, { kind: 'removeCombatant', cid: 'nope' })).toThrow(OpError);
  });
});

describe('applyOp: updateCombatant', () => {
  it('shallow-merges the patch and follows the acting combatant through a re-sort', () => {
    const s = state({
      combatants: [combatant({ cid: 'a', initiative: 5 }), combatant({ cid: 'b', initiative: 20 })],
      turnIndex: 1, // acting = 'a' (lower initiative, sorted second)
    });
    const next = applyOp(s, {
      kind: 'updateCombatant',
      cid: 'a',
      patch: { initiative: 100 },
    });
    // 'a' now sorts first; the pointer must follow it to index 0.
    expect(next.combatants.find((c) => c.cid === 'a')?.initiative).toBe(100);
    expect(next.turnIndex).toBe(0);
  });

  it('throws OpError for an unknown cid', () => {
    const s = state({ combatants: [combatant({ cid: 'a' })] });
    expect(() =>
      applyOp(s, { kind: 'updateCombatant', cid: 'nope', patch: { notes: 'x' } }),
    ).toThrow(OpError);
  });
});

describe('applyOp: addCombatant / appendLog', () => {
  it('adds a combatant', () => {
    const s = state({ combatants: [combatant({ cid: 'a' })] });
    const next = applyOp(s, { kind: 'addCombatant', combatant: combatant({ cid: 'b' }) });
    expect(next.combatants.map((c) => c.cid)).toEqual(['a', 'b']);
  });

  it('appends a log entry and caps the log at 500 entries', () => {
    const log = Array.from({ length: 500 }, (_, i) => ({
      kind: 'note' as const,
      text: `entry ${i}`,
    }));
    const s = state({ log });
    const next = applyOp(s, {
      kind: 'appendLog',
      entry: { kind: 'roll', text: 'new roll' },
    });
    expect(next.log).toHaveLength(500);
    expect(next.log.at(-1)).toEqual({ kind: 'roll', text: 'new roll' });
    expect(next.log[0]).toEqual({ kind: 'note', text: 'entry 1' });
  });
});

describe('applyOp: end / ended-session guard', () => {
  it('end sets status to ended', () => {
    const s = state();
    const next = applyOp(s, { kind: 'end' });
    expect(next.status).toBe('ended');
  });

  it.each<SessionOp>([
    { kind: 'nextTurn' },
    { kind: 'prevTurn' },
    { kind: 'applyDamage', cid: 'a', amount: 1 },
    { kind: 'updateCombatant', cid: 'a', patch: {} },
    { kind: 'addCombatant', combatant: combatant({ cid: 'b' }) },
    { kind: 'removeCombatant', cid: 'a' },
    { kind: 'appendLog', entry: { kind: 'note', text: 'x' } },
    { kind: 'end' },
  ])('every op ($kind) against an ended session throws OpError', (op) => {
    const s = state({ status: 'ended', combatants: [combatant({ cid: 'a' })] });
    expect(() => applyOp(s, op)).toThrow(OpError);
  });
});

describe('applyOp: immutability', () => {
  it('does not mutate the input state or its nested combatants/log', () => {
    const s = state({
      combatants: [combatant({ cid: 'a', currentHp: 10, conditions: [{ name: 'Prone', rounds: 2 }] })],
      log: [{ kind: 'note', text: 'before' }],
    });
    const before = JSON.parse(JSON.stringify(s));
    applyOp(s, { kind: 'applyDamage', cid: 'a', amount: 5 });
    applyOp(s, { kind: 'nextTurn' });
    applyOp(s, { kind: 'appendLog', entry: { kind: 'roll', text: 'x' } });
    expect(s).toEqual(before);
  });

  it('returns a new top-level object, not the same reference', () => {
    const s = state({ combatants: [combatant({ cid: 'a' })] });
    const next = applyOp(s, { kind: 'appendLog', entry: { kind: 'note', text: 'x' } });
    expect(next).not.toBe(s);
  });
});
