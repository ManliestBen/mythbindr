import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';
import { qk } from '../lib/queryKeys';

export interface Campaign {
  id: string;
  name: string;
  hook: string;
  premise: unknown;
  tone: string[];
  startLevel: number;
  endLevel: number;
  settingName: string;
  storySoFar: string;
  moodSlots: { label: string; spotifyUri: string }[];
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors the backend campaign schema (src/schemas/campaign.ts). */
export const campaignFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  hook: z.string().max(280).optional(),
  settingName: z.string().max(120).optional(),
  startLevel: z.number().int().min(1).max(20),
  endLevel: z.number().int().min(1).max(20),
  storySoFar: z.string().max(20000).optional(),
});
export type CampaignFormValues = z.infer<typeof campaignFormSchema>;

export function useCampaigns() {
  return useQuery({
    queryKey: qk.campaigns(),
    queryFn: () =>
      apiGet<{ campaigns: Campaign[] }>('/api/campaigns').then((r) => r.campaigns),
  });
}

export function useCampaign(cid?: string) {
  return useQuery({
    queryKey: qk.campaign(cid ?? ''),
    queryFn: () =>
      apiGet<{ campaign: Campaign }>(`/api/campaigns/${cid}`).then((r) => r.campaign),
    enabled: !!cid,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CampaignFormValues) =>
      apiPost<{ campaign: Campaign }>('/api/campaigns', input).then((r) => r.campaign),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.campaigns() }),
  });
}

export function useUpdateCampaign(cid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      input: Partial<CampaignFormValues> & {
        moodSlots?: { label: string; spotifyUri: string }[];
      },
    ) =>
      apiPatch<{ campaign: Campaign }>(`/api/campaigns/${cid}`, input).then(
        (r) => r.campaign,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.campaigns() });
      qc.invalidateQueries({ queryKey: qk.campaign(cid) });
    },
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cid: string) => apiDelete<{ ok: true }>(`/api/campaigns/${cid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.campaigns() }),
  });
}

export function useDuplicateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cid: string) =>
      apiPost<{ campaign: Campaign }>(`/api/campaigns/${cid}/duplicate`).then(
        (r) => r.campaign,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.campaigns() }),
  });
}
