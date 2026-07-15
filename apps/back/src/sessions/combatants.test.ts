import { describe, expect, it } from 'vitest';
import { parseCombatants } from './combatants';

describe('parseCombatants', () => {
  it.each([
    ['2x Goblin', ['Goblin 1', 'Goblin 2']],
    ['2 Goblin', ['Goblin 1', 'Goblin 2']],
    ['Goblin x2', ['Goblin 1', 'Goblin 2']],
    ['Bugbear', ['Bugbear']],
  ])('parses %s', (input, expectedNames) => {
    const result = parseCombatants(input);
    expect(result.map((c) => c.name)).toEqual(expectedNames);
  });

  it('clamps counts above 30 down to 30', () => {
    const result = parseCombatants('50x Rat');
    expect(result).toHaveLength(30);
    expect(result[0].name).toBe('Rat 1');
    expect(result[29].name).toBe('Rat 30');
  });

  it('handles mixed multi-line input with blank lines', () => {
    const result = parseCombatants('2x Goblin\n\nBugbear\n\nGoblin x1');
    expect(result.map((c) => c.name)).toEqual(['Goblin 1', 'Goblin 2', 'Bugbear', 'Goblin']);
  });

  it.each([undefined, ''])('returns [] for %s input', (input) => {
    expect(parseCombatants(input)).toEqual([]);
  });

  it('produces the expected blank template fields', () => {
    const [c] = parseCombatants('Bugbear');
    expect(c.initiative).toBe(0);
    expect(c.maxHp).toBe(0);
    expect(c.currentHp).toBe(0);
    expect(c.tempHp).toBe(0);
    expect(c.conditions).toEqual([]);
    expect(c.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(c.isPlayer).toBe(false);
    expect(c.sourceElementId).toBeNull();
    expect(c.notes).toBe('');
    expect(c.cid).toMatch(/^[0-9a-f]{16}$/);
  });

  it('assigns unique 16-hex cids to every combatant, even duplicates', () => {
    const result = parseCombatants('5x Goblin');
    const cids = result.map((c) => c.cid);
    for (const cid of cids) {
      expect(cid).toMatch(/^[0-9a-f]{16}$/);
    }
    expect(new Set(cids).size).toBe(cids.length);
  });
});
