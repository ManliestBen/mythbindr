import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';
import { qk } from '../lib/queryKeys';

export interface DashboardData {
  counts: Record<string, number>;
  recent: { id: string; type: string; name: string; updatedAt: string }[];
  storySoFar: string;
}

export function useDashboard(cid: string) {
  return useQuery({
    queryKey: qk.dashboard(cid),
    queryFn: () => apiGet<DashboardData>(`/api/campaigns/${cid}/dashboard`),
    enabled: !!cid,
  });
}

export interface SearchResult {
  id: string;
  type: string;
  name: string;
}

export function useSearch(cid: string, q: string, type?: string) {
  return useQuery({
    queryKey: [...qk.search(cid, q), type ?? ''],
    queryFn: () =>
      apiGet<{ results: SearchResult[] }>(
        `/api/campaigns/${cid}/search?q=${encodeURIComponent(q)}${
          type ? `&type=${encodeURIComponent(type)}` : ''
        }`,
      ).then((r) => r.results),
    enabled: !!cid && q.trim().length > 0,
  });
}
