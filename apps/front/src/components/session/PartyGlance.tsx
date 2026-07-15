import { useElements } from '../../data/elements';
import { newCombatant, type Combatant } from '../../data/session';

/**
 * The numbers a GM checks constantly mid-fight — each PC's AC and Passive
 * Perception — pinned above the tracker, plus one click to seed the whole
 * party into initiative.
 */
export default function PartyGlance({
  campaignId,
  combatants,
  onAdd,
}: {
  campaignId: string;
  combatants: Combatant[];
  onAdd: (c: Combatant) => void;
}) {
  const pcs = useElements(campaignId, { type: 'pc' });
  if (!pcs.data || pcs.data.length === 0) return null;

  const inTracker = new Set(combatants.map((c) => c.sourceElementId).filter(Boolean));
  const missing = pcs.data.filter((p) => !inTracker.has(p.id));

  const addParty = () => {
    for (const p of missing) {
      const d = (p.data ?? {}) as Record<string, unknown>;
      const c = newCombatant(p.name, 0, Number(d.hpMax) || 0, true);
      c.sourceElementId = p.id;
      onAdd(c);
    }
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-app-border bg-app-surface px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
        Party
      </span>
      {pcs.data.map((p) => {
        const d = (p.data ?? {}) as Record<string, unknown>;
        const ac = d.ac ? String(d.ac) : '—';
        const pp = d.passivePerception ? String(d.passivePerception) : '—';
        return (
          <span
            key={p.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-app-border bg-app-bg px-2.5 py-1 text-xs"
            title={`${p.name} — AC ${ac}, Passive Perception ${pp}`}
          >
            <span className="font-medium">{p.name}</span>
            <span className="text-fg-muted">
              AC {ac} · PP {pp}
            </span>
          </span>
        );
      })}
      {missing.length > 0 && (
        <button
          onClick={addParty}
          className="ml-auto rounded-lg border border-app-border px-2.5 py-1 text-xs font-semibold text-fg-muted hover:border-brand hover:text-brand"
          title="Add every party member to the initiative tracker"
        >
          + Add party to tracker
        </button>
      )}
    </div>
  );
}
