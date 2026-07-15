import type { ElementT } from '../data/elements';

/** Quest objectives live as one-per-line text; a leading "x " marks a line done. */
export function questProgress(el: ElementT): { done: number; total: number } | null {
  if (el.type !== 'quest') return null;
  const raw = (el.data as Record<string, unknown>).objectives;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const done = lines.filter((l) => /^x\s/i.test(l)).length;
  return { done, total: lines.length };
}

export function questStatus(el: ElementT): string {
  return String((el.data as Record<string, unknown>).status ?? 'rumored');
}
