import { useState } from 'react';
import { useSrdList } from '../../data/srd';
import { crToXp, rateEncounter, type Difficulty } from '../../data/xp';

const DIFF_COLOR: Record<Difficulty, string> = {
  trivial: 'text-fg-muted',
  easy: 'text-emerald-400',
  medium: 'text-amber-400',
  hard: 'text-orange-400',
  deadly: 'text-red-400',
};

interface Mon {
  key: string;
  name: string;
  cr: number | null;
  xp: number;
}

const inputCls =
  'rounded-lg border border-app-border bg-app-bg px-2 py-1 text-sm outline-none focus:border-brand';

export default function XpCalculator() {
  const [count, setCount] = useState('4');
  const [level, setLevel] = useState('3');
  const [mons, setMons] = useState<Mon[]>([]);
  const [q, setQ] = useState('');
  const results = useSrdList(q.trim().length >= 2 ? 'monsters' : '', { q: q.trim(), limit: '8' });

  const partyLevels = Array(Math.min(Math.max(parseInt(count, 10) || 0, 0), 12)).fill(
    Math.min(Math.max(parseInt(level, 10) || 1, 1), 20),
  );
  const { thresholds, adjustedXp, difficulty } = rateEncounter(
    partyLevels,
    mons.map((m) => m.xp),
  );

  return (
    <div className="rounded-xl border border-app-border bg-app-surface p-4">
      <h3 className="text-sm font-bold">Encounter difficulty</h3>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-fg-muted">
        <label className="flex items-center gap-1">
          PCs
          <input
            className={`${inputCls} w-14`}
            type="number"
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1">
          Level
          <input
            className={`${inputCls} w-14`}
            type="number"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          />
        </label>
      </div>

      <div className="relative mt-2">
        <input
          className={`${inputCls} w-full`}
          placeholder="Add a monster…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q.trim().length >= 2 && results.data && results.data.results.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-app-border bg-app-surface shadow-lg">
            {results.data.results.map((m) => (
              <li key={m.slug}>
                <button
                  onClick={() => {
                    setMons((s) => [
                      ...s,
                      { key: `${m.slug}-${s.length}`, name: m.name, cr: m.cr, xp: crToXp(m.cr) },
                    ]);
                    setQ('');
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-fg-muted hover:bg-app-surface2 hover:text-fg"
                >
                  <span className="truncate">{m.name}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide">
                    {m.cr != null ? `CR ${m.cr}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {mons.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {mons.map((m, i) => (
            <li key={m.key}>
              <button
                onClick={() => setMons((s) => s.filter((_, j) => j !== i))}
                className="rounded-full bg-app-surface2 px-2 py-0.5 text-[11px] text-fg-muted hover:text-red-400"
              >
                {m.name} ({m.xp} xp) ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 border-t border-app-border pt-2 text-sm">
        <p>
          Adjusted XP: <span className="font-semibold">{adjustedXp.toLocaleString()}</span> ·{' '}
          <span className={`font-semibold uppercase ${DIFF_COLOR[difficulty]}`}>{difficulty}</span>
        </p>
        <p className="mt-1 text-xs text-fg-muted">
          Party thresholds — easy {thresholds[0].toLocaleString()} · medium{' '}
          {thresholds[1].toLocaleString()} · hard {thresholds[2].toLocaleString()} · deadly{' '}
          {thresholds[3].toLocaleString()}
        </p>
      </div>
    </div>
  );
}
