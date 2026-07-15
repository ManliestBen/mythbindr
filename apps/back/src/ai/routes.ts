import { Router, type Response } from 'express';
import type { z } from 'zod';
import { asyncHandler, requireAdmin, requireAuth } from '../auth/middleware';
import { requireCampaignAccess } from '../campaigns/access';
import { validate } from '../lib/validate';
import { contentGenerator } from './generator';
import { aiCampaignSchema, aiElementSchema, aiRefineSchema } from './schemas';
import { ELEMENT_TYPES } from '@mythbindr/shared';
import { Campaign, publicCampaign, type CampaignDoc } from '../models/Campaign';
import { Membership } from '../models/Membership';
import { Element } from '../models/Element';
import { deriveBodyText } from '../elements/bodyText';

function ensureConfigured(res: Response): boolean {
  if (!contentGenerator.configured()) {
    res.status(503).json({ error: 'AI is not configured on the server (set ANTHROPIC_API_KEY).' });
    return false;
  }
  return true;
}

// ── Campaign-scoped (admin + editor): generate element, refine text ────────
export const scopedAiRoutes = Router({ mergeParams: true });

scopedAiRoutes.post(
  '/element',
  requireCampaignAccess('editor'),
  requireAdmin,
  validate(aiElementSchema),
  asyncHandler(async (req, res) => {
    if (!ensureConfigured(res)) return;
    const { type, prompt } = req.body as z.infer<typeof aiElementSchema>;
    try {
      const element = await contentGenerator.generateElement({
        type,
        prompt,
        campaignName: (req.campaign as CampaignDoc | undefined)?.name,
      });
      res.json({ element });
    } catch (err) {
      console.error('AI element error:', err);
      res.status(502).json({ error: 'AI generation failed' });
    }
  }),
);

scopedAiRoutes.post(
  '/refine',
  requireCampaignAccess('editor'),
  requireAdmin,
  validate(aiRefineSchema),
  asyncHandler(async (req, res) => {
    if (!ensureConfigured(res)) return;
    const { text, action } = req.body as z.infer<typeof aiRefineSchema>;
    try {
      const refined = await contentGenerator.refineText({ text, action });
      res.json({ text: refined });
    } catch (err) {
      console.error('AI refine error:', err);
      res.status(502).json({ error: 'AI refine failed' });
    }
  }),
);

// ── Global (admin): generate a whole campaign with starter elements ────────
export const globalAiRoutes = Router();
globalAiRoutes.use(requireAuth, requireAdmin);

globalAiRoutes.post(
  '/campaign',
  validate(aiCampaignSchema),
  asyncHandler(async (req, res) => {
    if (!ensureConfigured(res)) return;
    const { prompt } = req.body as z.infer<typeof aiCampaignSchema>;
    let gen;
    try {
      gen = await contentGenerator.generateCampaign({ prompt });
    } catch (err) {
      console.error('AI campaign error:', err);
      res.status(502).json({ error: 'AI generation failed' });
      return;
    }

    const userId = req.session.userId;
    const campaign = await Campaign.create({
      name: gen.name,
      hook: gen.hook,
      premise: gen.premise,
      ownerId: userId,
      updatedBy: userId,
    });
    await Membership.create({ campaignId: campaign._id, userId, role: 'owner' });

    const docs = gen.elements
      .filter((e) => ELEMENT_TYPES.includes(e.type))
      .map((e) => ({
        campaignId: campaign._id,
        type: e.type,
        name: e.name,
        body: e.body,
        bodyText: deriveBodyText(e.body),
        tags: e.tags ?? [],
        secrets: e.secrets ?? '',
        updatedBy: userId,
      }));
    if (docs.length) await Element.insertMany(docs);

    res.status(201).json({
      campaign: publicCampaign(campaign as CampaignDoc),
      elementCount: docs.length,
    });
  }),
);
