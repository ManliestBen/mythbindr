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
  session: (cid: string) => ['campaign', cid, 'session'] as const,
  sessionHistory: (cid: string) => ['campaign', cid, 'sessions', 'history'] as const,
  // prefix-invalidates every qk.elements(cid, filters) variant
  elementsPrefix: (cid: string) => ['campaign', cid, 'elements'] as const,
  shareLinks: (cid: string) => ['campaign', cid, 'sharelinks'] as const,
  share: (token: string) => ['share', token] as const,
  shareElements: (token: string) => ['share', token, 'elements'] as const,
  srdCategories: () => ['srd', 'categories'] as const,
  srdList: (category: string, filters: Record<string, string>) =>
    ['srd', category, filters] as const,
  srdResource: (category: string, slug: string | null) =>
    ['srd', category, 'item', slug] as const,
  spotifyPlaylists: () => ['spotify', 'playlists'] as const,
};
