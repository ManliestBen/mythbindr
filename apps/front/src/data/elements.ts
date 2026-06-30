import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';
import { qk } from '../lib/queryKeys';

export interface ElementLink {
  targetId: string;
  relType: string;
  source: string;
}

export interface ElementT {
  id: string;
  campaignId: string;
  type: string;
  name: string;
  body: unknown;
  tags: string[];
  links: ElementLink[];
  data: Record<string, unknown>;
  playerVisible: boolean;
  secrets: string;
  soundtrack: { spotifyUri: string; name: string } | null;
  version: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ElementInput {
  type: string;
  name: string;
  body?: unknown;
  tags?: string[];
  playerVisible?: boolean;
  secrets?: string;
  data?: Record<string, unknown>;
  relationships?: { targetId: string; relType: string }[];
}

/** Invalidate every elements list + the dashboard counts for a campaign. */
function invalidateElements(qc: QueryClient, cid: string) {
  qc.invalidateQueries({ queryKey: ['campaign', cid, 'elements'] });
  qc.invalidateQueries({ queryKey: qk.dashboard(cid) });
}

export function useElements(
  cid: string,
  opts: { type?: string; includeDeleted?: boolean } = {},
) {
  const params = new URLSearchParams();
  if (opts.type) params.set('type', opts.type);
  if (opts.includeDeleted) params.set('includeDeleted', '1');
  const qs = params.toString();
  return useQuery({
    queryKey: qk.elements(cid, opts),
    queryFn: () =>
      apiGet<{ elements: ElementT[] }>(
        `/api/campaigns/${cid}/elements${qs ? `?${qs}` : ''}`,
      ).then((r) => r.elements),
    enabled: !!cid,
  });
}

export function useElement(cid: string, id?: string) {
  return useQuery({
    queryKey: qk.element(cid, id ?? ''),
    queryFn: () =>
      apiGet<{ element: ElementT }>(`/api/campaigns/${cid}/elements/${id}`).then(
        (r) => r.element,
      ),
    enabled: !!cid && !!id && id !== 'new',
  });
}

export function useCreateElement(cid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ElementInput) =>
      apiPost<{ element: ElementT }>(`/api/campaigns/${cid}/elements`, input).then(
        (r) => r.element,
      ),
    onSuccess: () => invalidateElements(qc, cid),
  });
}

export function useUpdateElement(cid: string, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<ElementInput> & { expectedVersion?: number }) =>
      apiPatch<{ element: ElementT }>(
        `/api/campaigns/${cid}/elements/${id}`,
        input,
      ).then((r) => r.element),
    onSuccess: () => {
      invalidateElements(qc, cid);
      qc.invalidateQueries({ queryKey: qk.element(cid, id) });
    },
  });
}

export function useDeleteElement(cid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ ok: true }>(`/api/campaigns/${cid}/elements/${id}`),
    onSuccess: () => invalidateElements(qc, cid),
  });
}

export function useRestoreElement(cid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ element: ElementT }>(
        `/api/campaigns/${cid}/elements/${id}/restore`,
      ).then((r) => r.element),
    onSuccess: () => invalidateElements(qc, cid),
  });
}

export interface Backlink {
  id: string;
  type: string;
  name: string;
}

/** Elements that @mention or link to the given element ("Linked from"). */
export function useBacklinks(cid: string, id?: string) {
  return useQuery({
    queryKey: qk.backlinks(cid, id ?? ''),
    queryFn: () =>
      apiGet<{ backlinks: Backlink[] }>(
        `/api/campaigns/${cid}/elements/${id}/backlinks`,
      ).then((r) => r.backlinks),
    enabled: !!cid && !!id && id !== 'new',
  });
}
