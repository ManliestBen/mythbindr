import { z } from 'zod';
import { baseElementCreate, type ElementSchemaSet } from './base';

// Quest fields (§5.8): the lure, who gives it, objectives, and what it pays.
const questData = z.object({
  status: z.enum(['rumored', 'active', 'completed', 'failed']).optional(),
  hook: z.string().max(500).optional(),
  giver: z.string().max(120).optional(),
  objectives: z.string().max(4000).optional(), // one per line; leading "x " marks done
  xp: z.coerce.number().min(0).max(1e7).optional(),
  gold: z.coerce.number().min(0).max(1e9).optional(),
  rewards: z.string().max(2000).optional(),
  consequences: z.string().max(2000).optional(), // branching / "if the players…" notes
});

export const questSchemas: ElementSchemaSet = {
  create: baseElementCreate.extend({
    type: z.literal('quest'),
    data: questData.optional().default({}),
  }),
  update: baseElementCreate.partial().extend({ data: questData.optional() }),
};
