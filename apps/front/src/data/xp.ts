// DMG encounter-building tables.

/** Challenge rating → XP value. */
export const CR_XP: Record<string, number> = {
  '0': 10,
  '0.125': 25,
  '0.25': 50,
  '0.5': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1100,
  '5': 1800,
  '6': 2300,
  '7': 2900,
  '8': 3900,
  '9': 5000,
  '10': 5900,
  '11': 7200,
  '12': 8400,
  '13': 10000,
  '14': 11500,
  '15': 13000,
  '16': 15000,
  '17': 18000,
  '18': 20000,
  '19': 22000,
  '20': 25000,
  '21': 33000,
  '22': 41000,
  '23': 50000,
  '24': 62000,
  '25': 75000,
  '26': 90000,
  '27': 105000,
  '28': 120000,
  '29': 135000,
  '30': 155000,
};

export function crToXp(cr: number | null | undefined): number {
  if (cr == null) return 0;
  return CR_XP[String(cr)] ?? 0;
}

/** Per-character XP thresholds by level: [easy, medium, hard, deadly]. */
export const THRESHOLDS: Record<number, [number, number, number, number]> = {
  1: [25, 50, 75, 100],
  2: [50, 100, 150, 200],
  3: [75, 150, 225, 400],
  4: [125, 250, 375, 500],
  5: [250, 500, 750, 1100],
  6: [300, 600, 900, 1400],
  7: [350, 750, 1100, 1700],
  8: [450, 900, 1400, 2100],
  9: [550, 1100, 1600, 2400],
  10: [600, 1200, 1900, 2800],
  11: [800, 1600, 2400, 3600],
  12: [1000, 2000, 3000, 4500],
  13: [1100, 2200, 3400, 5100],
  14: [1250, 2500, 3800, 5700],
  15: [1400, 2800, 4300, 6400],
  16: [1600, 3200, 4800, 7200],
  17: [2000, 3900, 5900, 8800],
  18: [2100, 4200, 6300, 9500],
  19: [2400, 4900, 7300, 10900],
  20: [2800, 5700, 8500, 12700],
};

/** Encounter multiplier by number of monsters (DMG). */
export function encounterMultiplier(count: number): number {
  if (count <= 1) return 1;
  if (count === 2) return 1.5;
  if (count <= 6) return 2;
  if (count <= 10) return 2.5;
  if (count <= 14) return 3;
  return 4;
}

export type Difficulty = 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly';

/** Party = array of character levels. Returns thresholds + the encounter's rating. */
export function rateEncounter(
  partyLevels: number[],
  monsterXps: number[],
): { thresholds: [number, number, number, number]; adjustedXp: number; difficulty: Difficulty } {
  const sum: [number, number, number, number] = [0, 0, 0, 0];
  for (const lvl of partyLevels) {
    const t = THRESHOLDS[Math.min(Math.max(Math.round(lvl), 1), 20)];
    for (let i = 0; i < 4; i++) sum[i] += t[i];
  }
  const raw = monsterXps.reduce((a, b) => a + b, 0);
  const adjustedXp = Math.round(raw * encounterMultiplier(monsterXps.length));
  let difficulty: Difficulty = 'trivial';
  if (adjustedXp >= sum[3]) difficulty = 'deadly';
  else if (adjustedXp >= sum[2]) difficulty = 'hard';
  else if (adjustedXp >= sum[1]) difficulty = 'medium';
  else if (adjustedXp >= sum[0]) difficulty = 'easy';
  return { thresholds: sum, adjustedXp, difficulty };
}
