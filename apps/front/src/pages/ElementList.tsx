import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ELEMENT_TYPE_BY_SEGMENT } from '../data/elementTypes';
import { useElements, useRestoreElement } from '../data/elements';

export default function ElementList() {
  const { cid, type: seg } = useParams();
  const cfg = seg ? ELEMENT_TYPE_BY_SEGMENT[seg] : undefined;
  const [showTrash, setShowTrash] = useState(false);
  const restore = useRestoreElement(cid ?? '');

  const { data: elements, isLoading, error } = useElements(cid ?? '', {
    type: cfg?.type,
    includeDeleted: showTrash,
  });

  if (!cfg) {
    return <p className="text-sm text-fg-muted">Unknown section.</p>;
  }

  if (!cfg.available) {
    return (
      <div className="mx-auto grid max-w-4xl place-items-center py-24 text-center">
        <div>
          <h1 className="font-heading text-2xl font-bold">{cfg.plural}</h1>
          <p className="mt-2 text-sm text-fg-muted">Coming in an upcoming slice.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{cfg.plural}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTrash((v) => !v)}
            className={[
              'rounded-lg border border-app-border px-3 py-1.5 text-sm',
              showTrash ? 'text-fg' : 'text-fg-muted hover:text-fg',
            ].join(' ')}
          >
            {showTrash ? 'Viewing trash' : 'Trash'}
          </button>
          {!showTrash && (
            <Link
              to={`/campaigns/${cid}/${seg}/new`}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-app-bg hover:bg-brand-bright"
            >
              + New {cfg.label}
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6">
        {isLoading && <p className="text-sm text-fg-muted">Loading…</p>}
        {error && (
          <p className="text-sm text-red-400">
            {error instanceof Error ? error.message : 'Failed to load'}
          </p>
        )}

        {elements && elements.length === 0 && (
          <div className="rounded-xl border border-dashed border-app-border p-10 text-center">
            <p className="text-sm text-fg-muted">
              {showTrash ? `No ${cfg.plural.toLowerCase()} in trash.` : `No ${cfg.plural.toLowerCase()} yet.`}
            </p>
          </div>
        )}

        {elements && elements.length > 0 && (
          <ul className="space-y-2">
            {elements.map((el) => (
              <li
                key={el.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-app-border bg-app-surface p-4"
              >
                <div className="min-w-0">
                  {showTrash ? (
                    <span className="font-medium">{el.name}</span>
                  ) : (
                    <Link
                      to={`/campaigns/${cid}/${seg}/${el.id}`}
                      className="font-medium hover:text-brand"
                    >
                      {el.name}
                    </Link>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {el.playerVisible && (
                      <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
                        Shared
                      </span>
                    )}
                    {el.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-app-border px-2 py-0.5 text-[10px] text-fg-muted"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                {showTrash && (
                  <button
                    onClick={() => restore.mutate(el.id)}
                    disabled={restore.isPending}
                    className="shrink-0 rounded-lg border border-app-border px-3 py-1.5 text-sm text-fg-muted hover:text-fg disabled:opacity-50"
                  >
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
