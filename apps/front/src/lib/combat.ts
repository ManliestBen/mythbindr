/**
 * 5e healing: a downed creature heals from 0, not from negative HP, and
 * regaining hit points clears accumulated death saves.
 *
 * Moved to `@mythbindr/shared` (packages/shared/src/combat/reducer.ts) so the
 * server's combat reducer heals identically to the client. Re-exported here
 * so `CombatantCard.tsx` and `combat.test.ts` keep working unchanged.
 */
export { applyHeal } from '@mythbindr/shared';
