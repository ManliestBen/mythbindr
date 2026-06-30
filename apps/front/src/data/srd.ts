import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';

export interface SrdListItem {
  category: string;
  slug: string;
  name: string;
  cr: number | null;
  hp: number | null;
  ac: number | null;
  size: string | null;
  type: string | null;
  level: number | null;
  school: string | null;
  rarity: string | null;
  classes: string[];
}

export interface SrdCategoryCount {
  category: string;
  count: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SrdResource {
  category: string;
  slug: string;
  name: string;
  desc: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export function useSrdCategories() {
  return useQuery({
    queryKey: ['srd', 'categories'],
    queryFn: () =>
      apiGet<{ categories: SrdCategoryCount[] }>('/api/srd').then((r) => r.categories),
  });
}

export function useSrdList(category: string, filters: Record<string, string>) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
  const qs = params.toString();
  return useQuery({
    queryKey: ['srd', category, filters],
    queryFn: () =>
      apiGet<{ count: number; results: SrdListItem[] }>(
        `/api/srd/${category}${qs ? `?${qs}` : ''}`,
      ),
    enabled: !!category,
  });
}

export function useSrdResource(category: string, slug: string | null) {
  return useQuery({
    queryKey: ['srd', category, 'item', slug],
    queryFn: () =>
      apiGet<{ resource: SrdResource }>(`/api/srd/${category}/${slug}`).then((r) => r.resource),
    enabled: !!category && !!slug,
  });
}

/** Friendly labels + which filters to show per category. */
export const CATEGORY_META: Record<string, { label: string; filters: string[] }> = {
  monsters: { label: 'Monsters', filters: ['cr', 'type', 'size'] },
  spells: { label: 'Spells', filters: ['level', 'school'] },
  magicitems: { label: 'Magic Items', filters: ['rarity'] },
  conditions: { label: 'Conditions', filters: [] },
  weapons: { label: 'Weapons', filters: [] },
  armor: { label: 'Armor', filters: [] },
  feats: { label: 'Feats', filters: [] },
  races: { label: 'Races', filters: [] },
  classes: { label: 'Classes', filters: [] },
  backgrounds: { label: 'Backgrounds', filters: [] },
  planes: { label: 'Planes', filters: [] },
  sections: { label: 'Rules', filters: [] },
  spelllist: { label: 'Spell Lists', filters: [] },
  documents: { label: 'Sources', filters: [] },
};

export function categoryLabel(cat: string): string {
  return CATEGORY_META[cat]?.label ?? cat;
}
