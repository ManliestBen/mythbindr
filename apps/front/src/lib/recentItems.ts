/** Recently-visited elements per campaign, kept in localStorage for the
 * command palette's "jump back" list. Purely a convenience cache. */

export interface RecentItem {
  id: string;
  seg: string; // URL segment, e.g. "npcs"
  name: string;
  at: number;
}

const keyFor = (cid: string) => `mythbindr:recent:${cid}`;
const MAX = 10;

export function getRecents(cid: string): RecentItem[] {
  try {
    const raw = localStorage.getItem(keyFor(cid));
    return raw ? (JSON.parse(raw) as RecentItem[]) : [];
  } catch {
    return [];
  }
}

export function recordRecent(cid: string, item: Omit<RecentItem, 'at'>): void {
  try {
    const list = getRecents(cid).filter((r) => r.id !== item.id);
    list.unshift({ ...item, at: Date.now() });
    localStorage.setItem(keyFor(cid), JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore quota/serialization issues — it's just a convenience */
  }
}
