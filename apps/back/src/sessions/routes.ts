import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { asyncHandler } from '../auth/middleware';
import { requireCampaignAccess } from '../campaigns/access';
import { validate } from '../lib/validate';
import { GameSession, publicSession, type SessionDoc } from '../models/Session';
import { Element } from '../models/Element';
import {
  sessionStartSchema,
  sessionUpdateSchema,
  type GameSessionState,
} from '@mythbindr/shared';
import { parseCombatants } from './combatants';
import { broadcastRoomState, broadcastSessionState, roomToPublicSession } from '../realtime/sessionRooms';
import { applyStateReplace, getLiveRoom } from '../realtime/sessionState';

const router = Router({ mergeParams: true });

// ── Active session (or null) ────────────────────────────────────────────────
router.get(
  '/session',
  requireCampaignAccess('viewer'),
  asyncHandler(async (req, res) => {
    const s = await GameSession.findOne({ campaignId: req.params.cid, status: 'active' })
      .sort({
        createdAt: -1,
      })
      .lean();
    res.json({ session: s ? publicSession(s as unknown as SessionDoc) : null });
  }),
);

// ── Start (returns the existing active session if there is one) ─────────────
router.post(
  '/session',
  requireCampaignAccess('editor'),
  validate(sessionStartSchema),
  asyncHandler(async (req, res) => {
    const existing = await GameSession.findOne({ campaignId: req.params.cid, status: 'active' });
    if (existing) {
      res.json({ session: publicSession(existing as SessionDoc) });
      return;
    }
    let combatants: ReturnType<typeof parseCombatants> = [];
    let sourceEncounterId: unknown = null;
    const seid = req.body?.sourceEncounterId;
    if (seid && isValidObjectId(seid)) {
      const enc = await Element.findOne({
        _id: seid,
        campaignId: req.params.cid,
        type: 'encounter',
        deletedAt: null,
      });
      if (enc) {
        sourceEncounterId = enc._id;
        combatants = parseCombatants((enc.data as { combatants?: string })?.combatants);
      }
    }
    const s = await GameSession.create({
      campaignId: req.params.cid,
      startedBy: req.session.userId,
      sourceEncounterId,
      combatants,
    });
    broadcastSessionState(s as SessionDoc);
    res.status(201).json({ session: publicSession(s as SessionDoc) });
  }),
);

// ── Replace mutable state (debounced from the client) ──────────────────────
router.patch(
  '/session/:sid',
  requireCampaignAccess('editor'),
  validate(sessionUpdateSchema),
  asyncHandler(async (req, res) => {
    if (!isValidObjectId(req.params.sid)) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    // Scope to this campaign before touching anything — the live-room lookup
    // below is keyed only by sessionId, so this guards against a PATCH under
    // the wrong campaignId reaching a room hydrated from a different one.
    const owns = await GameSession.exists({ _id: req.params.sid, campaignId: req.params.cid });
    if (!owns) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const patch: Partial<GameSessionState> = {};
    for (const k of ['round', 'turnIndex', 'combatants', 'log', 'status'] as const) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }

    // A live room (Plan 010) is the single applier of session state — apply
    // the wholesale patch through it instead of writing Mongo directly, so a
    // Slice-1 client's debounced PATCH can't race a socket-dispatched op. The
    // room's own debounced save persists it (same tradeoff as yElement.ts).
    const room = getLiveRoom(req.params.sid);
    if (room) {
      // applyStateReplace mutates `room` in place (same map entry), so `room`
      // already reflects the new state/seq once this returns.
      applyStateReplace(req.params.sid, patch);
      broadcastRoomState(req.params.sid, room);
      res.json({ session: roomToPublicSession(room) });
      return;
    }

    const $set: Record<string, unknown> = { ...patch };
    if ($set.status === 'ended') $set.endedAt = new Date();
    const s = await GameSession.findOneAndUpdate(
      { _id: req.params.sid, campaignId: req.params.cid },
      { $set },
      { new: true },
    );
    if (!s) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    broadcastSessionState(s as SessionDoc);
    res.json({ session: publicSession(s as SessionDoc) });
  }),
);

// ── End ─────────────────────────────────────────────────────────────────────
router.post(
  '/session/:sid/end',
  requireCampaignAccess('editor'),
  asyncHandler(async (req, res) => {
    if (!isValidObjectId(req.params.sid)) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const owns = await GameSession.exists({ _id: req.params.sid, campaignId: req.params.cid });
    if (!owns) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const room = getLiveRoom(req.params.sid);
    if (room) {
      applyStateReplace(req.params.sid, { status: 'ended' });
      broadcastRoomState(req.params.sid, room);
      res.json({ session: roomToPublicSession(room) });
      return;
    }

    const s = await GameSession.findOneAndUpdate(
      { _id: req.params.sid, campaignId: req.params.cid },
      { $set: { status: 'ended', endedAt: new Date() } },
      { new: true },
    );
    if (!s) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    broadcastSessionState(s as SessionDoc);
    res.json({ session: publicSession(s as SessionDoc) });
  }),
);

// ── Ended-session history ───────────────────────────────────────────────────
router.get(
  '/sessions',
  requireCampaignAccess('viewer'),
  asyncHandler(async (req, res) => {
    const list = await GameSession.find({ campaignId: req.params.cid, status: 'ended' })
      .sort({ endedAt: -1 })
      .limit(20)
      .lean();
    res.json({ sessions: list.map((s) => publicSession(s as unknown as SessionDoc)) });
  }),
);

export default router;
