import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useActivity } from '../data/activity';
import { segmentForType } from '../data/elementTypes';
import { timeAgo } from '../lib/timeAgo';
import Skeleton from '../components/Skeleton';

const ACTIONS = ['created', 'updated', 'deleted', 'restored'] as const;

/** Full change feed for a campaign — who touched what, when. */
export default function Activity() {
  const { cid } = useParams();
  const { data, isLoading } = useActivity(cid ?? '', 200);
  const [action, setAction] = useState('');
  const [who, setWho] = useState('');

  const visible = (data ?? []).filter(
    (a) =>
      (!action || a.action === action) &&
      (!who.trim() || a.userName.toLowerCase().includes(who.trim().toLowerCase())),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">Activity</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Every change your co-GMs and you have made, newest first.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setAction('')}
          className={[
            'rounded-full border px-2.5 py-1 text-xs',
            action === '' ? 'border-brand text-brand' : 'border-app-border text-fg-muted hover:text-fg',
          ].join(' ')}
        >
          All
        </button>
        {ACTIONS.map((a) => (
          <button
            key={a}
            onClick={() => setAction((cur) => (cur === a ? '' : a))}
            className={[
              'rounded-full border px-2.5 py-1 text-xs',
              action === a ? 'border-brand text-brand' : 'border-app-border text-fg-muted hover:text-fg',
            ].join(' ')}
          >
            {a}
          </button>
        ))}
        <input
          value={who}
          onChange={(e) => setWho(e.target.value)}
          placeholder="Filter by member…"
          className="ml-auto w-44 rounded-lg border border-app-border bg-app-bg px-3 py-1.5 text-sm outline-none focus:border-brand"
          aria-label="Filter by member"
        />
      </div>

      <div className="mt-4">
        {isLoading && <Skeleton rows={5} />}
        {!isLoading && visible.length === 0 && (
          <p className="text-sm text-fg-muted">No activity matches.</p>
        )}
        <ul className="space-y-1">
          {visible.map((a) => {
            const seg = a.elementType ? segmentForType(a.elementType) : undefined;
            return (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-fg-muted hover:bg-app-surface"
              >
                <strong className="font-medium text-fg">{a.userName}</strong> {a.action}
                {a.elementName &&
                  (seg && a.elementId && a.action !== 'deleted' ? (
                    <Link
                      to={`/campaigns/${cid}/${seg}/${a.elementId}`}
                      className="hover:text-brand"
                    >
                      {a.elementName}
                    </Link>
                  ) : (
                    <span>{a.elementName}</span>
                  ))}
                {a.elementType && (
                  <span className="text-[10px] uppercase tracking-wide">{a.elementType}</span>
                )}
                <span className="ml-auto shrink-0 text-xs">{timeAgo(a.at)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
