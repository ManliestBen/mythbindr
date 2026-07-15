import { Router } from 'express';
import mongoose from 'mongoose';
import { Campaign, publicCampaign, type CampaignDoc } from '../models/Campaign';
import { Element } from '../models/Element';
import { Membership } from '../models/Membership';
import { asyncHandler, requireAuth } from '../auth/middleware';
import { validate } from '../lib/validate';
import { ELEMENT_TYPES, campaignCreateSchema, campaignUpdateSchema } from '@mythbindr/shared';
import { requireCampaignAccess } from './access';
import { exportJson, exportMarkdown } from '../share/exportCampaign';
import type { ElementDoc } from '../models/Element';

const router = Router();

// Every campaign route requires a logged-in user.
router.use(requireAuth);

// ── List my campaigns (via membership) ─────────────────────────────────────
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const memberships = await Membership.find({ userId: req.session.userId });
    const ids = memberships.map((m) => m.campaignId);
    const campaigns = await Campaign.find({ _id: { $in: ids }, deletedAt: null }).sort({
      updatedAt: -1,
    });
    res.json({ campaigns: campaigns.map((c) => publicCampaign(c as CampaignDoc)) });
  }),
);

// ── Create (creator becomes owner) ─────────────────────────────────────────
router.post(
  '/',
  validate(campaignCreateSchema),
  asyncHandler(async (req, res) => {
    const campaign = await Campaign.create({
      ...req.body,
      ownerId: req.session.userId,
      updatedBy: req.session.userId,
    });
    await Membership.create({
      campaignId: campaign._id,
      userId: req.session.userId,
      role: 'owner',
    });
    res.status(201).json({ campaign: publicCampaign(campaign as CampaignDoc) });
  }),
);

// ── Read one ───────────────────────────────────────────────────────────────
router.get('/:cid', requireCampaignAccess('viewer'), (req, res) => {
  res.json({ campaign: publicCampaign(req.campaign as CampaignDoc) });
});

// ── Update ─────────────────────────────────────────────────────────────────
router.patch(
  '/:cid',
  requireCampaignAccess('editor'),
  validate(campaignUpdateSchema),
  asyncHandler(async (req, res) => {
    const updated = await Campaign.findByIdAndUpdate(
      req.params.cid,
      { $set: { ...req.body, updatedBy: req.session.userId }, $inc: { version: 1 } },
      { new: true },
    );
    res.json({ campaign: updated ? publicCampaign(updated as CampaignDoc) : null });
  }),
);

// ── Soft-delete to trash ───────────────────────────────────────────────────
router.delete(
  '/:cid',
  requireCampaignAccess('owner'),
  asyncHandler(async (req, res) => {
    await Campaign.findByIdAndUpdate(req.params.cid, { $set: { deletedAt: new Date() } });
    res.json({ ok: true });
  }),
);

// ── Restore from trash ─────────────────────────────────────────────────────
router.post(
  '/:cid/restore',
  requireCampaignAccess('owner', { allowDeleted: true }),
  asyncHandler(async (req, res) => {
    const updated = await Campaign.findByIdAndUpdate(
      req.params.cid,
      { $set: { deletedAt: null } },
      { new: true },
    );
    res.json({ campaign: updated ? publicCampaign(updated as CampaignDoc) : null });
  }),
);

// ── Duplicate as a template (campaign fields only; elements copied later) ───
router.post(
  '/:cid/duplicate',
  requireCampaignAccess('viewer'),
  asyncHandler(async (req, res) => {
    const src = req.campaign as CampaignDoc;
    const copy = await Campaign.create({
      name: `${src.name} (Copy)`,
      hook: src.hook,
      premise: src.premise,
      tone: src.tone,
      startLevel: src.startLevel,
      endLevel: src.endLevel,
      settingName: src.settingName,
      storySoFar: src.storySoFar,
      moodSlots: src.moodSlots,
      ownerId: req.session.userId,
      updatedBy: req.session.userId,
    });
    await Membership.create({
      campaignId: copy._id,
      userId: req.session.userId,
      role: 'owner',
    });
    res.status(201).json({ campaign: publicCampaign(copy as CampaignDoc) });
  }),
);

// ── Dashboard: element counts by type + recent edits + story-so-far ────────
router.get(
  '/:cid/dashboard',
  requireCampaignAccess('viewer'),
  asyncHandler(async (req, res) => {
    const cid = req.params.cid;
    const grouped = await Element.aggregate<{ _id: string; count: number }>([
      { $match: { campaignId: new mongoose.Types.ObjectId(cid), deletedAt: null } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]);
    const counts: Record<string, number> = {};
    for (const g of grouped) counts[g._id] = g.count;

    const recent = await Element.find({ campaignId: cid, deletedAt: null })
      .sort({ updatedAt: -1 })
      .limit(8)
      .select('type name updatedAt');

    res.json({
      counts,
      recent: recent.map((r) => ({
        id: String(r._id),
        type: r.type,
        name: r.name,
        updatedAt: r.updatedAt,
      })),
      storySoFar: (req.campaign as CampaignDoc).storySoFar,
    });
  }),
);

// ── Import a previously exported campaign (round-trips the JSON export) ────
router.post(
  '/import',
  asyncHandler(async (req, res) => {
    const payload = req.body as {
      format?: string;
      campaign?: Record<string, unknown>;
      elements?: Record<string, unknown>[];
    };
    if (payload?.format !== 'mythbindr-campaign' || !payload.campaign) {
      res.status(400).json({ error: 'Not a MythBindr campaign export' });
      return;
    }
    const src = payload.campaign;
    const campaign = await Campaign.create({
      name: String(src.name ?? 'Imported campaign').slice(0, 120),
      hook: String(src.hook ?? '').slice(0, 280),
      premise: src.premise,
      tone: Array.isArray(src.tone) ? src.tone : [],
      startLevel: Number(src.startLevel) || 1,
      endLevel: Number(src.endLevel) || 20,
      settingName: String(src.settingName ?? '').slice(0, 120),
      storySoFar: String(src.storySoFar ?? '').slice(0, 20000),
      moodSlots: Array.isArray(src.moodSlots) ? src.moodSlots : [],
      ownerId: req.session.userId,
      updatedBy: req.session.userId,
    });
    await Membership.create({
      campaignId: campaign._id,
      userId: req.session.userId,
      role: 'owner',
    });

    const srcElements = (payload.elements ?? []).filter(
      (e) =>
        e &&
        typeof e.name === 'string' &&
        (ELEMENT_TYPES as readonly string[]).includes(e.type as string),
    );
    // Pre-assign new ids so cross-element links and @mentions can be remapped.
    const idMap = new Map<string, mongoose.Types.ObjectId>();
    for (const e of srcElements) {
      if (typeof e.id === 'string') idMap.set(e.id, new mongoose.Types.ObjectId());
    }
    const remapIds = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(remapIds);
      if (node && typeof node === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
          out[k] =
            typeof v === 'string' && idMap.has(v) ? String(idMap.get(v)) : remapIds(v);
        }
        return out;
      }
      return node;
    };

    const { deriveBodyText } = await import('../elements/bodyText');
    const docs = srcElements.map((e) => {
      const body = remapIds(e.body);
      const links = Array.isArray(e.links)
        ? (e.links as { targetId?: string; relType?: string; source?: string }[])
            .filter((l) => l.targetId && idMap.has(l.targetId))
            .map((l) => ({
              targetId: idMap.get(l.targetId as string),
              relType: String(l.relType ?? ''),
              source: l.source === 'mention' ? 'mention' : 'relationship',
            }))
        : [];
      return {
        _id: typeof e.id === 'string' ? idMap.get(e.id) : new mongoose.Types.ObjectId(),
        campaignId: campaign._id,
        type: e.type,
        name: String(e.name).slice(0, 200),
        body,
        bodyText: deriveBodyText(body),
        tags: Array.isArray(e.tags) ? e.tags : [],
        links,
        data: e.data && typeof e.data === 'object' ? e.data : {},
        playerVisible: Boolean(e.playerVisible),
        secrets: String(e.secrets ?? ''),
        updatedBy: req.session.userId,
      };
    });
    if (docs.length) await Element.insertMany(docs);

    res.status(201).json({
      campaign: publicCampaign(campaign as CampaignDoc),
      elementCount: docs.length,
    });
  }),
);

// ── Export: full-fidelity JSON or a readable Markdown prep packet ──────────
router.get(
  '/:cid/export',
  requireCampaignAccess('viewer'),
  asyncHandler(async (req, res) => {
    const campaign = req.campaign as CampaignDoc;
    const elements = (await Element.find({
      campaignId: req.params.cid,
      deletedAt: null,
    }).sort({ type: 1, name: 1 })) as unknown as ElementDoc[];

    const slug = campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campaign';
    const stamp = new Date().toISOString().slice(0, 10);

    if (req.query.format === 'markdown') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${slug}-${stamp}.md"`);
      res.send(exportMarkdown(campaign, elements));
      return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}-${stamp}.json"`);
    res.send(JSON.stringify(exportJson(campaign, elements), null, 2));
  }),
);

// ── Global search (text index on name + bodyText; type/tag filters) ────────
router.get(
  '/:cid/search',
  requireCampaignAccess('viewer'),
  asyncHandler(async (req, res) => {
    const { q, type, tag } = req.query as Record<string, string | undefined>;
    const filter: Record<string, unknown> = { campaignId: req.params.cid, deletedAt: null };
    if (type) filter.type = type;
    if (tag) filter.tags = tag;
    if (q) filter.$text = { $search: q };

    const query = Element.find(
      filter,
      q ? { score: { $meta: 'textScore' } } : undefined,
    ).limit(50);
    query.sort(q ? { score: { $meta: 'textScore' } } : { updatedAt: -1 });
    const els = await query;

    res.json({
      results: els.map((e) => ({ id: String(e._id), type: e.type, name: e.name })),
    });
  }),
);

export default router;
