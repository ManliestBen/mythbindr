import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Condition, Combatant, LogEntry } from '@mythbindr/shared';
import { apiGet, apiPatch, apiPost } from '../lib/api';
import { qk } from '../lib/queryKeys';

export type { Condition, Combatant, LogEntry };

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

export function useSession(cid: string) {
  return useQuery({
    queryKey: qk.session(cid),
    queryFn: () =>
      apiGet<{ session: GameSessionT | null }>(`/api/campaigns/${cid}/session`).then(
        (r) => r.session,
      ),
    enabled: !!cid,
  });
}

/** Ended sessions, newest first (backend caps at 20). */
export function useSessionHistory(cid: string) {
  return useQuery({
    queryKey: qk.sessionHistory(cid),
    queryFn: () =>
      apiGet<{ sessions: GameSessionT[] }>(`/api/campaigns/${cid}/sessions`).then(
        (r) => r.sessions,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.session(cid) }),
  });
}

/**
 * Fallback-only as of Plan 011: live edits in `RunSession` dispatch named
 * ops over the socket (`useSessionChannel`'s `dispatch`), which the server
 * applies through its held room state. This wholesale PATCH is used only
 * while the socket is disconnected (or hasn't finished (re)joining the
 * room) — see docs/design/live-session.md § Cache reconciliation.
 */
export function useUpdateSession(cid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { sid: string; patch: Partial<GameSessionT> }) =>
      apiPatch<{ session: GameSessionT }>(
        `/api/campaigns/${cid}/session/${v.sid}`,
        v.patch,
      ).then((r) => r.session),
    /**
     * Write the saved session back into the query cache. Without this the cache
     * still holds the pre-edit session, and because queries are fresh for
     * staleTime (30s) with no refetch on focus, navigating away and back
     * re-seeds the tracker from that stale snapshot — so rolls, notes and HP
     * that are safely in the database look like they were never saved.
     */
    onSuccess: (session) => qc.setQueryData(qk.session(cid), session),
  });
}

/** Fallback-only as of Plan 011: `RunSession` dispatches `session:end` over
 *  the socket when live; this REST mutation only fires when disconnected. */
export function useEndSession(cid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sid: string) =>
      apiPost<{ session: GameSessionT }>(`/api/campaigns/${cid}/session/${sid}/end`).then(
        (r) => r.session,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.session(cid) }),
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
