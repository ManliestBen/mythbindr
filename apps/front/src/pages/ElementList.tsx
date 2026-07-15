import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ELEMENT_TYPE_BY_SEGMENT } from '../data/elementTypes';
import { useElements, useRestoreElement, type ElementT } from '../data/elements';
import { questProgress } from '../lib/quests';

/** One informative line under the element name, per type. */
function summarize(el: ElementT): string {
  const d = el.data as Record<string, string | number | undefined>;
  const parts: (string | number | undefined | false)[] = [];
  switch (el.type) {
    case 'npc':
      parts.push(d.role && String(d.role), d.location && `in ${d.location}`, d.summary && String(d.summary));
      break;
    case 'location':
      parts.push(d.locType && String(d.locType));
      break;
    case 'encounter':
      parts.push(d.encType && String(d.encType), d.trigger && String(d.trigger));
      break;
    case 'item':
      parts.push(d.rarity && String(d.rarity), d.itemType && String(d.itemType));
      break;
    case 'quest':
      parts.push(d.giver && `from ${d.giver}`, d.hook && String(d.hook));
      break;
    case 'faction':
      parts.push(d.influence && `${d.influence} influence`, d.leader && `led by ${d.leader}`);
      break;
    case 'pc':
      parts.push(
        d.playerName && `played by ${d.playerName}`,
        d.klass && `${d.klass}${d.level ? ` ${d.level}` : ''}`,
        d.ac && `AC ${d.ac}`,
      );
      break;
  }
  return parts.filter(Boolean).join(' · ');
}

/** Colored status badge for the types that have a lifecycle. */
function statusBadge(el: ElementT): { label: string; cls: string } | null {
  const status = (el.data as Record<string, unknown>).status as string | undefined;
  if (!status) return null;
  if (el.type === 'quest') {
    const cls =
      status === 'active'
        ? 'bg-brand/15 text-brand'
        : status === 'completed'
          ? 'bg-emerald-500/15 text-emerald-400'
          : status === 'failed'
            ? 'bg-red-500/15 text-red-400'
            : 'border border-app-border text-fg-muted';
    return { label: status, cls };
  }
  if (el.type === 'encounter' && status !== 'planned') {
    return {
      label: status,
      cls:
        status === 'completed'
          ? 'bg-emerald-500/15 text-emerald-400'
          : 'bg-brand/15 text-brand',
    };
  }
  if (el.type === 'npc' && status && status !== 'alive') {
    return { label: status, cls: 'bg-red-500/15 text-red-400' };
  }
  return null;
}

export default function ElementList() {
  const { cid, type: seg } = useParams();
  const cfg = seg ? ELEMENT_TYPE_BY_SEGMENT[seg] : undefined;
  const [showTrash, setShowTrash] = useState(false);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const restore = useRestoreElement(cid ?? '');

  // Types whose form has a status select get one-click filter chips.
  const statusField = cfg?.dataFields?.find((f) => f.key === 'status' && f.kind === 'select');

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

  const visible = (elements ?? [])
    .filter(
      (el) =>
        !filter.trim() ||
        el.name.toLowerCase().includes(filter.trim().toLowerCase()) ||
        el.tags.some((t) => t.toLowerCase().includes(filter.trim().toLowerCase())),
    )
    .filter(
      (el) =>
        !statusFilter ||
        String((el.data as Record<string, unknown>).status ?? '') === statusFilter,
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
    );

  const statusCounts: Record<string, number> = {};
  if (statusField) {
    for (const el of elements ?? []) {
      const s = String((el.data as Record<string, unknown>).status ?? '');
      if (s) statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{cfg.plural}</h1>
          {cfg.blurb && <p className="mt-1 max-w-prose text-sm text-fg-muted">{cfg.blurb}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
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

      {statusField && !showTrash && (elements?.length ?? 0) > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setStatusFilter('')}
            className={[
              'rounded-full border px-2.5 py-1 text-xs',
              statusFilter === ''
                ? 'border-brand text-brand'
                : 'border-app-border text-fg-muted hover:text-fg',
            ].join(' ')}
          >
            All ({elements?.length ?? 0})
          </button>
          {(statusField.options ?? []).map((o) => (
            <button
              key={o}
              onClick={() => setStatusFilter((cur) => (cur === o ? '' : o))}
              className={[
                'rounded-full border px-2.5 py-1 text-xs',
                statusFilter === o
                  ? 'border-brand text-brand'
                  : 'border-app-border text-fg-muted hover:text-fg',
              ].join(' ')}
            >
              {o} ({statusCounts[o] ?? 0})
            </button>
          ))}
        </div>
      )}

      {(elements?.length ?? 0) > 5 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Filter ${cfg.plural.toLowerCase()} by name or tag…`}
            className="w-full max-w-xs rounded-lg border border-app-border bg-app-bg px-3 py-1.5 text-sm outline-none focus:border-brand"
            aria-label={`Filter ${cfg.plural}`}
          />
          <div className="flex gap-1">
            {(
              [
                ['recent', 'Recent'],
                ['name', 'A–Z'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className={[
                  'rounded-lg border px-2.5 py-1 text-xs',
                  sort === key
                    ? 'border-brand text-brand'
                    : 'border-app-border text-fg-muted hover:text-fg',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        {isLoading && <p className="text-sm text-fg-muted">Loading…</p>}
        {error && (
          <p className="text-sm text-red-400">
            {error instanceof Error ? error.message : 'Failed to load'}
          </p>
        )}

        {elements && elements.length === 0 && (
          <div className="rounded-xl border border-dashed border-app-border p-10 text-center">
            {showTrash ? (
              <p className="text-sm text-fg-muted">No {cfg.plural.toLowerCase()} in trash.</p>
            ) : (
              <>
                <p className="font-heading text-lg font-bold">
                  No {cfg.plural.toLowerCase()} yet
                </p>
                {cfg.blurb && (
                  <p className="mx-auto mt-2 max-w-md text-sm text-fg-muted">{cfg.blurb}</p>
                )}
                <Link
                  to={`/campaigns/${cid}/${seg}/new`}
                  className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-app-bg hover:bg-brand-bright"
                >
                  Create your first {cfg.label.toLowerCase()}
                </Link>
              </>
            )}
          </div>
        )}

        {elements && elements.length > 0 && visible.length === 0 && (
          <p className="text-sm text-fg-muted">
            Nothing matches{filter.trim() ? <> “{filter}”</> : ''}
            {statusFilter ? <> with status “{statusFilter}”</> : ''}.
          </p>
        )}

        {visible.length > 0 && (
          <ul className="space-y-2">
            {visible.map((el) => {
              const summary = summarize(el);
              const badge = statusBadge(el);
              const progress = questProgress(el);
              return (
                <li
                  key={el.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-app-border bg-app-surface p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
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
                      {badge && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      )}
                    </div>
                    {summary && (
                      <p className="mt-0.5 truncate text-xs text-fg-muted">{summary}</p>
                    )}
                    {progress && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1 w-28 overflow-hidden rounded-full bg-app-surface2">
                          <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${(progress.done / progress.total) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-fg-muted">
                          {progress.done}/{progress.total} objectives
                        </span>
                      </div>
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
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
