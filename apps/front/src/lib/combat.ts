import type { Combatant } from '../data/session';

/**
 * 5e healing: a downed creature heals from 0, not from negative HP, and
 * regaining hit points clears accumulated death saves.
 */
export function applyHeal(c: Combatant, amount: number): Combatant {
  const max = c.maxHp || Math.max(c.currentHp, 0) + amount;
  const from = Math.max(c.currentHp, 0);
  const currentHp = Math.min(from + amount, max);
  const deathSaves =
    c.currentHp <= 0 && currentHp > 0 ? { successes: 0, failures: 0 } : c.deathSaves;
  return { ...c, currentHp, deathSaves };
}
