import { z } from 'zod';
import { ELEMENT_TYPES } from '@mythbindr/shared';

export const aiElementSchema = z.object({
  type: z.enum(ELEMENT_TYPES),
  prompt: z.string().trim().min(1, 'A brief is required').max(2000),
});
export const aiRefineSchema = z.object({
  text: z.string().min(1).max(20_000),
  action: z.string().trim().min(1).max(200),
});
export const aiCampaignSchema = z.object({
  prompt: z.string().trim().min(1, 'A premise is required').max(2000),
});
