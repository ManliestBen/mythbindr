import { useMemo, useState } from 'react';
import { useSrdList, useSrdResource } from '../../data/srd';
import { useCreateElement } from '../../data/elements';
import {
  randomLoot,
  randomPlotHook,
  randomTavern,
  rollQuickNpc,
  type QuickNpcResult,
} from '../../lib/generators';

/**
 * Slide-over rules drawer for Run Session: SRD conditions, the actions every
 * combatant can take, and an on-the-spot NPC generator — so the GM never has
 * to leave the session screen (or open a rulebook) mid-fight.
 */

type Tab = 'conditions' | 'actions' | 'npc';

// The core actions-in-combat, summarized (SRD). Static on purpose: these are
// asked about constantly and must render instantly, offline from the SRD API.
const COMBAT_ACTIONS: { name: string; text: string }[] = [
  { name: 'Attack', text: 'Make one melee or ranged attack. Extra Attack lets some classes attack more than once with this action.' },
  { name: 'Cast a Spell', text: 'Cast a spell with a casting time of 1 action. You can also cast a bonus-action spell, but then any other spell this turn must be a cantrip with a casting time of 1 action.' },
  { name: 'Dash', text: 'Gain extra movement equal to your speed for the turn — effectively double speed.' },
  { name: 'Disengage', text: 'Your movement doesn’t provoke opportunity attacks for the rest of the turn.' },
  { name: 'Dodge', text: 'Until your next turn, attacks against you have disadvantage (if you can see the attacker) and you make DEX saves with advantage. Lost if you’re incapacitated or speed drops to 0.' },
  { name: 'Help', text: 'Give an ally advantage on their next ability check, or on their next attack against a creature within 5 ft of you (before your next turn).' },
  { name: 'Hide', text: 'Make a DEX (Stealth) check to become hidden. You must be unseen — heavily obscured or behind cover.' },
  { name: 'Ready', text: 'Choose a trigger and an action; use your reaction to act when the trigger occurs. Readied spells require concentration until released.' },
  { name: 'Search', text: 'Devote your turn to finding something — usually WIS (Perception) or INT (Investigation).' },
  { name: 'Use an Object', text: 'Interact with a second object this turn (one free interaction is included in your move/action), or use an object requiring an action.' },
  { name: 'Grapple (special)', text: 'Replaces one attack: your STR (Athletics) vs their STR (Athletics) or DEX (Acrobatics). On a win, their speed becomes 0.' },
  { name: 'Shove (special)', text: 'Replaces one attack: same contest as grappling. On a win, push the target 5 ft or knock it prone.' },
  { name: 'Opportunity Attack', text: 'Reaction: one melee attack against a creature that moves out of your reach (unless it Disengaged or teleported).' },
];

/** One-line generator: roll → show → optionally log to the session. */
function GenRow({
  label,
  value,
  onRoll,
  onLog,
}: {
  label: string;
  value: string | null;
  onRoll: () => void;
  onLog?: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
          {label}
        </span>
        <span className="flex gap-1.5">
          <button
            onClick={onRoll}
            className="rounded-md border border-app-border px-2 py-0.5 text-[11px] text-fg-muted hover:border-brand hover:text-brand"
          >
            🎲 Roll
          </button>
          {onLog && (
            <button
              onClick={onLog}
              className="rounded-md border border-app-border px-2 py-0.5 text-[11px] text-fg-muted hover:text-fg"
            >
              Log
            </button>
          )}
        </span>
      </div>
      {value && <p className="mt-1 text-sm">{value}</p>}
    </div>
  );
}

function ConditionRow({ slug, name }: { slug: string; name: string }) {
  const [open, setOpen] = useState(false);
  const detail = useSrdResource(open ? 'conditions' : '', open ? slug : null);
  return (
    <li className="rounded-lg border border-app-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:text-brand"
        aria-expanded={open}
      >
        {name}
        <span className="text-xs text-fg-muted">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="border-t border-app-border px-3 py-2 text-xs leading-relaxed text-fg-muted">
          {detail.isLoading && 'Loading…'}
          {detail.data?.desc && <p className="whitespace-pre-wrap">{detail.data.desc}</p>}
        </div>
      )}
    </li>
  );
}

export default function QuickReference({
  campaignId,
  open,
  onClose,
  onLog,
}: {
  campaignId: string;
  open: boolean;
  onClose: () => void;
  onLog: (text: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('conditions');
  const [q, setQ] = useState('');
  const conditions = useSrdList(open ? 'conditions' : '', { limit: '50' });
  const [npc, setNpc] = useState<QuickNpcResult>(() => rollQuickNpc());
  const createNpc = useCreateElement(campaignId);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [tavern, setTavern] = useState<string | null>(null);
  const [loot, setLoot] = useState<string | null>(null);
  const [hook, setHook] = useState<string | null>(null);

  const filteredActions = useMemo(
    () =>
      COMBAT_ACTIONS.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase())),
    [q],
  );
  const filteredConditions = useMemo(
    () =>
      (conditions.data?.results ?? []).filter((c) =>
        c.name.toLowerCase().includes(q.trim().toLowerCase()),
      ),
    [conditions.data, q],
  );

  if (!open) return null;

  const reroll = () => {
    setNpc(rollQuickNpc());
    setSavedName(null);
  };

  const npcSummary = (n: QuickNpcResult) =>
    `${n.name} — ${n.role}; ${n.quirk}; ${n.want}. Voice: ${n.voice}.`;

  const saveNpc = () =>
    createNpc.mutate(
      {
        type: 'npc',
        name: npc.name,
        body: null,
        tags: ['improvised'],
        playerVisible: false,
        secrets: '',
        data: {
          role: npc.role,
          summary: `${npc.quirk}; ${npc.want}`,
          mannerism: npc.voice,
          status: 'alive',
        },
        relationships: [],
      },
      { onSuccess: () => setSavedName(npc.name) },
    );

  const tabBtn = (t: Tab, label: string) => (
    <button
      key={t}
      onClick={() => setTab(t)}
      className={[
        'rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide',
        tab === t ? 'bg-brand text-app-bg' : 'text-fg-muted hover:text-fg',
      ].join(' ')}
    >
      {label}
    </button>
  );

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-app-border bg-app-surface shadow-2xl"
      role="dialog"
      aria-label="Quick reference"
    >
      <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
        <div className="flex items-center gap-1">
          {tabBtn('conditions', 'Conditions')}
          {tabBtn('actions', 'Actions')}
          {tabBtn('npc', 'Improv')}
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border border-app-border px-2.5 py-1 text-sm text-fg-muted hover:text-fg"
          aria-label="Close quick reference"
        >
          ✕
        </button>
      </div>

      {tab !== 'npc' && (
        <div className="border-b border-app-border px-4 py-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === 'conditions' ? 'Filter conditions…' : 'Filter actions…'}
            className="w-full rounded-lg border border-app-border bg-app-bg px-3 py-1.5 text-sm outline-none focus:border-brand"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'conditions' && (
          <>
            {conditions.isLoading && <p className="text-sm text-fg-muted">Loading…</p>}
            <ul className="space-y-1.5">
              {filteredConditions.map((c) => (
                <ConditionRow key={c.slug} slug={c.slug} name={c.name} />
              ))}
            </ul>
            {!conditions.isLoading && filteredConditions.length === 0 && (
              <p className="text-sm text-fg-muted">No conditions match.</p>
            )}
          </>
        )}

        {tab === 'actions' && (
          <ul className="space-y-2">
            {filteredActions.map((a) => (
              <li key={a.name} className="rounded-lg border border-app-border p-3">
                <div className="text-sm font-semibold">{a.name}</div>
                <p className="mt-1 text-xs leading-relaxed text-fg-muted">{a.text}</p>
              </li>
            ))}
            {filteredActions.length === 0 && (
              <p className="text-sm text-fg-muted">No actions match.</p>
            )}
          </ul>
        )}

        {tab === 'npc' && (
          <div>
            <p className="text-xs text-fg-muted">
              Players walked up to someone you didn&rsquo;t prep? Happens to every GM.
              Roll one, read it, play it.
            </p>
            <div className="mt-3 rounded-xl border border-app-border bg-app-bg p-4">
              <div className="font-heading text-lg font-bold">{npc.name}</div>
              <div className="text-xs uppercase tracking-wide text-fg-muted">{npc.role}</div>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">Quirk</dt>
                  <dd>{npc.quirk}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">Wants</dt>
                  <dd>{npc.want}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">Voice</dt>
                  <dd>{npc.voice}</dd>
                </div>
              </dl>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={reroll}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-app-bg hover:bg-brand-bright"
              >
                🎲 Reroll
              </button>
              <button
                onClick={() => onLog(`Met ${npcSummary(npc)}`)}
                className="rounded-lg border border-app-border px-3 py-1.5 text-sm text-fg-muted hover:text-fg"
              >
                Log to session
              </button>
              <button
                onClick={saveNpc}
                disabled={createNpc.isPending || savedName === npc.name}
                className="rounded-lg border border-app-border px-3 py-1.5 text-sm text-fg-muted hover:text-fg disabled:opacity-50"
              >
                {savedName === npc.name ? 'Saved ✓' : 'Save as NPC'}
              </button>
            </div>
            {createNpc.isError && (
              <p className="mt-2 text-xs text-red-400">Could not save — try again.</p>
            )}

            <div className="mt-5 space-y-3 border-t border-app-border pt-4">
              <GenRow
                label="Tavern"
                value={tavern}
                onRoll={() => setTavern(randomTavern())}
                onLog={tavern ? () => onLog(`Tavern: ${tavern}`) : undefined}
              />
              <GenRow
                label="Pocket loot"
                value={loot}
                onRoll={() => setLoot(randomLoot())}
                onLog={loot ? () => onLog(`Loot found: ${loot}`) : undefined}
              />
              <GenRow
                label="Plot hook"
                value={hook}
                onRoll={() => setHook(randomPlotHook())}
                onLog={hook ? () => onLog(`Hook dropped: ${hook}`) : undefined}
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
