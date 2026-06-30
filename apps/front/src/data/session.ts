import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from '../lib/api';

export interface Condition {
  name: string;
  rounds: number | null;
}

export interface Combatant {
  cid: string;
  name: string;
  initiative: number;
  maxHp: number;
  currentHp: number;
  tempHp: number;
  conditions: Condition[];
  deathSaves: { successes: number; failures: number };
  isPlayer: boolean;
  sourceElementId: string | null;
  notes: string;
}

export interface LogEntry {
  at?: string;
  kind: 'roll' | 'note' | 'event';
  text: string;
  by?: string;
}

export interface GameSessionT {
  id: string;
  status: 'active' | 'ended';
  sourceEncounterId: string | null;
  round: number;
  turnIndex: number;
  combatants: Combatant[];
  log: LogEntry[];
  startedAt: string;
  endedAt: string | null;
}

const key = (cid: string) => ['campaign', cid, 'session'];

export function useSession(cid: string) {
  return useQuery({
    queryKey: key(cid),
    queryFn: () =>
      apiGet<{ session: GameSessionT | null }>(`/api/campaigns/${cid}/session`).then(
        (r) => r.session,
      ),
    enabled: !!cid,
  });
}

export function useStartSession(cid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceEncounterId?: string) =>
      apiPost<{ session: GameSessionT }>(
        `/api/campaigns/${cid}/session`,
        sourceEncounterId ? { sourceEncounterId } : {},
      ).then((r) => r.session),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(cid) }),
  });
}

export function useUpdateSession(cid: string) {
  return useMutation({
    mutationFn: (v: { sid: string; patch: Partial<GameSessionT> }) =>
      apiPatch<{ session: GameSessionT }>(
        `/api/campaigns/${cid}/session/${v.sid}`,
        v.patch,
      ).then((r) => r.session),
  });
}

export function useEndSession(cid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sid: string) =>
      apiPost<{ session: GameSessionT }>(`/api/campaigns/${cid}/session/${sid}/end`).then(
        (r) => r.session,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(cid) }),
  });
}

export const CONDITIONS = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
];

export function newCombatant(
  name: string,
  init = 0,
  maxHp = 0,
  isPlayer = false,
): Combatant {
  return {
    cid: crypto.randomUUID(),
    name,
    initiative: init,
    maxHp,
    currentHp: maxHp,
    tempHp: 0,
    conditions: [],
    deathSaves: { successes: 0, failures: 0 },
    isPlayer,
    sourceElementId: null,
    notes: '',
  };
}
