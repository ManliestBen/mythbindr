import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';
import { qk } from '../lib/queryKeys';

export interface ActivityItem {
  id: string;
  action: 'created' | 'updated' | 'deleted' | 'restored';
  elementId: string | null;
  elementType: string | null;
  elementName: string | null;
  userName: string;
  at: string;
}

export function useActivity(cid: string, limit = 30) {
  return useQuery({
    queryKey: [...qk.activity(cid), limit],
    queryFn: () =>
      apiGet<{ activity: ActivityItem[] }>(
        `/api/campaigns/${cid}/activity?limit=${limit}`,
      ).then((r) => r.activity),
    enabled: !!cid,
  });
}
