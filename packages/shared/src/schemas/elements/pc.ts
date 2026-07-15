import { z } from 'zod';
import { baseElementCreate, type ElementSchemaSet } from './base';

// Player character fields (§5.9): the table-facing numbers a GM needs at a
// glance (AC, HP, passive perception) plus the story hooks worth weaponizing.
const pcData = z.object({
  playerName: z.string().max(120).optional(),
  race: z.string().max(80).optional(),
  klass: z.string().max(80).optional(), // class + subclass; `class` is reserved
  level: z.coerce.number().int().min(1).max(20).optional(),
  ac: z.coerce.number().int().min(1).max(40).optional(),
  hpMax: z.coerce.number().int().min(1).max(999).optional(),
  passivePerception: z.coerce.number().int().min(1).max(40).optional(),
  flawsBonds: z.string().max(2000).optional(),
  backstoryHooks: z.string().max(4000).optional(),
});

export const pcSchemas: ElementSchemaSet = {
  create: baseElementCreate.extend({
    type: z.literal('pc'),
    data: pcData.optional().default({}),
  }),
  update: baseElementCreate.partial().extend({ data: pcData.optional() }),
};
