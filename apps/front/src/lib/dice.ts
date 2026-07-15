export type Rng = () => number; // [0,1) like Math.random

export function rollDie(sides: number, rng: Rng = Math.random): number {
  return Math.floor(rng() * sides) + 1;
}

/** Parse "8d6+3", "d20-1", "3d8" (whitespace/case tolerant). */
export function parseFormula(raw: string): { count: number; sides: number; mod: number } | null {
  const m = raw.replace(/\s+/g, '').toLowerCase().match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!m) return null;
  const count = Math.min(Math.max(parseInt(m[1] || '1', 10), 1), 100);
  const sides = parseInt(m[2], 10);
  if (sides < 2 || sides > 1000) return null;
  return { count, sides, mod: m[3] ? parseInt(m[3], 10) : 0 };
}

/**
 * Advantage/disadvantage for any die: each die is rolled twice and the better
 * (or worse) result kept. d20s report each pair as its own total — they're
 * separate checks/attacks. Other dice sum the picks — they're damage.
 */
export function rollWithEdge(
  kind: 'adv' | 'dis',
  sides: number,
  count: number,
  m: number,
  rng: Rng = Math.random,
): string {
  const pairs = Array.from({ length: count }, () => {
    const a = rollDie(sides, rng);
    const b = rollDie(sides, rng);
    return { a, b, pick: kind === 'adv' ? Math.max(a, b) : Math.min(a, b) };
  });
  const detail = pairs.map((p) => `[${p.a},${p.b}→${p.pick}]`).join(' ');
  const modStr = m ? `${m > 0 ? '+' : ''}${m}` : '';
  const label = `${count > 1 ? `${count}×` : ''}d${sides} (${kind})`;
  if (sides === 20) {
    const totals = pairs.map((p) => p.pick + m).join(', ');
    return `${label} ${detail}${modStr} = ${totals}`;
  }
  const sum = pairs.reduce((s, p) => s + p.pick, 0) + m;
  return `${label} ${detail}${modStr} = ${sum}`;
}
