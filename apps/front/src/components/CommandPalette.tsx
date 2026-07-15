import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCampaign } from '../campaign/ActiveCampaignProvider';
import { useSearch } from '../data/dashboard';
import {
  ELEMENT_SEGMENTS_ORDERED,
  ELEMENT_TYPE_BY_SEGMENT,
  segmentForType,
} from '../data/elementTypes';
import { getRecents } from '../lib/recentItems';

interface Command {
  key: string;
  group: string;
  label: string;
  hint?: string;
  run: () => void;
}

/**
 * Ctrl/Cmd-K palette: jump to any element, fire "new X" actions, switch
 * campaigns — without touching the mouse. Recents surface when the query
 * is empty so mid-session lookups are two keystrokes away.
 */
export default function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { campaigns, activeCampaignId, activeCampaign } = useActiveCampaign();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setDebouncedQ('');
      setSel(0);
      // Focus after the element mounts.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  const search = useSearch(activeCampaignId ?? '', open ? debouncedQ.trim() : '');

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];
    const cid = activeCampaignId;
    const query = q.trim().toLowerCase();

    // Jump back — recents, only while the query is empty.
    if (cid && !query) {
      for (const r of getRecents(cid)) {
        cmds.push({
          key: `recent:${r.id}`,
          group: 'Recent',
          label: r.name,
          hint: ELEMENT_TYPE_BY_SEGMENT[r.seg]?.label ?? r.seg,
          run: () => go(`/campaigns/${cid}/${r.seg}/${r.id}`),
        });
      }
    }

    // Element search results.
    if (cid && query) {
      for (const r of search.data ?? []) {
        const seg = segmentForType(r.type);
        if (!seg) continue;
        cmds.push({
          key: `el:${r.id}`,
          group: 'Elements',
          label: r.name,
          hint: ELEMENT_TYPE_BY_SEGMENT[seg]?.label ?? r.type,
          run: () => go(`/campaigns/${cid}/${seg}/${r.id}`),
        });
      }
    }

    // Actions — filtered by the query.
    const actions: Command[] = [];
    if (cid) {
      for (const seg of ELEMENT_SEGMENTS_ORDERED) {
        const cfg = ELEMENT_TYPE_BY_SEGMENT[seg];
        actions.push({
          key: `new:${seg}`,
          group: 'Actions',
          label: `New ${cfg.label}`,
          run: () => go(`/campaigns/${cid}/${seg}/new`),
        });
      }
      actions.push(
        {
          key: 'session',
          group: 'Actions',
          label: 'Run session',
          hint: activeCampaign?.name,
          run: () => go(`/campaigns/${cid}/session`),
        },
        {
          key: 'overview',
          group: 'Actions',
          label: 'Campaign overview',
          hint: activeCampaign?.name,
          run: () => go(`/campaigns/${cid}`),
        },
        {
          key: 'members',
          group: 'Actions',
          label: 'Members & invites',
          run: () => go(`/campaigns/${cid}/members`),
        },
      );
    }
    actions.push(
      { key: 'campaigns', group: 'Actions', label: 'All campaigns', run: () => go('/campaigns') },
      { key: 'reference', group: 'Actions', label: '5e reference', run: () => go('/reference') },
      { key: 'settings', group: 'Actions', label: 'Settings', run: () => go('/settings') },
    );
    for (const c of campaigns) {
      if (c.id === cid) continue;
      actions.push({
        key: `switch:${c.id}`,
        group: 'Switch campaign',
        label: c.name,
        run: () => go(`/campaigns/${c.id}`),
      });
    }

    cmds.push(
      ...(query
        ? actions.filter((a) => a.label.toLowerCase().includes(query))
        : actions),
    );
    return cmds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCampaignId, activeCampaign, campaigns, q, search.data]);

  useEffect(() => {
    setSel(0);
  }, [q, search.data]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${sel}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, commands.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commands[sel]?.run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-label="Command palette"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-app-border bg-app-surface shadow-2xl">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search elements or type a command…"
          className="w-full border-b border-app-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-fg-muted"
          aria-label="Command palette search"
        />
        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {commands.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-fg-muted">
              {search.isLoading ? 'Searching…' : 'No matches.'}
            </li>
          )}
          {commands.map((c, i) => {
            const showGroup = c.group !== lastGroup;
            lastGroup = c.group;
            return (
              <li key={c.key}>
                {showGroup && (
                  <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
                    {c.group}
                  </div>
                )}
                <button
                  data-idx={i}
                  onClick={c.run}
                  onMouseMove={() => setSel(i)}
                  className={[
                    'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm',
                    i === sel ? 'bg-app-surface2 text-fg' : 'text-fg-muted',
                  ].join(' ')}
                >
                  <span className="truncate">{c.label}</span>
                  {c.hint && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-fg-muted">
                      {c.hint}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-3 border-t border-app-border px-4 py-2 text-[10px] text-fg-muted">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
