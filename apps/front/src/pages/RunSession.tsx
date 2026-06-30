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
    patch((s) => ({ ...s, combatants: s.combatants.map((c) => (c.cid === next.cid ? next : c)) }));
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
        </div>
        <div className="flex gap-2">
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
    </div>
  );
}
