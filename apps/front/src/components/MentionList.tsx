import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

export interface MentionItem {
  id: string;
  label: string;
  type: string;
}

interface Props {
  items: MentionItem[];
  command: (item: { id: string; label: string }) => void;
}

export interface MentionListHandle {
  onKeyDown: (x: { event: KeyboardEvent }) => boolean;
}

/** Keyboard-navigable @mention autocomplete dropdown rendered by TipTap's suggestion plugin. */
const MentionList = forwardRef<MentionListHandle, Props>((props, ref) => {
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [props.items]);

  const choose = (i: number) => {
    const item = props.items[i];
    if (item) props.command({ id: item.id, label: item.label });
  };

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        const n = props.items.length;
        if (n === 0) return false;
        if (event.key === 'ArrowUp') {
          setSelected((s) => (s + n - 1) % n);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelected((s) => (s + 1) % n);
          return true;
        }
        if (event.key === 'Enter') {
          choose(selected);
          return true;
        }
        return false;
      },
    }),
    [selected, props.items],
  );

  return (
    <div className="w-56 overflow-hidden rounded-lg border border-app-border bg-app-surface shadow-lg">
      {props.items.length === 0 ? (
        <div className="px-3 py-2 text-xs text-fg-muted">No matches</div>
      ) : (
        props.items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              choose(i);
            }}
            className={[
              'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm',
              i === selected ? 'bg-app-surface2 text-fg' : 'text-fg-muted',
            ].join(' ')}
          >
            <span className="truncate">{it.label}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-fg-muted">
              {it.type}
            </span>
          </button>
        ))
      )}
    </div>
  );
});
MentionList.displayName = 'MentionList';
export default MentionList;
