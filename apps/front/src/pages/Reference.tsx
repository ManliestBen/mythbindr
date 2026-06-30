import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CATEGORY_META,
  categoryLabel,
  useSrdCategories,
  useSrdList,
  useSrdResource,
} from '../data/srd';
import ResourceView from '../components/reference/ResourceView';

const FILTER_PLACEHOLDER: Record<string, string> = {
  cr: 'CR',
  type: 'Type',
  size: 'Size',
  level: 'Level',
  school: 'School',
  rarity: 'Rarity',
};

export default function Reference() {
  const { category = 'monsters' } = useParams();
  const cats = useSrdCategories();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);

  // Reset state when the category changes.
  useEffect(() => {
    setQ('');
    setFilters({});
    setSelected(null);
  }, [category]);

  const meta = CATEGORY_META[category] ?? { label: category, filters: [] };
  const list = useSrdList(category, { q, ...filters });
  const detail = useSrdResource(category, selected);

  const numeric = (k: string) => k === 'cr' || k === 'level';

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold">Reference</h1>

      {/* Category tabs */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(cats.data ?? []).map((c) => (
          <Link
            key={c.category}
            to={`/reference/${c.category}`}
            className={[
              'rounded-lg border px-2.5 py-1 text-xs',
              c.category === category
                ? 'border-brand text-brand'
                : 'border-app-border text-fg-muted hover:text-fg',
            ].join(' ')}
          >
            {categoryLabel(c.category)} <span className="opacity-60">{c.count}</span>
          </Link>
        ))}
      </div>

      {/* Search + filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${meta.label.toLowerCase()}…`}
          className="flex-1 min-w-[12rem] rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-brand"
        />
        {meta.filters.map((f) => (
          <input
            key={f}
            value={filters[f] ?? ''}
            onChange={(e) => setFilters((s) => ({ ...s, [f]: e.target.value }))}
            type={numeric(f) ? 'number' : 'text'}
            placeholder={FILTER_PLACEHOLDER[f] ?? f}
            className="w-24 rounded-lg border border-app-border bg-app-bg px-2 py-2 text-sm outline-none focus:border-brand"
          />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* List */}
        <div>
          {list.isLoading && <p className="text-sm text-fg-muted">Loading…</p>}
          {list.data && (
            <p className="mb-2 text-[11px] uppercase tracking-wide text-fg-muted">
              {list.data.results.length} of {list.data.count}
            </p>
          )}
          <ul className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
            {list.data?.results.map((r) => (
              <li key={r.slug}>
                <button
                  onClick={() => setSelected(r.slug)}
                  className={[
                    'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm',
                    selected === r.slug
                      ? 'border-brand bg-app-surface'
                      : 'border-app-border bg-app-surface hover:border-fg-muted',
                  ].join(' ')}
                >
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-fg-muted">
                    {r.cr != null
                      ? `CR ${r.cr}`
                      : r.level != null
                        ? `Lv ${r.level}`
                        : r.rarity || r.type || ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Detail */}
        <div className="rounded-xl border border-app-border bg-app-surface p-4">
          {!selected && <p className="text-sm text-fg-muted">Select an entry to view it.</p>}
          {selected && detail.isLoading && <p className="text-sm text-fg-muted">Loading…</p>}
          {detail.data && <ResourceView resource={detail.data} />}
        </div>
      </div>
    </div>
  );
}
