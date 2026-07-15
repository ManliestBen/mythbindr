import type { Server, Namespace, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ShareServerToClientEvents,
} from '@mythbindr/shared';
import { Campaign } from '../models/Campaign';
import { ShareLink, shareLinkIsLive, type ShareLinkDoc } from '../models/ShareLink';
import { GameSession, type SessionDoc } from '../models/Session';
import { sharedSession } from '../share/serialize';
import { currentSeq } from './sessionRooms';

// ── Abuse controls — named constants per docs/design/live-session.md,
// "Rate/abuse posture" (operator-confirmed placeholders, one-line tunable). ──
export const MAX_SOCKETS_PER_TOKEN = 10;
export const HANDSHAKE_COOLDOWN_MS = 2_000; // per-IP minimum spacing between handshakes

/** The `/share` namespace never registers ClientToServerEvents — there are no
 *  mutation handlers, structurally, not by permission check. */
type ShareListenEvents = Record<string, never>;
type ShareNamespaceT = Namespace<ShareListenEvents, ShareServerToClientEvents>;
type ShareSocketT = Socket<ShareListenEvents, ShareServerToClientEvents>;

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>;

export function shareRoom(campaignId: string): string {
  return `share:${campaignId}`;
}

// ── Per-IP handshake cooldown (in-memory; single-process, see maintenance
// notes in plans/012). Pruned opportunistically on every check. ─────────────
const cooldowns = new Map<string, number>();

function pruneCooldowns(now: number): void {
  for (const [ip, at] of cooldowns) {
    if (now - at >= HANDSHAKE_COOLDOWN_MS) cooldowns.delete(ip);
  }
}

/** Returns true (and records `now`) if `ip` is allowed to handshake now; false
 *  if it's within the cooldown window of its last handshake. Exported so
 *  shareNamespace.test.ts can exercise the pure map logic without a socket. */
export function checkHandshakeCooldown(ip: string, now: number = Date.now()): boolean {
  pruneCooldowns(now);
  const last = cooldowns.get(ip);
  if (last !== undefined && now - last < HANDSHAKE_COOLDOWN_MS) return false;
  cooldowns.set(ip, now);
  return true;
}

// ── Per-token connection cap + revocation-disconnect index. Sockets are
// stored directly (not just ids) so disconnectShareToken() needs no back-
// reference to the namespace — only a `.disconnect()`-shaped object. ────────
interface DisconnectableSocket {
  id: string;
  disconnect: (close?: boolean) => unknown;
}

const tokenSockets = new Map<string, Set<DisconnectableSocket>>();

/** Registers `socket` under `token` if under MAX_SOCKETS_PER_TOKEN; returns
 *  false (and does not register) if the cap is already met. */
export function registerSocket(token: string, socket: DisconnectableSocket): boolean {
  const set = tokenSockets.get(token) ?? new Set<DisconnectableSocket>();
  if (set.size >= MAX_SOCKETS_PER_TOKEN) return false;
  set.add(socket);
  tokenSockets.set(token, set);
  return true;
}

export function unregisterSocket(token: string, socket: DisconnectableSocket): void {
  const set = tokenSockets.get(token);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) tokenSockets.delete(token);
}

export function tokenSocketCount(token: string): number {
  return tokenSockets.get(token)?.size ?? 0;
}

/** Revocation must actively disconnect already-connected sockets, not just
 *  reject future joins (docs/design/live-session.md, Security considerations).
 *  Called from collab/routes.ts's DELETE /share/:linkId handler. */
export function disconnectShareToken(token: string): void {
  const set = tokenSockets.get(token);
  if (!set) return;
  for (const socket of set) socket.disconnect(true);
  tokenSockets.delete(token);
}

/** Resolves a share token to its live campaign — mirrors share/routes.ts's
 *  `resolve()`, plus the `scope === 'session'` check this namespace requires. */
async function resolveSessionShare(
  token: string,
): Promise<{ campaignId: string } | null> {
  const link = await ShareLink.findOne({ token });
  if (!link || !shareLinkIsLive(link as ShareLinkDoc) || link.scope !== 'session') return null;
  const campaign = await Campaign.findOne({ _id: link.campaignId, deletedAt: null });
  if (!campaign) return null;
  return { campaignId: String(link.campaignId) };
}

async function sendSnapshot(socket: ShareSocketT, campaignId: string): Promise<void> {
  const s = await GameSession.findOne({ campaignId, status: 'active' }).sort({ createdAt: -1 });
  if (!s) {
    socket.emit('session:none');
    return;
  }
  socket.emit('session:state', {
    seq: currentSeq(String((s as SessionDoc)._id)),
    session: sharedSession(s as SessionDoc),
  });
}

/**
 * Mounts the unauthenticated, read-only `/share` namespace. Called once from
 * `initRealtime`, after the main namespace's `io.use` and handlers are set
 * up — this namespace never touches that middleware or those handlers.
 *
 * `io.of()` is not generic in the installed socket.io version, so the
 * namespace comes back typed for the MAIN namespace's event maps; the cast
 * below re-types it for `ShareServerToClientEvents` only. This keeps the two
 * contracts structurally separate (no merge) — the cast doesn't add any
 * runtime behavior, and no ClientToServerEvents handlers are ever registered
 * on `nsp`, so there is no code path from this namespace to a mutation.
 */
export function initShareNamespace(io: IOServer): void {
  const nsp = io.of('/share') as unknown as ShareNamespaceT;

  nsp.use(async (socket, next) => {
    const ip = socket.handshake.address;
    if (!checkHandshakeCooldown(ip)) {
      next(new Error('rate limited'));
      return;
    }

    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) {
      next(new Error('unauthorized'));
      return;
    }

    const resolved = await resolveSessionShare(token);
    if (!resolved) {
      next(new Error('unauthorized'));
      return;
    }

    if (!registerSocket(token, socket)) {
      next(new Error('too many connections'));
      return;
    }

    socket.data.campaignId = resolved.campaignId;
    socket.data.token = token;
    next();
  });

  nsp.on('connection', (socket) => {
    const campaignId = socket.data.campaignId as string;
    void socket.join(shareRoom(campaignId));
    void sendSnapshot(socket, campaignId);

    socket.on('disconnect', () => {
      const token = socket.data.token as string | undefined;
      if (token) unregisterSocket(token, socket);
    });
  });
}

/** Parallel filtered emit for `broadcastSessionState` (sessionRooms.ts) — the
 *  authenticated broadcast and this one both fire from the same write, but
 *  this one goes to the read-only share room with the whitelisted payload. */
export function broadcastToShareRoom(
  io: IOServer,
  campaignId: string,
  seq: number,
  s: SessionDoc,
): void {
  const nsp = io.of('/share') as unknown as ShareNamespaceT;
  nsp.to(shareRoom(campaignId)).emit('session:state', { seq, session: sharedSession(s) });
}
