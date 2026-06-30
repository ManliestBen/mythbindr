/** Centralized React Query keys so invalidation stays consistent across views. */
export const qk = {
  campaigns: () => ['campaigns'] as const,
  campaign: (cid: string) => ['campaign', cid] as const,
  elements: (cid: string, filters: Record<string, unknown> = {}) =>
    ['campaign', cid, 'elements', filters] as const,
  element: (cid: string, id: string) => ['campaign', cid, 'element', id] as const,
  backlinks: (cid: string, id: string) =>
    ['campaign', cid, 'element', id, 'backlinks'] as const,
  dashboard: (cid: string) => ['campaign', cid, 'dashboard'] as const,
  search: (cid: string, q: string) => ['campaign', cid, 'search', q] as const,
  members: (cid: string) => ['campaign', cid, 'members'] as const,
  invites: (cid: string) => ['campaign', cid, 'invites'] as const,
  activity: (cid: string) => ['campaign', cid, 'activity'] as const,
  invitePreview: (token: string) => ['invite', token] as const,
};
