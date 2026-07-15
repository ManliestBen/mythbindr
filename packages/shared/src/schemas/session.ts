import { z } from 'zod';

export const conditionSchema = z.object({
  name: z.string().max(40),
  rounds: z.number().nullable().optional(),
});

export const combatantSchema = z.object({
  cid: z.string().max(64),
  name: z.string().min(1).max(120),
  initiative: z.number(),
  maxHp: z.number().min(0),
  currentHp: z.number(),
  tempHp: z.number().min(0),
  conditions: z.array(conditionSchema).max(30),
  deathSaves: z.object({
    successes: z.number().min(0).max(3),
    failures: z.number().min(0).max(3),
  }),
  isPlayer: z.boolean(),
  sourceElementId: z.string().nullable(),
  notes: z.string().max(500),
});

export const logEntrySchema = z.object({
  at: z.union([z.string(), z.number()]).optional(),
  kind: z.enum(['roll', 'note', 'event']),
  text: z.string().max(500),
  by: z.string().max(120).optional(),
});

export const sessionStartSchema = z.object({
  sourceEncounterId: z.string().optional(),
});

export const sessionUpdateSchema = z.object({
  round: z.number().int().min(1).optional(),
  turnIndex: z.number().int().min(0).optional(),
  combatants: z.array(combatantSchema).max(100).optional(),
  log: z.array(logEntrySchema).max(500).optional(),
  status: z.enum(['active', 'ended']).optional(),
});

export type Condition = z.infer<typeof conditionSchema>;
export type Combatant = z.infer<typeof combatantSchema>;
export type LogEntry = z.infer<typeof logEntrySchema>;

export interface GameSessionState {
  round: number;
  turnIndex: number;
  combatants: Combatant[];
  log: LogEntry[];
  status: 'active' | 'ended';
}
