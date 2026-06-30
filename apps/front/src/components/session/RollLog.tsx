import { useState } from 'react';
import type { LogEntry } from '../../data/session';

const ICON: Record<LogEntry['kind'], string> = { roll: '🎲', note: '📝', event: '•' };

export default function RollLog({
  log,
  onNote,
}: {
  log: LogEntry[];
  onNote: (text: string) => void;
}) {
  const [note, setNote] = useState('');
  const submit = () => {
    if (!note.trim()) return;
    onNote(note.trim());
    setNote('');
  };

  return (
    <div className="rounded-xl border border-app-border bg-app-surface p-3">
      <div className="flex items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Add a note…"
          className="flex-1 rounded-lg border border-app-border bg-app-bg px-2 py-1 text-sm outline-none focus:border-brand"
        />
        <button
          onClick={submit}
          className="rounded-lg border border-app-border px-2 py-1 text-xs text-fg-muted hover:text-fg"
        >
          Log
        </button>
      </div>
      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
        {[...log].reverse().map((e, i) => (
          <li key={i} className="flex gap-2 text-fg-muted">
            <span>{ICON[e.kind]}</span>
            <span className="text-fg">{e.text}</span>
            {e.by && <span className="text-[10px] text-fg-muted">— {e.by}</span>}
          </li>
        ))}
        {log.length === 0 && <li className="text-xs text-fg-muted">No rolls yet.</li>}
      </ul>
    </div>
  );
}
