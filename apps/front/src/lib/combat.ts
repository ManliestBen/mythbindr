/**
 * 5e healing: a downed creature heals from 0, not from negative HP, and
 * regaining hit points clears accumulated death saves.
 *
 * Moved to `@mythbindr/shared` (packages/shared/src/combat/reducer.ts) so the
 * server's combat reducer heals identically to the client. Re-exported here
 * so `CombatantCard.tsx` and `combat.test.ts` keep working unchanged.
 */
// Re-exported from the package's `./combat` subpath rather than the root:
// Rollup cannot statically trace a named binding through the root's compiled
// CommonJS `export *` chain (index.js -> combat/index.js -> combat/reducer.js),
// but resolves it cleanly one hop from the subpath entry.
export { applyHeal } from '@mythbindr/shared/combat';
