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
import { useSessionChannel } from '../realtime/useSessionChannel';
import CombatantCard from '../components/session/CombatantCard';
import AddCombatant from '../components/session/AddCombatant';
import DiceRoller from '../components/session/DiceRoller';
import RollLog from '../components/session/RollLog';
import SpotifyPlayer from '../components/session/SpotifyPlayer';
import QuickReference from '../components/session/QuickReference';
import PartyGlance from '../components/session/PartyGlance';
import { useAuth } from '../auth/AuthProvider';
import { useCreateElement } from '../data/elements';
import { useToast } from '../components/ToastProvider';

function sortByInit(cs: Combatant[]): Combatant[] {
  return [...cs].sort((a, b) => b.initiative - a.initiative);
}

export default function RunSession() {
  const { cid } = useParams();
  const [params] = useSearchParams();
  const fromEncounter = params.get('from') ?? undefined;
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const { data: loaded, isLoading } = useSession(cid ?? '');
  const start = useStartSession(cid ?? '');
  // Fallback-only from here on (docs/design/live-session.md § Cache
  // reconciliation): live edits go through `channel.dispatch`, which emits
  // named ops over the socket. `useUpdateSession`'s wholesale PATCH is used
  // only while the socket is disconnected (or still (re)joining) — see
  // `persist` below, which is handed to `useSessionChannel` as
  // `onFallbackPersist`.
  const update = useUpdateSession(cid ?? '');
  // Fallback-only too: `session:end` is dispatched over the socket when
  // live; this REST mutation only fires from `finishSession`'s fallback
  // branch.
  const end = useEndSession(cid ?? '');

  const [dirty, setDirty] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [recap, setRecap] = useState('');
  const [saveRecap, setSaveRecap] = useState(true);
  const createNote = useCreateElement(cid ?? '');

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** Legacy debounced-PATCH fallback — only invoked by `useSessionChannel`
   *  while `status === 'fallback'` (socket disconnected or not yet joined). */
  const persist = useCallback(
    (next: GameSessionT) => {
      if (timer.current) clearTimeout(timer.current);
      setDirty(true);
      timer.current = setTimeout(() => {
        timer.current = null;
        update.mutate(
          {
            sid: next.id,
            patch: {
              round: next.round,
              turnIndex: next.turnIndex,
              combatants: next.combatants,
              log: next.log,
            },
          },
          {
            // Only clear dirty when no newer edit is buffered; otherwise a
            // stale mutation settling would flash "Saved" while an edit is
            // still waiting out the debounce.
            onSettled: () => {
              if (!timer.current) setDirty(false);
            },
          },
        );
      }, 800);
    },
    [update],
  );

  const channel = useSessionChannel(cid, persist);
  const session = channel.session;

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
    if (loaded) channel.seed(loaded);
    // re-seed only when the active session identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded?.id]);

  useEffect(() => {
    if (channel.errorToken > 0) {
      toast("That change didn't save — the table's current state has been restored.", {
        kind: 'error',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.errorToken]);

  const addLog = useCallback(
    (kind: 'roll' | 'note' | 'event', text: string) =>
      channel.dispatch({
        kind: 'appendLog',
        entry: { kind, text, by: user?.displayName, at: new Date().toISOString() },
      }),
    [channel, user],
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
          onClick={() => start.mutate(fromEncounter, { onSuccess: (s) => channel.seed(s) })}
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

  /** Every field but `cid` — the reducer's `updateCombatant` op merges this
   *  over the held combatant (`{...c, ...patch}`), so shipping the whole
   *  next object (minus `cid`) needs no per-field intent-guessing about
   *  which control on `CombatantCard` produced the change; its `onChange`
   *  prop signature stays exactly `(next: Combatant) => void`. Damage/heal
   *  do NOT come through here — they're relative deltas via `onApplyDelta`
   *  → the `applyDamage` op, so concurrent damage from two editors sums
   *  server-side instead of last-writer-wins on an absolute `currentHp`. */
  const patchOf = (next: Combatant): Partial<Omit<Combatant, 'cid'>> => {
    const { cid: _cid, ...patch } = next;
    return patch;
  };

  const changeCombatant = (next: Combatant) =>
    channel.dispatch({ kind: 'updateCombatant', cid: next.cid, patch: patchOf(next) });
  const removeCombatant = (rm: string) => channel.dispatch({ kind: 'removeCombatant', cid: rm });
  const addCombatant = (c: Combatant) => channel.dispatch({ kind: 'addCombatant', combatant: c });

  /** "Another goblin joins!" — copy at full HP, fresh initiative, numbered name. */
  const duplicateCombatant = (src: Combatant) => {
    const base = src.name.replace(/\s+\d+$/, '');
    const taken = session.combatants.map((x) => {
      if (x.name === base) return 1;
      if (!x.name.startsWith(`${base} `)) return 0;
      const suffix = x.name.slice(base.length + 1);
      return /^\d+$/.test(suffix) ? parseInt(suffix, 10) : 0;
    });
    const next = Math.max(1, ...taken) + 1;
    const copy: Combatant = {
      ...src,
      cid: crypto.randomUUID(),
      name: `${base} ${next}`,
      initiative: Math.floor(Math.random() * 20) + 1,
      currentHp: src.maxHp || src.currentHp,
      tempHp: 0,
      conditions: [],
      deathSaves: { successes: 0, failures: 0 },
    };
    channel.dispatch({ kind: 'addCombatant', combatant: copy });
  };

  // Turn-order bookkeeping (advancing/rewinding, condition ticking, the
  // "follow whose turn it is" logic on add/remove/reorder) all now lives
  // once, in the shared reducer (`@mythbindr/shared/combat`'s `applyOp`) —
  // the exact function the server runs — so it isn't reimplemented here.
  const nextTurn = () => channel.dispatch({ kind: 'nextTurn' });

  /**
   * Step the turn pointer back. Deliberately does not un-tick conditions:
   * nextTurn drops them once they expire, so there is nothing left to restore.
   * This walks the order back, it does not undo the turn.
   */
  const prevTurn = () => channel.dispatch({ kind: 'prevTurn' });

  nextTurnRef.current = nextTurn;
  prevTurnRef.current = prevTurn;

  const atStart = session.turnIndex <= 0 && session.round <= 1;

  const finishSession = async () => {
    if (channel.status === 'fallback' && timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      await update
        .mutateAsync({
          sid: session.id,
          patch: {
            round: session.round,
            turnIndex: session.turnIndex,
            combatants: session.combatants,
            log: session.log,
          },
        })
        .catch(() => {
          /* ending anyway; the end call is the priority */
        });
    }
    if (saveRecap) {
      const highlights = session.log
        .filter((l) => l.kind !== 'roll')
        .slice(-15)
        .map((l) => `• ${l.text}`)
        .join('\n');
      const bodyParts = [
        recap.trim(),
        highlights ? `Highlights:\n${highlights}` : '',
        `(${session.round} round${session.round === 1 ? '' : 's'}, ${session.combatants.length} combatants)`,
      ].filter(Boolean);
      try {
        await createNote.mutateAsync({
          type: 'note',
          name: `Session recap — ${new Date().toLocaleDateString()}`,
          body: bodyParts.join('\n\n'),
          tags: ['session-recap'],
          playerVisible: false,
          secrets: '',
          data: {},
          relationships: [],
        });
      } catch {
        /* the recap is a bonus — never block ending the session on it */
      }
    }
    if (channel.status === 'live') {
      // The end op serializes after every op already emitted on this socket
      // (Socket.IO preserves per-connection order; the room applies ops in
      // receipt order) — nothing to await, just fire it and leave.
      channel.dispatch({ kind: 'end' });
      navigate(`/campaigns/${cid}`);
    } else {
      end.mutate(session.id, {
        onSuccess: () => navigate(`/campaigns/${cid}`),
      });
    }
  };

  const saving =
    channel.pendingCount > 0 || (channel.status === 'fallback' && (dirty || update.isPending));
  const saveError = channel.hasError || (channel.status === 'fallback' && update.isError);

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
          {channel.status === 'fallback' && (
            <span
              title="Reconnecting — edits are saved locally and will sync once the connection is back."
              className="rounded-lg bg-amber-500/15 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-400"
            >
              Offline
            </span>
          )}
          <SaveStatus pending={saving} error={saveError} />
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
            onClick={() => setEnding(true)}
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
              onApplyDelta={(amount) =>
                channel.dispatch({ kind: 'applyDamage', cid: c.cid, amount })
              }
              onRemove={() => removeCombatant(c.cid)}
              onDuplicate={() => duplicateCombatant(c)}
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

      {ending && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4"
          onMouseDown={(e) => e.target === e.currentTarget && setEnding(false)}
          role="dialog"
          aria-label="End session"
        >
          <div className="w-full max-w-md rounded-xl border border-app-border bg-app-surface p-5 shadow-2xl">
            <h2 className="font-heading text-lg font-bold">End this session?</h2>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saveRecap}
                onChange={(e) => setSaveRecap(e.target.checked)}
                className="accent-brand"
              />
              Save a recap note (log highlights included)
            </label>
            {saveRecap && (
              <textarea
                value={recap}
                onChange={(e) => setRecap(e.target.value)}
                rows={3}
                placeholder="What happened tonight? Two sentences is plenty — future-you will be grateful."
                className="mt-2 w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-brand"
              />
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEnding(false)}
                className="rounded-lg border border-app-border px-4 py-2 text-sm text-fg-muted hover:text-fg"
              >
                Keep playing
              </button>
              <button
                onClick={finishSession}
                disabled={end.isPending || createNote.isPending}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-app-bg hover:bg-brand-bright disabled:opacity-50"
              >
                {end.isPending || createNote.isPending ? 'Ending…' : 'End session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Saves are async and fire in the background — say so, and never fail silently. */
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
