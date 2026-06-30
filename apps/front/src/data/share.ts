import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '../lib/api';

// ── Public (player) side ─────────────────────────────────────────────────
export interface ShareElement {
  id: string;
  type: string;
  name: string;
  body: unknown;
  tags: string[];
  data: Record<string, unknown>;
}

export function useShareCampaign(token: string) {
  return useQuery({
    queryKey: ['share', token],
    queryFn: () =>
      apiGet<{ campaign: { name: string }; valid: boolean }>(`/api/share/${token}`),
    enabled: !!token,
    retry: false,
  });
}

export function useShareElements(token: string) {
  return useQuery({
    queryKey: ['share', token, 'elements'],
    queryFn: () =>
      apiGet<{ elements: ShareElement[] }>(`/api/share/${token}/elements`).then(
        (r) => r.elements,
      ),
    enabled: !!token,
    retry: false,
  });
}

// ── Owner side (manage links) ────────────────────────────────────────────
export interface ShareLinkT {
  id: string;
  token: string;
  url: string;
  createdAt: string;
}

export function useShareLinks(cid: string) {
  return useQuery({
    queryKey: ['campaign', cid, 'sharelinks'],
    queryFn: () =>
      apiGet<{ links: ShareLinkT[] }>(`/api/campaigns/${cid}/share`).then((r) => r.links),
    enabled: !!cid,
  });
}

export function useCreateShareLink(cid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<{ link: ShareLinkT }>(`/api/campaigns/${cid}/share`).then((r) => r.link),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', cid, 'sharelinks'] }),
  });
}

export function useRevokeShareLink(cid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/campaigns/${cid}/share/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', cid, 'sharelinks'] }),
  });
}
