import type { SessionDoc } from '../models/Session';
import { publicSession } from '../models/Session';
import { getIO } from './io';
import { broadcastToShareRoom } from './shareNamespace';

const seqs = new Map<string, number>();

export function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}

/** Broadcast the full session snapshot to its room. Call after every successful
 *  session write. No-ops when the socket server isn't initialized (tests/scripts). */
export function broadcastSessionState(s: SessionDoc): void {
  const io = getIO();
  if (!io) return;
  const sessionId = String(s._id);
  const seq = (seqs.get(sessionId) ?? 0) + 1;
  seqs.set(sessionId, seq);
  io.to(sessionRoom(sessionId)).emit('session:state', {
    sessionId,
    seq,
    // publicSession()'s combatants/log are concretely typed; the shared contract
    // types them loosely (`unknown[]`) until Plan 010 moves Combatant into shared.
    session: publicSession(s) as unknown as {
      id: string;
      status: 'active' | 'ended';
      sourceEncounterId: string | null;
      round: number;
      turnIndex: number;
      combatants: unknown[];
      log: unknown[];
      startedAt: string | Date;
      endedAt: string | Date | null;
    },
  });
  // Parallel filtered fan-out to the read-only /share room for this campaign —
  // see docs/design/live-session.md ("Player view & share scope"). Additive:
  // does not change the authenticated emit above.
  broadcastToShareRoom(io, String(s.campaignId), seq, s);
  if (s.status === 'ended') seqs.delete(sessionId); // room is terminal; free the counter
}

/** Current seq (for the initial snapshot a joiner receives). */
export function currentSeq(sessionId: string): number {
  return seqs.get(sessionId) ?? 0;
}
