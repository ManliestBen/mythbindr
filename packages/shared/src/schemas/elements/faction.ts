import { z } from 'zod';
import { baseElementCreate, type ElementSchemaSet } from './base';

// Faction fields (§5.9): goals, leadership, and reach. The secret agenda lives
// in the shared GM-secrets field so it can never publish to the share view.
const factionData = z.object({
  goals: z.string().max(2000).optional(),
  leader: z.string().max(120).optional(),
  headquarters: z.string().max(120).optional(),
  influence: z.enum(['unknown', 'minor', 'established', 'powerful', 'dominant']).optional(),
  members: z.string().max(2000).optional(),
  alliesEnemies: z.string().max(2000).optional(),
});

export const factionSchemas: ElementSchemaSet = {
  create: baseElementCreate.extend({
    type: z.literal('faction'),
    data: factionData.optional().default({}),
  }),
  update: baseElementCreate.partial().extend({ data: factionData.optional() }),
};
