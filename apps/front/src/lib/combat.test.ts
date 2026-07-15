import { describe, expect, it } from 'vitest';
import { applyHeal } from './combat';
import type { Combatant } from '../data/session';

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

describe('applyHeal', () => {
  it('heal from positive HP clamps at maxHp', () => {
    const c = combatant({ currentHp: 15, maxHp: 20 });
    const result = applyHeal(c, 10);
    expect(result.currentHp).toBe(20);
  });

  it('heal from negative HP starts at 0', () => {
    const c = combatant({ currentHp: -15, maxHp: 20 });
    const result = applyHeal(c, 10);
    expect(result.currentHp).toBe(10);
  });

  it('crossing 0 resets deathSaves to {successes: 0, failures: 0}', () => {
    const c = combatant({
      currentHp: -5,
      maxHp: 20,
      deathSaves: { successes: 2, failures: 1 },
    });
    const result = applyHeal(c, 10);
    // heal-from-0 applies here too: from = max(-5, 0) = 0, so 0 + 10 = 10.
    expect(result.currentHp).toBe(10);
    expect(result.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it('healing while already above 0 leaves deathSaves untouched', () => {
    const c = combatant({
      currentHp: 5,
      maxHp: 20,
      deathSaves: { successes: 1, failures: 1 },
    });
    const result = applyHeal(c, 5);
    expect(result.currentHp).toBe(10);
    expect(result.deathSaves).toEqual({ successes: 1, failures: 1 });
  });

  it('maxHp === 0 fallback (unset max) does not clamp below the healed value', () => {
    const c = combatant({ currentHp: -10, maxHp: 0 });
    const result = applyHeal(c, 15);
    // from = max(-10, 0) = 0; max fallback = 0 + 15 = 15
    expect(result.currentHp).toBe(15);
  });
});
