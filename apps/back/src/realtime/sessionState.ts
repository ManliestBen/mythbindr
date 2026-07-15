import { applyOp, OpError, type GameSessionState, type SessionOp } from '@mythbindr/shared';
import { GameSession, publicSession, type SessionDoc } from '../models/Session';

const SAVE_DEBOUNCE_MS = 2000;

/**
 * Metadata that never changes via a `SessionOp` — carried alongside the
 * reducer-owned `state` purely so a broadcast can rebuild the full
 * `SessionStatePayload` wire shape (which also carries `sourceEncounterId`/
 * `startedAt`) without re-reading Mongo on every op.
 */
export interface SessionRoomMeta {
  sourceEncounterId: string | null;
  startedAt: string | Date;
  /** Needed so the op path (`applySessionOp`/`broadcastRoomState`) can address
   *  the read-only `share:<campaignId>` room without a per-broadcast DB query —
   *  see docs/design/live-session.md ("Player view & share scope"). Empty
   *  string until hydration resolves (mirrors the empty-state placeholder
   *  below); no broadcast reaches a real client on that empty room. */
  campaignId: string;
}

/** One live in-memory game session, directly modeled on `yElement.ts`'s `Room`. */
export interface SessionRoom {
  state: GameSessionState & { id: string };
  meta: SessionRoomMeta;
  seq: number;
  dirty: boolean;
  saveTimer: ReturnType<typeof setTimeout> | null;
  /** Resolves once `state`/`meta` are hydrated from the DB. */
  ready: Promise<void>;
  sockets: Set<string>;
}

const rooms = new Map<string, SessionRoom>();

function emptyState(sessionId: string): SessionRoom['state'] {
  return { id: sessionId, round: 1, turnIndex: 0, combatants: [], log: [], status: 'active' };
}

/**
 * Join (creating if needed) a session's in-memory room. Modeled directly on
 * `yElement.ts`'s `joinRoom`: the room is registered in `rooms` synchronously,
 * before any `await`, so two concurrent joins on the same not-yet-live
 * session can't both hydrate — the second joiner sees the first's room and
 * awaits the same hydration (`room.ready`).
 */
export async function joinSessionRoom(
  sessionId: string,
  socketId: string,
): Promise<SessionRoom['state']> {
  let room = rooms.get(sessionId);
  if (!room) {
    const r: SessionRoom = {
      state: emptyState(sessionId),
      meta: { sourceEncounterId: null, startedAt: new Date(), campaignId: '' },
      seq: 0,
      dirty: false,
      saveTimer: null,
      sockets: new Set<string>(),
      ready: undefined as unknown as Promise<void>, // assigned immediately below
    };
    // Register BEFORE any await so a concurrent join reuses this room.
    rooms.set(sessionId, r);
    r.ready = (async () => {
      try {
        const doc = await GameSession.findById(sessionId);
        if (doc) {
          const pub = publicSession(doc as SessionDoc);
          r.state = {
            id: pub.id,
            round: pub.round,
            turnIndex: pub.turnIndex,
            combatants: pub.combatants,
            // publicSession()'s log[].at is a mongoose Date at the type level;
            // normalize to an ISO string here so the room's held state matches
            // LogEntry.at (string | number) for every entry, old and new alike
            // (new entries the reducer appends already use ISO strings).
            log: pub.log.map((l) => ({
              ...l,
              at: l.at instanceof Date ? l.at.toISOString() : l.at,
            })),
            status: pub.status,
          };
          r.meta = {
            sourceEncounterId: pub.sourceEncounterId,
            startedAt: pub.startedAt,
            campaignId: String(doc.campaignId),
          };
        }
      } catch (err) {
        console.error('session room hydrate error:', err);
      }
    })();
    room = r;
  }
  room.sockets.add(socketId);
  await room.ready; // every joiner waits for hydration
  return room.state;
}

/**
 * Apply one operation to a room's held state, in receipt order. `applyOp`
 * throws `OpError` (imported for callers' convenience) without mutating
 * `state`/`seq` when the operation is invalid (bad cid, session already
 * ended, …) — the exception propagates to the caller (io.ts), which maps it
 * to `session:opError`.
 */
export function applySessionOp(sessionId: string, op: SessionOp): SessionRoom['state'] {
  const room = rooms.get(sessionId);
  if (!room) throw new OpError(`No live room for session ${sessionId}`);
  const next = applyOp(room.state, op);
  room.state = { ...next, id: room.state.id };
  room.seq += 1;
  room.dirty = true;
  scheduleSave(sessionId);
  return room.state;
}

/**
 * Apply a wholesale `$set`-style patch to a room's held state without going
 * through the op reducer — used by the PATCH route (Step 6) so Slice-1
 * clients that still debounce-PATCH keep working while the room stays the
 * single applier. Mirrors `applySessionOp`'s seq/dirty/save bookkeeping.
 */
export function applyStateReplace(
  sessionId: string,
  patch: Partial<GameSessionState>,
): SessionRoom['state'] {
  const room = rooms.get(sessionId);
  if (!room) throw new OpError(`No live room for session ${sessionId}`);
  room.state = { ...room.state, ...patch };
  room.seq += 1;
  room.dirty = true;
  scheduleSave(sessionId);
  return room.state;
}

/** On last leave, flush the pending save and delete the room. */
export function leaveSessionRoom(sessionId: string, socketId: string): void {
  const room = rooms.get(sessionId);
  if (!room) return;
  room.sockets.delete(socketId);
  if (room.sockets.size === 0) void saveRoom(sessionId, true);
}

/** Exposes the live room to the REST layer (Step 6) so PATCH/end can apply
 *  through it instead of writing Mongo directly when a room is live. */
export function getLiveRoom(sessionId: string): SessionRoom | undefined {
  return rooms.get(sessionId);
}

function scheduleSave(sessionId: string): void {
  const room = rooms.get(sessionId);
  if (!room || room.saveTimer) return;
  room.saveTimer = setTimeout(() => {
    room.saveTimer = null;
    void saveRoom(sessionId, false);
  }, SAVE_DEBOUNCE_MS);
}

/** Persist the held state. In-memory state means a crashed/restarted server
 *  rehydrates from the last debounced save (<= SAVE_DEBOUNCE_MS loss) — the
 *  same tradeoff `yElement.ts` already accepts for Yjs docs. */
async function saveRoom(sessionId: string, cleanup: boolean): Promise<void> {
  const room = rooms.get(sessionId);
  if (!room) return;
  if (room.dirty) {
    room.dirty = false;
    const { round, turnIndex, combatants, log, status } = room.state;
    try {
      await GameSession.findByIdAndUpdate(sessionId, {
        $set: {
          round,
          turnIndex,
          combatants,
          log,
          status,
          ...(status === 'ended' ? { endedAt: new Date() } : {}),
        },
      });
    } catch (err) {
      console.error('session room save error:', err);
    }
  }
  if (cleanup && room.sockets.size === 0) {
    if (room.saveTimer) clearTimeout(room.saveTimer);
    rooms.delete(sessionId);
  }
}
