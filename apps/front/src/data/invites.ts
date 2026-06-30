import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../lib/api';
import { qk } from '../lib/queryKeys';

export interface InvitePreview {
  campaignName: string;
  role: string;
  inviterName: string;
}

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: qk.invitePreview(token),
    queryFn: () => apiGet<InvitePreview>(`/api/invites/${token}`),
    enabled: !!token,
    retry: false,
  });
}

export function useAcceptInvite(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ campaignId: string }>(`/api/invites/${token}/accept`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.campaigns() }),
  });
}
