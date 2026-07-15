import type { Combatant, GameSessionState, LogEntry } from '../schemas/session';

/** Thrown by `applyOp` when an operation cannot be applied (bad cid, session
 *  already ended, …). The server maps this to `session:opError`; callers must
 *  not mutate state/seq when this is thrown. */
export class OpError extends Error {}

export type SessionOp =
  | { kind: 'nextTurn' }
  | { kind: 'prevTurn' }
  // + damage / − healing; tempHp absorbs first (positive only)
  | { kind: 'applyDamage'; cid: string; amount: number }
  | { kind: 'updateCombatant'; cid: string; patch: Partial<Omit<Combatant, 'cid'>> }
  | { kind: 'addCombatant'; combatant: Combatant }
  | { kind: 'removeCombatant'; cid: string }
  | { kind: 'appendLog'; entry: LogEntry }
  | { kind: 'end' };

/** Initiative order, highest first — ported verbatim from
 *  `apps/front/src/pages/RunSession.tsx`'s `sortByInit` so the server and the
 *  (still-local) client agree on turn order. */
function sortByInit(cs: Combatant[]): Combatant[] {
  return [...cs].sort((a, b) => b.initiative - a.initiative);
}

/**
 * 5e healing: a downed creature heals from 0, not from negative HP, and
 * regaining hit points clears accumulated death saves.
 *
 * Moved verbatim from `apps/front/src/lib/combat.ts` (which now re-exports
 * this) so client and server heal identically.
 */
export function applyHeal(c: Combatant, amount: number): Combatant {
  const max = c.maxHp || Math.max(c.currentHp, 0) + amount;
  const from = Math.max(c.currentHp, 0);
  const currentHp = Math.min(from + amount, max);
  const deathSaves =
    c.currentHp <= 0 && currentHp > 0 ? { successes: 0, failures: 0 } : c.deathSaves;
  return { ...c, currentHp, deathSaves };
}

/**
 * The single, pure applier of session operations. Never mutates `s` or any
 * nested object — every branch returns fresh objects — so a client can safely
 * use this for optimistic local apply (Plan 011) and trust that reconciling
 * against the server's broadcast is just a replace, never a stale-mutation
 * hazard.
 */
export function applyOp(s: GameSessionState, op: SessionOp): GameSessionState {
  if (s.status === 'ended') {
    throw new OpError('Session has ended');
  }

  switch (op.kind) {
    case 'nextTurn': {
      const ord = sortByInit(s.combatants);
      if (ord.length === 0) return s;
      let ti = s.turnIndex + 1;
      let round = s.round;
      if (ti >= ord.length) {
        ti = 0;
        round += 1;
      }
      // Tick the new current combatant's timed conditions at the start of
      // their turn, dropping any that just expired.
      const currentId = ord[ti].cid;
      const combatants = s.combatants.map((c) =>
        c.cid === currentId
          ? {
              ...c,
              conditions: c.conditions
                .map((x) => (x.rounds == null ? x : { ...x, rounds: x.rounds - 1 }))
                .filter((x) => x.rounds == null || x.rounds > 0),
            }
          : c,
      );
      const log: LogEntry[] =
        ti === 0
          ? ([
              ...s.log,
              {
                kind: 'event',
                text: `Round ${round} begins`,
                at: new Date().toISOString(),
              },
            ].slice(-500) as LogEntry[])
          : s.log;
      return { ...s, turnIndex: ti, round, combatants, log };
    }

    case 'prevTurn': {
      const ord = sortByInit(s.combatants);
      if (ord.length === 0) return s;
      if (s.turnIndex <= 0 && s.round <= 1) return s; // already at the top of round 1
      if (s.turnIndex > 0) return { ...s, turnIndex: s.turnIndex - 1 };
      return { ...s, turnIndex: ord.length - 1, round: Math.max(1, s.round - 1) };
    }

    case 'applyDamage': {
      const target = s.combatants.find((c) => c.cid === op.cid);
      if (!target) throw new OpError(`No combatant ${op.cid}`);
      let updated: Combatant;
      if (op.amount >= 0) {
        let dmg = op.amount;
        let temp = target.tempHp;
        const used = Math.min(temp, dmg);
        temp -= used;
        dmg -= used;
        updated = { ...target, tempHp: temp, currentHp: Math.max(target.currentHp - dmg, -99) };
      } else {
        updated = applyHeal(target, -op.amount);
      }
      return { ...s, combatants: s.combatants.map((c) => (c.cid === op.cid ? updated : c)) };
    }

    case 'updateCombatant': {
      if (!s.combatants.some((c) => c.cid === op.cid)) throw new OpError(`No combatant ${op.cid}`);
      const before = sortByInit(s.combatants);
      const onTurn = before.length ? before[s.turnIndex % before.length]?.cid : null;
      const combatants = s.combatants.map((c) =>
        c.cid === op.cid ? { ...c, ...op.patch } : c,
      );
      // Editing initiative re-sorts the order, which would otherwise slide the
      // turn pointer onto whoever now occupies that slot. Follow the
      // combatant whose turn it actually is.
      const after = sortByInit(combatants);
      const ti = onTurn ? after.findIndex((c) => c.cid === onTurn) : -1;
      return { ...s, combatants, turnIndex: ti >= 0 ? ti : s.turnIndex };
    }

    case 'addCombatant': {
      return { ...s, combatants: [...s.combatants, op.combatant] };
    }

    case 'removeCombatant': {
      if (!s.combatants.some((c) => c.cid === op.cid)) throw new OpError(`No combatant ${op.cid}`);
      const before = sortByInit(s.combatants);
      const onTurn = before.length ? before[s.turnIndex % before.length]?.cid : null;
      const combatants = s.combatants.filter((c) => c.cid !== op.cid);
      const after = sortByInit(combatants);
      // Follow whoever's turn it is; if THEY were removed, keep the same slot
      // (clamped) so the ring lands on the next creature in order.
      const ti = onTurn && onTurn !== op.cid ? after.findIndex((c) => c.cid === onTurn) : -1;
      const fallback = after.length ? Math.min(s.turnIndex, after.length - 1) : 0;
      return { ...s, combatants, turnIndex: ti >= 0 ? ti : fallback };
    }

    case 'appendLog': {
      return { ...s, log: [...s.log, op.entry].slice(-500) };
    }

    case 'end': {
      return { ...s, status: 'ended' };
    }

    default: {
      const exhaustive: never = op;
      throw new OpError(`Unknown op: ${JSON.stringify(exhaustive)}`);
    }
  }
}
