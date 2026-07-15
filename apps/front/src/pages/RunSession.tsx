import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  useEndSession,
  useSession,
  useStartSession,
  useUpdateSession,
  type Combatant,
  type GameSessionT,
} from '../data/session';
import CombatantCard from '../components/session/CombatantCard';
import AddCombatant from '../components/session/AddCombatant';
import DiceRoller from '../components/session/DiceRoller';
import RollLog from '../components/session/RollLog';
import SpotifyPlayer from '../components/session/SpotifyPlayer';
import QuickReference from '../components/session/QuickReference';
import PartyGlance from '../components/session/PartyGlance';
import { useAuth } from '../auth/AuthProvider';

function sortByInit(cs: Combatant[]): Combatant[] {
  return [...cs].sort((a, b) => b.initiative - a.initiative);
}

export default function RunSession() {
  const { cid } = useParams();
  const [params] = useSearchParams();
  const fromEncounter = params.get('from') ?? undefined;
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: loaded, isLoading } = useSession(cid ?? '');
  const start = useStartSession(cid ?? '');
  const update = useUpdateSession(cid ?? '');
  const end = useEndSession(cid ?? '');

  const [session, setSession] = useState<GameSessionT | null>(null);
  const [refOpen, setRefOpen] = useState(false);

  // Table hotkeys — routed through refs because the turn handlers close over
  // the current session state further down.
  const nextTurnRef = useRef<() => void>(() => {});
  const prevTurnRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        t?.isContentEditable
      ) {
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'n' || e.key === 'ArrowRight') {
        e.preventDefault();
        nextTurnRef.current();
      } else if (k === 'p' || e.key === 'ArrowLeft') {
        e.preventDefault();
        prevTurnRef.current();
      } else if (k === 'r') {
        e.preventDefault();
        setRefOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (loaded) setSession(loaded);
    // re-init only when the active session identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded?.id]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(
    (next: GameSessionT) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        update.mutate({
          sid: next.id,
          patch: {
            round: next.round,
            turnIndex: next.turnIndex,
            combatants: next.combatants,
            log: next.log,
          },
        });
      }, 800);
    },
    [update],
  );

  const patch = useCallback(
    (updater: (s: GameSessionT) => GameSessionT) =>
      setSession((cur) => {
        if (!cur) return cur;
        const next = updater(cur);
        persist(next);
        return next;
      }),
    [persist],
  );

  const addLog = useCallback(
    (kind: 'roll' | 'note' | 'event', text: string) =>
      patch((s) => ({
        ...s,
        log: [
          ...s.log,
          { kind, text, by: user?.displayName, at: new Date().toISOString() },
        ].slice(-500),
      })),
    [patch, user],
  );

  if (isLoading && !session) return <p className="text-sm text-fg-muted">Loading…</p>;

  if (!session) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-heading text-2xl font-bold">Run Session</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Start a live session to track initiative, HP, and conditions at the table.
        </p>
        <button
          onClick={() => start.mutate(fromEncounter, { onSuccess: (s) => setSession(s) })}
          disabled={start.isPending}
          className="mt-4 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-app-bg hover:bg-brand-bright disabled:opacity-50"
        >
          {start.isPending ? 'Starting…' : 'Start session'}
        </button>
      </div>
    );
  }

  const order = sortByInit(session.combatants);
  const currentCid = order.length ? order[session.turnIndex % order.length]?.cid : null;

  const changeCombatant = (next: Combatant) =>
    patch((s) => {
      const before = sortByInit(s.combatants);
      const onTurn = before.length ? before[s.turnIndex % before.length]?.cid : null;
      const combatants = s.combatants.map((c) => (c.cid === next.cid ? next : c));
      // Editing initiative re-sorts the order, which would otherwise slide the
      // turn pointer onto whoever now occupies that slot. Follow the combatant
      // whose turn it actually is.
      const after = sortByInit(combatants);
      const ti = onTurn ? after.findIndex((c) => c.cid === onTurn) : -1;
      return { ...s, combatants, turnIndex: ti >= 0 ? ti : s.turnIndex };
    });
  const removeCombatant = (rm: string) =>
    patch((s) => ({ ...s, combatants: s.combatants.filter((c) => c.cid !== rm) }));
  const addCombatant = (c: Combatant) =>
    patch((s) => ({ ...s, combatants: [...s.combatants, c] }));

  const nextTurn = () =>
    patch((s) => {
      const ord = sortByInit(s.combatants);
      if (ord.length === 0) return s;
      let ti = s.turnIndex + 1;
      let round = s.round;
      if (ti >= ord.length) {
        ti = 0;
        round += 1;
      }
      // Tick the new current combatant's timed conditions at the start of their turn.
      const currentId = ord[ti].cid;
      const combatants = s.combatants.map((c) =>
        c.cid === currentId
          ? {
              ...c,
              conditions: c.conditions
                .map((x) => (x.rounds == null ? x : { ...x, rounds: x.rounds - 1 }))
                .filter((x) => x.rounds == null || x.rounds > 0),
            }
          : c,
      );
      const log =
        ti === 0
          ? [
              ...s.log,
              {
                kind: 'event' as const,
                text: `Round ${round} begins`,
                by: user?.displayName,
                at: new Date().toISOString(),
              },
            ].slice(-500)
          : s.log;
      return { ...s, turnIndex: ti, round, combatants, log };
    });

  /**
   * Step the turn pointer back. Deliberately does not un-tick conditions:
   * nextTurn drops them once they expire, so there is nothing left to restore.
   * This walks the order back, it does not undo the turn.
   */
  const prevTurn = () =>
    patch((s) => {
      const ord = sortByInit(s.combatants);
      if (ord.length === 0) return s;
      if (s.turnIndex <= 0 && s.round <= 1) return s; // already at the top of round 1
      if (s.turnIndex > 0) return { ...s, turnIndex: s.turnIndex - 1 };
      return { ...s, turnIndex: ord.length - 1, round: Math.max(1, s.round - 1) };
    });

  nextTurnRef.current = nextTurn;
  prevTurnRef.current = prevTurn;

  const atStart = session.turnIndex <= 0 && session.round <= 1;

  const endSession = () => {
    if (!window.confirm('End this session?')) return;
    end.mutate(session.id, {
      onSuccess: () => {
        setSession(null);
        navigate(`/campaigns/${cid}`);
      },
    });
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.15em] text-fg-muted">Run Session</p>
          <h1 className="text-2xl font-bold">Round {session.round}</h1>
          <p className="mt-0.5 hidden text-[10px] text-fg-muted lg:block">
            Hotkeys: <kbd className="rounded border border-app-border px-1">N</kbd> next ·{' '}
            <kbd className="rounded border border-app-border px-1">P</kbd> previous ·{' '}
            <kbd className="rounded border border-app-border px-1">R</kbd> reference
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SaveStatus pending={update.isPending} error={update.isError} />
          <button
            onClick={() => setRefOpen((v) => !v)}
            title="Rules quick reference: conditions, combat actions, and an instant NPC"
            className={[
              'rounded-lg border px-3 py-2 text-sm font-semibold',
              refOpen
                ? 'border-brand text-brand'
                : 'border-app-border text-fg hover:border-brand hover:text-brand',
            ].join(' ')}
          >
            📖 Reference
          </button>
          <button
            onClick={prevTurn}
            disabled={atStart}
            title={atStart ? 'Already at the start of round 1' : 'Previous turn'}
            className="rounded-lg border border-app-border px-3 py-2 text-sm font-semibold text-fg hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-app-border disabled:hover:text-fg"
          >
            ← Previous
          </button>
          <button
            onClick={nextTurn}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-app-bg hover:bg-brand-bright"
          >
            Next turn →
          </button>
          <button
            onClick={endSession}
            className="rounded-lg border border-app-border px-3 py-2 text-sm text-fg-muted hover:text-fg"
          >
            End
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          <PartyGlance
            campaignId={cid ?? ''}
            combatants={session.combatants}
            onAdd={addCombatant}
          />
          {order.map((c) => (
            <CombatantCard
              key={c.cid}
              c={c}
              isCurrent={c.cid === currentCid}
              onChange={changeCombatant}
              onRemove={() => removeCombatant(c.cid)}
            />
          ))}
          {order.length === 0 && (
            <p className="text-sm text-fg-muted">No combatants yet — add some below.</p>
          )}
          <AddCombatant onAdd={addCombatant} />
        </div>

        <div className="space-y-4">
          {user?.isAdmin && <SpotifyPlayer campaignId={cid ?? ''} />}
          <DiceRoller onRoll={(t) => addLog('roll', t)} />
          <RollLog log={session.log} onNote={(t) => addLog('note', t)} />
        </div>
      </div>

      <QuickReference
        campaignId={cid ?? ''}
        open={refOpen}
        onClose={() => setRefOpen(false)}
        onLog={(t) => addLog('note', t)}
      />
    </div>
  );
}

/** Saves are debounced and fire in the background — say so, and never fail silently. */
function SaveStatus({ pending, error }: { pending: boolean; error: boolean }) {
  if (error) {
    return (
      <span
        title="The last change could not be saved. Your next edit will retry."
        className="rounded-lg bg-red-500/15 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-red-400"
      >
        Not saved
      </span>
    );
  }
  return (
    <span className="text-[11px] uppercase tracking-wide text-fg-muted">
      {pending ? 'Saving…' : 'Saved'}
    </span>
  );
}
