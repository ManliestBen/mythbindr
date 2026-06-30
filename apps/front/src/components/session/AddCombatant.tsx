import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useElements } from '../../data/elements';
import { useSrdList } from '../../data/srd';
import { newCombatant, type Combatant } from '../../data/session';

export default function AddCombatant({ onAdd }: { onAdd: (c: Combatant) => void }) {
  const { cid } = useParams();
  const npcs = useElements(cid ?? '', { type: 'npc' });
  const [name, setName] = useState('');
  const [init, setInit] = useState('');
  const [hp, setHp] = useState('');
  const [isPlayer, setIsPlayer] = useState(false);
  const [monsterQ, setMonsterQ] = useState('');
  const monsters = useSrdList(monsterQ.trim().length >= 2 ? 'monsters' : '', {
    q: monsterQ.trim(),
    limit: '8',
  });

  const add = () => {
    if (!name.trim()) return;
    onAdd(newCombatant(name.trim(), parseInt(init, 10) || 0, parseInt(hp, 10) || 0, isPlayer));
    setName('');
    setInit('');
    setHp('');
    setIsPlayer(false);
  };

  const addNpc = (id: string) => {
    const npc = npcs.data?.find((e) => e.id === id);
    if (!npc) return;
    const c = newCombatant(npc.name);
    c.sourceElementId = npc.id;
    onAdd(c);
  };

  const inputCls =
    'rounded-lg border border-app-border bg-app-bg px-2 py-1.5 text-sm outline-none focus:border-brand';

  return (
    <div className="rounded-xl border border-dashed border-app-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputCls} flex-1 min-w-[8rem]`}
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <input
          className={`${inputCls} w-16`}
          placeholder="Init"
          type="number"
          value={init}
          onChange={(e) => setInit(e.target.value)}
        />
        <input
          className={`${inputCls} w-16`}
          placeholder="HP"
          type="number"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
        />
        <label className="flex items-center gap-1 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={isPlayer}
            onChange={(e) => setIsPlayer(e.target.checked)}
            className="accent-brand"
          />
          PC
        </label>
        <button
          onClick={add}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-app-bg hover:bg-brand-bright"
        >
          Add
        </button>
      </div>
      {npcs.data && npcs.data.length > 0 && (
        <div className="mt-2">
          <select
            value=""
            onChange={(e) => addNpc(e.target.value)}
            className={`${inputCls} text-fg-muted`}
          >
            <option value="">+ Add from NPCs…</option>
            {npcs.data.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Add from the SRD bestiary (prefills HP) */}
      <div className="relative mt-2">
        <input
          className={`${inputCls} w-full`}
          placeholder="+ Add from bestiary (search monsters)…"
          value={monsterQ}
          onChange={(e) => setMonsterQ(e.target.value)}
        />
        {monsterQ.trim().length >= 2 && monsters.data && monsters.data.results.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-app-border bg-app-surface shadow-lg">
            {monsters.data.results.map((m) => (
              <li key={m.slug}>
                <button
                  onClick={() => {
                    onAdd(newCombatant(m.name, 0, m.hp ?? 0));
                    setMonsterQ('');
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-fg-muted hover:bg-app-surface2 hover:text-fg"
                >
                  <span className="truncate">{m.name}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide">
                    {m.cr != null ? `CR ${m.cr}` : ''} {m.hp ? `· ${m.hp} hp` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
