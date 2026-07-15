import { useState } from 'react';
import { useCreateElement } from '../data/elements';
import { generateParty } from '../lib/generators';

/**
 * One-shot party generator (§5.10, scoped): N SRD-legal characters with a
 * viable role mix, saved as pregen-tagged PC elements. Everything stays
 * editable — the numbers are a legal starting point, not a cage.
 */
export default function PartyGenerator({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState('4');
  const [level, setLevel] = useState('3');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateElement(campaignId);

  const generate = async () => {
    const n = Math.min(Math.max(parseInt(count, 10) || 4, 1), 8);
    const lvl = Math.min(Math.max(parseInt(level, 10) || 1, 1), 20);
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const party = generateParty(n, lvl);
      for (const pc of party) {
        await create.mutateAsync({
          type: 'pc',
          name: pc.name,
          body: null,
          tags: ['pregen', pc.role],
          playerVisible: false,
          secrets: '',
          data: {
            playerName: '',
            race: pc.race,
            klass: pc.klass,
            level: pc.level,
            ac: pc.ac,
            hpMax: pc.hpMax,
            passivePerception: pc.passivePerception,
            flawsBonds: pc.flawsBonds,
            backstoryHooks: pc.backstoryHooks,
          },
          relationships: [],
        });
      }
      setDone(`Created ${party.length} characters — hand them out and let players make them their own.`);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-app-border px-3 py-1.5 text-sm text-fg-muted hover:border-brand hover:text-brand"
        >
          🎲 Generate a party
        </button>
      ) : (
        <div className="rounded-xl border border-app-border bg-app-surface p-4">
          <p className="text-sm font-semibold">Generate a one-shot party</p>
          <p className="mt-1 text-xs text-fg-muted">
            A balanced, rules-legal starting lineup (fighter, cleric, rogue, wizard…)
            using the standard ability array. Names, flaws, and hooks are filled in;
            every field stays editable.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs text-fg-muted">
              Characters
              <input
                type="number"
                min={1}
                max={8}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="mt-1 block w-20 rounded-lg border border-app-border bg-app-bg px-2 py-1.5 text-sm text-fg outline-none focus:border-brand"
              />
            </label>
            <label className="text-xs text-fg-muted">
              Level
              <input
                type="number"
                min={1}
                max={20}
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="mt-1 block w-20 rounded-lg border border-app-border bg-app-bg px-2 py-1.5 text-sm text-fg outline-none focus:border-brand"
              />
            </label>
            <button
              onClick={generate}
              disabled={busy}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-app-bg hover:bg-brand-bright disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Generate'}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg border border-app-border px-3 py-2 text-sm text-fg-muted hover:text-fg"
            >
              Cancel
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
      )}
      {done && <p className="mt-2 text-sm text-emerald-400">{done}</p>}
    </div>
  );
}
