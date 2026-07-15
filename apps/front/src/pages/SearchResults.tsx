import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useSearch } from '../data/dashboard';
import {
  ELEMENT_SEGMENTS_ORDERED,
  ELEMENT_TYPE_BY_SEGMENT,
  segmentForType,
} from '../data/elementTypes';

export default function SearchResults() {
  const { cid } = useParams();
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const [type, setType] = useState('');
  const { data: results, isLoading } = useSearch(cid ?? '', q, type || undefined);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">Search</h1>
      <p className="mt-1 text-sm text-fg-muted">
        {q ? <>Results for “{q}”</> : 'Type a query in the search box above.'}
      </p>

      {q && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setType('')}
            className={[
              'rounded-full border px-2.5 py-1 text-xs',
              type === '' ? 'border-brand text-brand' : 'border-app-border text-fg-muted hover:text-fg',
            ].join(' ')}
          >
            All types
          </button>
          {ELEMENT_SEGMENTS_ORDERED.map((seg) => {
            const t = ELEMENT_TYPE_BY_SEGMENT[seg].type;
            return (
              <button
                key={seg}
                onClick={() => setType((cur) => (cur === t ? '' : t))}
                className={[
                  'rounded-full border px-2.5 py-1 text-xs',
                  type === t ? 'border-brand text-brand' : 'border-app-border text-fg-muted hover:text-fg',
                ].join(' ')}
              >
                {ELEMENT_TYPE_BY_SEGMENT[seg].plural}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        {q && isLoading && <p className="text-sm text-fg-muted">Searching…</p>}
        {q && results && results.length === 0 && (
          <p className="text-sm text-fg-muted">No matches.</p>
        )}
        {results && results.length > 0 && (
          <ul className="space-y-2">
            {results.map((r) => {
              const seg = segmentForType(r.type);
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-app-border bg-app-surface p-3"
                >
                  {seg ? (
                    <Link
                      to={`/campaigns/${cid}/${seg}/${r.id}`}
                      className="font-medium hover:text-brand"
                    >
                      {r.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.name}</span>
                  )}
                  <span className="text-[10px] uppercase tracking-wide text-fg-muted">
                    {r.type}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
