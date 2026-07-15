import type { Combatant, LogEntry } from '@mythbindr/shared';
import type { SessionDoc } from '../models/Session';
import { publicSession } from '../models/Session';
import { getIO } from './io';
import type { SessionRoom } from './sessionState';

export function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}

type WireSession = {
  id: string;
  status: 'active' | 'ended';
  sourceEncounterId: string | null;
  round: number;
  turnIndex: number;
  combatants: Combatant[];
  log: LogEntry[];
  startedAt: string | Date;
  endedAt: string | Date | null;
};

/**
 * Broadcast a full session snapshot built straight from a Mongo document —
 * used when no live room exists yet (e.g. `POST /session`'s start, before any
 * socket has joined). No room owns a seq counter at that point, so this
 * always emits `seq: 0`; once a client `session:join`s, `joinSessionRoom`
 * hydrates a room and `broadcastRoomState` takes over seq ownership from
 * there. No-ops when the socket server isn't initialized (tests/scripts).
 */
export function broadcastSessionState(s: SessionDoc): void {
  const io = getIO();
  if (!io) return;
  const sessionId = String(s._id);
  io.to(sessionRoom(sessionId)).emit('session:state', {
    sessionId,
    seq: 0,
    // publicSession()'s log[].at is a mongoose Date at the type level; Socket.IO
    // serializes it to an ISO string on the wire same as JSON.stringify would,
    // matching LogEntry.at's string|number type — the cast reconciles the two
    // without a runtime remap.
    session: publicSession(s) as unknown as WireSession,
  });
}

/**
 * Build the REST/wire "public session" shape straight from a live room's held
 * state — the room-backed equivalent of `publicSession()`. Shared by
 * `roomStatePayload` (the socket event) and `sessions/routes.ts`'s
 * PATCH-through-room path (Step 6) so both return byte-identical shapes.
 */
export function roomToPublicSession(room: SessionRoom): WireSession {
  return {
    id: room.state.id,
    status: room.state.status,
    sourceEncounterId: room.meta.sourceEncounterId,
    round: room.state.round,
    turnIndex: room.state.turnIndex,
    combatants: room.state.combatants,
    log: room.state.log,
    startedAt: room.meta.startedAt,
    endedAt: room.state.status === 'ended' ? new Date() : null,
  };
}

/**
 * Build the `session:state` payload from a live room's held state — shared by
 * `broadcastRoomState` (whole room) and `io.ts`'s `session:join` (a private
 * snapshot to just the joining socket) so both stay byte-identical.
 */
export function roomStatePayload(
  sessionId: string,
  room: SessionRoom,
): { sessionId: string; seq: number; session: WireSession } {
  return { sessionId, seq: room.seq, session: roomToPublicSession(room) };
}

/**
 * Broadcast from a live room's held state (Plan 010) — used after every
 * applied operation and by the PATCH-through-room path (Step 6). Uses the
 * room's own monotonic `seq` so clients can detect a missed broadcast.
 */
export function broadcastRoomState(sessionId: string, room: SessionRoom): void {
  const io = getIO();
  if (!io) return;
  io.to(sessionRoom(sessionId)).emit('session:state', roomStatePayload(sessionId, room));
}
