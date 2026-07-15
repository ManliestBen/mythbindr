import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { isValidObjectId } from 'mongoose';
import {
  toU8,
  OpError,
  type Participant,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type LogEntry,
  type SessionOp,
  type NextTurnOp,
  type PrevTurnOp,
  type ApplyDamageOp,
  type UpdateCombatantOp,
  type AddCombatantOp,
  type RemoveCombatantOp,
  type AppendLogOp,
  type EndSessionOp,
} from '@mythbindr/shared';
import { env } from '../lib/env';
import { createSessionMiddleware } from '../lib/session';
import { Element } from '../models/Element';
import { Membership, type MembershipRole } from '../models/Membership';
import { User } from '../models/User';
import { GameSession } from '../models/Session';
import { roleAtLeast } from '../campaigns/access';
import { applyUpdate, joinRoom, leaveRoom } from './yElement';
import { broadcastRoomState, roomStatePayload, sessionRoom as sessionRoomName } from './sessionRooms';
import {
  applySessionOp,
  getLiveRoom,
  joinSessionRoom,
  leaveSessionRoom,
} from './sessionState';

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>;

interface SessionReq {
  session?: { userId?: string };
}

let io: IOServer | null = null;

export function getIO(): IOServer | null {
  return io;
}

export function initRealtime(server: HttpServer): IOServer {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: { origin: env.clientOrigin, credentials: true },
  });

  // Reuse the exact express-session middleware so sockets share the web session.
  const sessionMw = createSessionMiddleware();
  io.engine.use((req: unknown, res: unknown, next: () => void) =>
    (sessionMw as (a: unknown, b: unknown, c: () => void) => void)(req, res, next),
  );

  io.use((socket, next) => {
    const userId = (socket.request as unknown as SessionReq).session?.userId;
    if (!userId) {
      next(new Error('unauthorized'));
      return;
    }
    next();
  });

  io.on('connection', (socket) => {
    const userId = (socket.request as unknown as SessionReq).session!.userId!;

    socket.on('element:join', async ({ elementId }: { elementId: string }) => {
      if (!(await canAccessElement(userId, elementId, 'viewer'))) return;
      const room = `el:${elementId}`;
      socket.data.userId = userId;
      socket.data.displayName = await userName(userId);
      socket.data.room = room;
      await socket.join(room);
      await emitPresence(room);
    });

    socket.on('element:leave', async ({ elementId }: { elementId: string }) => {
      const room = `el:${elementId}`;
      await socket.leave(room);
      await emitPresence(room);
    });

    // ── Session live-state room (Plan 010: server-authoritative state) ─────
    const sessionRoomIds = new Set<string>();

    /**
     * Apply one op through the live room and broadcast the result, or emit
     * `session:opError` on rejection (bad cid, session already ended, …).
     * Rejection messages are kept generic — never echo the attempted payload
     * back — per the design doc's security notes.
     */
    async function applyAndBroadcast(sessionId: string, op: SessionOp): Promise<void> {
      try {
        applySessionOp(sessionId, op);
      } catch (err) {
        if (err instanceof OpError) {
          console.error(`session op rejected (session ${sessionId}, ${op.kind}):`, err.message);
          socket.emit('session:opError', { sessionId, message: 'Could not apply that change' });
          return;
        }
        throw err;
      }
      const room = getLiveRoom(sessionId);
      if (room) broadcastRoomState(sessionId, room);
    }

    socket.on('session:join', async ({ sessionId }: { sessionId: string }) => {
      if (!(await canAccessSession(userId, sessionId, 'viewer'))) return;
      socket.data.displayName = socket.data.displayName ?? (await userName(userId));
      await socket.join(sessionRoomName(sessionId));
      sessionRoomIds.add(sessionId);
      await joinSessionRoom(sessionId, socket.id);
      // Fresh joiners get an immediate private snapshot so they don't wait for
      // the next broadcast.
      const room = getLiveRoom(sessionId);
      if (room) socket.emit('session:state', roomStatePayload(sessionId, room));
    });

    socket.on('session:leave', ({ sessionId }: { sessionId: string }) => {
      sessionRoomIds.delete(sessionId);
      void socket.leave(sessionRoomName(sessionId));
      leaveSessionRoom(sessionId, socket.id);
    });

    socket.on('session:nextTurn', async ({ sessionId }: NextTurnOp) => {
      if (!(await canAccessSession(userId, sessionId, 'editor'))) return;
      await applyAndBroadcast(sessionId, { kind: 'nextTurn' });
    });

    socket.on('session:prevTurn', async ({ sessionId }: PrevTurnOp) => {
      if (!(await canAccessSession(userId, sessionId, 'editor'))) return;
      await applyAndBroadcast(sessionId, { kind: 'prevTurn' });
    });

    socket.on('session:applyDamage', async ({ sessionId, cid, amount }: ApplyDamageOp) => {
      if (!(await canAccessSession(userId, sessionId, 'editor'))) return;
      await applyAndBroadcast(sessionId, { kind: 'applyDamage', cid, amount });
    });

    socket.on(
      'session:updateCombatant',
      async ({ sessionId, cid, patch }: UpdateCombatantOp) => {
        if (!(await canAccessSession(userId, sessionId, 'editor'))) return;
        await applyAndBroadcast(sessionId, { kind: 'updateCombatant', cid, patch });
      },
    );

    socket.on('session:addCombatant', async ({ sessionId, combatant }: AddCombatantOp) => {
      if (!(await canAccessSession(userId, sessionId, 'editor'))) return;
      await applyAndBroadcast(sessionId, { kind: 'addCombatant', combatant });
    });

    socket.on('session:removeCombatant', async ({ sessionId, cid }: RemoveCombatantOp) => {
      if (!(await canAccessSession(userId, sessionId, 'editor'))) return;
      await applyAndBroadcast(sessionId, { kind: 'removeCombatant', cid });
    });

    socket.on('session:appendLog', async ({ sessionId, kind, text }: AppendLogOp) => {
      if (!(await canAccessSession(userId, sessionId, 'editor'))) return;
      const entry: LogEntry = {
        kind,
        text,
        at: new Date().toISOString(),
        by: socket.data.displayName as string | undefined,
      };
      await applyAndBroadcast(sessionId, { kind: 'appendLog', entry });
    });

    socket.on('session:end', async ({ sessionId }: EndSessionOp) => {
      if (!(await canAccessSession(userId, sessionId, 'editor'))) return;
      await applyAndBroadcast(sessionId, { kind: 'end' });
    });

    // ── Yjs CRDT co-editing (editor-only) ──────────────────────────────────
    const yrooms = new Set<string>();

    socket.on('yjs:join', async ({ elementId }: { elementId: string }) => {
      if (!(await canAccessElement(userId, elementId, 'editor'))) return;
      await socket.join(`y:${elementId}`);
      yrooms.add(elementId);
      const { state, seedFrom } = await joinRoom(elementId, socket.id);
      socket.emit('yjs:init', { elementId, state, seedFrom });
    });

    socket.on('yjs:update', ({ elementId, update }: { elementId: string; update: unknown }) => {
      if (!yrooms.has(elementId)) return;
      const u = toU8(update);
      applyUpdate(elementId, u);
      socket.to(`y:${elementId}`).emit('yjs:update', { elementId, update: u });
    });

    socket.on('yjs:awareness', ({ elementId, update }: { elementId: string; update: unknown }) => {
      if (!yrooms.has(elementId)) return;
      socket.to(`y:${elementId}`).emit('yjs:awareness', { elementId, update: toU8(update) });
    });

    socket.on('yjs:leave', ({ elementId }: { elementId: string }) => {
      yrooms.delete(elementId);
      void socket.leave(`y:${elementId}`);
      leaveRoom(elementId, socket.id);
    });

    socket.on('disconnect', async () => {
      for (const elementId of yrooms) leaveRoom(elementId, socket.id);
      for (const sessionId of sessionRoomIds) leaveSessionRoom(sessionId, socket.id);
      const room = socket.data.room as string | undefined;
      if (room) await emitPresence(room);
    });
  });

  return io;
}

/** Broadcast the unique set of participants (by user) in a room. */
async function emitPresence(room: string): Promise<void> {
  if (!io) return;
  const sockets = await io.in(room).fetchSockets();
  const byUser = new Map<string, string>();
  for (const s of sockets) {
    const uid = s.data.userId as string | undefined;
    if (uid) byUser.set(uid, (s.data.displayName as string) ?? 'GM');
  }
  const participants: Participant[] = [...byUser.entries()].map(([userId, displayName]) => ({
    userId,
    displayName,
  }));
  io.to(room).emit('presence', { participants });
}

async function canAccessElement(
  userId: string,
  elementId: string,
  min: MembershipRole,
): Promise<boolean> {
  if (!isValidObjectId(elementId)) return false;
  const el = await Element.findById(elementId).select('campaignId');
  if (!el) return false;
  const m = await Membership.findOne({ campaignId: el.campaignId, userId });
  return !!m && roleAtLeast(m.role as MembershipRole, min);
}

async function canAccessSession(
  userId: string,
  sessionId: string,
  min: MembershipRole,
): Promise<boolean> {
  if (!isValidObjectId(sessionId)) return false;
  const s = await GameSession.findById(sessionId).select('campaignId');
  if (!s) return false;
  const m = await Membership.findOne({ campaignId: s.campaignId, userId });
  return !!m && roleAtLeast(m.role as MembershipRole, min);
}

async function userName(userId: string): Promise<string> {
  const u = await User.findById(userId).select('displayName');
  return u?.displayName ?? 'GM';
}
