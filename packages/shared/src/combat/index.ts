// Explicit named re-exports (not `export *`): the compiled CommonJS output of
// `export *` is a runtime `__exportStar` loop that Rollup cannot statically
// analyze, which breaks the front's production build when it re-exports a
// named binding from this module. Named re-exports compile to per-name
// `Object.defineProperty(exports, ...)` calls Rollup CAN trace. Keep this
// list in sync with reducer.ts's exports.
export { applyHeal, applyOp, OpError } from './reducer';
export type { SessionOp } from './reducer';
