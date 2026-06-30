import { useState } from 'react';
import { CONDITIONS, type Combatant } from '../../data/session';

export default function CombatantCard({
  c,
  isCurrent,
  onChange,
  onRemove,
}: {
  c: Combatant;
  isCurrent: boolean;
  onChange: (next: Combatant) => void;
  onRemove: () => void;
}) {
  const [amt, setAmt] = useState('');
  const n = Math.max(parseInt(amt, 10) || 0, 0);

  const down = c.currentHp <= 0;
  const bloodied = !down && c.maxHp > 0 && c.currentHp <= c.maxHp / 2;

  const damage = () => {
    let dmg = n;
    let temp = c.tempHp;
    const used = Math.min(temp, dmg);
    temp -= used;
    dmg -= used;
    onChange({ ...c, tempHp: temp, currentHp: Math.max(c.currentHp - dmg, -99) });
    setAmt('');
  };
  const heal = () => {
    const max = c.maxHp || c.currentHp + n;
    onChange({ ...c, currentHp: Math.min(c.currentHp + n, max) });
    setAmt('');
  };

  const addCondition = (name: string) => {
    if (!name || c.conditions.some((x) => x.name === name)) return;
    onChange({ ...c, conditions: [...c.conditions, { name, rounds: null }] });
  };
  const removeCondition = (name: string) =>
    onChange({ ...c, conditions: c.conditions.filter((x) => x.name !== name) });

  const toggleSave = (kind: 'successes' | 'failures', i: number) => {
    const cur = c.deathSaves[kind];
    const next = cur === i + 1 ? i : i + 1; // click filled pip to clear back
    onChange({ ...c, deathSaves: { ...c.deathSaves, [kind]: next } });
  };

  return (
    <div
      className={[
        'rounded-xl border p-3',
        isCurrent ? 'border-brand ring-1 ring-brand' : 'border-app-border',
        down ? 'bg-app-surface2' : 'bg-app-surface',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-app-surface2 text-sm font-bold text-brand">
            {c.initiative}
          </span>
          <span className="font-medium">{c.name}</span>
          {c.isPlayer && (
            <span className="text-[10px] uppercase tracking-wide text-fg-muted">PC</span>
          )}
          {bloodied && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-400">
              Bloodied
            </span>
          )}
          {down && (
            <span className="rounded-full bg-app-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
              Down
            </span>
          )}
        </div>
        <button onClick={onRemove} className="text-xs text-fg-muted hover:text-red-400">
          ✕
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-fg-muted">
          HP{' '}
          <span className={down ? 'text-red-400' : 'text-fg'}>
            {c.currentHp}
            {c.maxHp ? `/${c.maxHp}` : ''}
          </span>
          {c.tempHp > 0 && <span className="text-emerald-400"> +{c.tempHp}</span>}
        </span>
        <input
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          type="number"
          placeholder="0"
          className="w-14 rounded-lg border border-app-border bg-app-bg px-2 py-1 text-sm outline-none focus:border-brand"
        />
        <button
          onClick={damage}
          className="rounded-lg border border-app-border px-2 py-1 text-xs text-red-400 hover:text-red-300"
        >
          Damage
        </button>
        <button
          onClick={heal}
          className="rounded-lg border border-app-border px-2 py-1 text-xs text-emerald-400 hover:text-emerald-300"
        >
          Heal
        </button>
        <button
          onClick={() => onChange({ ...c, tempHp: c.tempHp + n })}
          className="rounded-lg border border-app-border px-2 py-1 text-xs text-fg-muted hover:text-fg"
          title="Add temp HP"
        >
          +Temp
        </button>
      </div>

      {/* Death saves for downed PCs */}
      {c.isPlayer && down && (
        <div className="mt-2 flex items-center gap-4 text-xs">
          <Pips
            label="Successes"
            count={c.deathSaves.successes}
            color="bg-emerald-500"
            onToggle={(i) => toggleSave('successes', i)}
          />
          <Pips
            label="Failures"
            count={c.deathSaves.failures}
            color="bg-red-500"
            onToggle={(i) => toggleSave('failures', i)}
          />
        </div>
      )}

      {/* Conditions */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {c.conditions.map((x) => (
          <button
            key={x.name}
            onClick={() => removeCondition(x.name)}
            className="rounded-full bg-app-surface2 px-2 py-0.5 text-[10px] text-fg-muted hover:text-red-400"
            title="Remove"
          >
            {x.name} ✕
          </button>
        ))}
        <select
          value=""
          onChange={(e) => addCondition(e.target.value)}
          className="rounded-lg border border-app-border bg-app-bg px-1.5 py-0.5 text-[11px] text-fg-muted outline-none focus:border-brand"
        >
          <option value="">+ condition</option>
          {CONDITIONS.filter((name) => !c.conditions.some((x) => x.name === name)).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Pips({
  label,
  count,
  color,
  onToggle,
}: {
  label: string;
  count: number;
  color: string;
  onToggle: (i: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-fg-muted">{label}</span>
      {[0, 1, 2].map((i) => (
        <button
          key={i}
          onClick={() => onToggle(i)}
          className={[
            'h-3.5 w-3.5 rounded-full border border-app-border',
            i < count ? color : 'bg-transparent',
          ].join(' ')}
        />
      ))}
    </div>
  );
}
