import { describe, expect, it } from 'vitest';
import { generateParty } from './generators';

describe('generateParty', () => {
  it.each([4, 5])('produces %d characters with sane, in-range stats across many iterations', (n) => {
    for (let iter = 0; iter < 20; iter++) {
      const level = 1 + (iter % 20);
      const party = generateParty(n, level);
      expect(party).toHaveLength(n);
      for (const pc of party) {
        expect(pc.hpMax).toBeGreaterThanOrEqual(1);
        expect(pc.ac).toBeGreaterThanOrEqual(8);
        expect(pc.ac).toBeLessThanOrEqual(20);
        expect(pc.name.length).toBeGreaterThan(0);
        expect(pc.klass.length).toBeGreaterThan(0);
        expect(pc.race.length).toBeGreaterThan(0);
        expect(pc.role.length).toBeGreaterThan(0);
        expect(pc.flawsBonds.length).toBeGreaterThan(0);
        expect(pc.backstoryHooks.length).toBeGreaterThan(0);
        expect(pc.passivePerception).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('clamps level into [1, 20]', () => {
    const tooLow = generateParty(1, 0);
    const tooHigh = generateParty(1, 99);
    expect(tooLow[0].level).toBe(1);
    expect(tooHigh[0].level).toBe(20);
  });

  it('leads with the core four classes in a fixed order (tank/healer/damage/utility)', () => {
    const party = generateParty(4, 1);
    expect(party.map((pc) => pc.klass)).toEqual(['Fighter', 'Cleric', 'Rogue', 'Wizard']);
  });
});
