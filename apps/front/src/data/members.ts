import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';
import { qk } from '../lib/queryKeys';

export type Role = 'owner' | 'editor' | 'viewer';

export interface Member {
  userId: string;
  displayName: string;
  role: Role;
}

export interface Invite {
  id: string;
  token: string;
  role: 'editor' | 'viewer';
  url: string;
  expiresAt: string;
}

export function useMembers(cid: string) {
  return useQuery({
    queryKey: qk.members(cid),
    queryFn: () =>
      apiGet<{ members: Member[] }>(`/api/campaigns/${cid}/members`).then((r) => r.members),
    enabled: !!cid,
  });
}

export function useInvites(cid: string) {
  return useQuery({
    queryKey: qk.invites(cid),
    queryFn: () =>
      apiGet<{ invites: Invite[] }>(`/api/campaigns/${cid}/invites`).then((r) => r.invites),
    enabled: !!cid,
  });
}

export function useCreateInvite(cid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role: 'editor' | 'viewer') =>
      apiPost<{ invite: Invite }>(`/api/campaigns/${cid}/invites`, { role }).then(
        (r) => r.invite,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.invites(cid) }),
  });
}

export function useRevokeInvite(cid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/campaigns/${cid}/invites/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.invites(cid) }),
  });
}

export function useChangeRole(cid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; role: Role }) =>
      apiPatch(`/api/campaigns/${cid}/members/${v.userId}`, { role: v.role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.members(cid) }),
  });
}

export function useRemoveMember(cid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiDelete(`/api/campaigns/${cid}/members/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.members(cid) }),
  });
}
