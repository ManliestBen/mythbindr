import { describe, expect, it } from 'vitest';
import { parseFormula, rollDie, rollWithEdge } from './dice';

describe('parseFormula', () => {
  it.each([
    ['8d6+3', { count: 8, sides: 6, mod: 3 }],
    ['d20-1', { count: 1, sides: 20, mod: -1 }],
    ['3d8', { count: 3, sides: 8, mod: 0 }],
    [' 2D10 + 4 ', { count: 2, sides: 10, mod: 4 }],
  ] as const)('parses %s', (input, expected) => {
    expect(parseFormula(input)).toEqual(expected);
  });

  it('clamps count above 100 down to 100', () => {
    expect(parseFormula('200d6')).toEqual({ count: 100, sides: 6, mod: 0 });
  });

  it('clamps count below 1 up to 1', () => {
    expect(parseFormula('0d6')).toEqual({ count: 1, sides: 6, mod: 0 });
  });

  it.each(['1d1', '1d1001'])('rejects out-of-range sides (%s)', (input) => {
    expect(parseFormula(input)).toBeNull();
  });

  it.each(['d', '', '2d6+2d4'])('rejects malformed input (%s)', (input) => {
    expect(parseFormula(input)).toBeNull();
  });
});

describe('rollDie', () => {
  it('returns 1 when rng yields 0', () => {
    expect(rollDie(20, () => 0)).toBe(1);
  });

  it('returns sides when rng yields just under 1', () => {
    expect(rollDie(20, () => 0.9999)).toBe(20);
  });
});

describe('rollWithEdge', () => {
  function scriptedRng(sequence: number[]): () => number {
    let i = 0;
    return () => {
      const v = sequence[i % sequence.length];
      i += 1;
      return v;
    };
  }

  it('adv keeps the max of each pair; d20 reports each pair as its own total (comma-joined)', () => {
    // Two pairs for a d20: (a=0.5*20+1=11, b=0.05*20+1=2) -> pick 11 ; (a=0.95->20, b=0.1->3) -> pick 20
    const rng = scriptedRng([0.5, 0.05, 0.95, 0.1]);
    const result = rollWithEdge('adv', 20, 2, 2, rng);
    // pick values: 11+2=13, 20+2=22
    expect(result).toContain('13, 22');
    expect(result).toContain('(adv)');
    expect(result).toContain('2×d20');
  });

  it('dis keeps the min of each pair', () => {
    const rng = scriptedRng([0.5, 0.05, 0.95, 0.1]);
    // pair1: a=11,b=2 -> pick min=2 ; pair2: a=20,b=3 -> pick min=3
    const result = rollWithEdge('dis', 20, 2, 0, rng);
    expect(result).toContain('2, 3');
    expect(result).toContain('(dis)');
  });

  it('non-d20 dice sum the picks (treated as damage) rather than reporting per-pair totals', () => {
    // d6: pair1 a=0.5*6+1=4,b=0.05*6+1=1 -> pick(adv)=4 ; pair2 a=0.95*6+1=6(rounds down to 6),b=0.1*6+1=1 -> pick=6
    const rng = scriptedRng([0.5, 0.05, 0.95, 0.1]);
    const result = rollWithEdge('adv', 6, 2, 1, rng);
    // sum = 4 + 6 + 1(mod) = 11
    expect(result).toMatch(/= 11$/);
  });

  it('modifier renders as +N / -N and is omitted when 0', () => {
    const rngZeroMod = scriptedRng([0, 0]);
    const noMod = rollWithEdge('adv', 6, 1, 0, rngZeroMod);
    expect(noMod).not.toContain('+0');
    expect(noMod).not.toMatch(/\]0/); // no bare 0 glued to bracket

    const rngPos = scriptedRng([0, 0]);
    const posMod = rollWithEdge('adv', 6, 1, 2, rngPos);
    expect(posMod).toContain('+2');

    const rngNeg = scriptedRng([0, 0]);
    const negMod = rollWithEdge('adv', 6, 1, -1, rngNeg);
    expect(negMod).toContain('-1');
  });

  it('pluralizes the label with count× only when count > 1', () => {
    const rng = scriptedRng([0, 0]);
    expect(rollWithEdge('adv', 20, 1, 0, rng)).toContain('d20 (adv)');
    expect(rollWithEdge('adv', 20, 1, 0, rng)).not.toContain('1×d20');
    expect(rollWithEdge('adv', 20, 3, 0, rng)).toContain('3×d20');
  });
});
