import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import type { ShareServerToClientEvents, SharedSessionView } from '@mythbindr/shared';
import { useShareCampaign } from '../data/share';

// The player-facing live table view for `ShareLink.scope: 'session'` links —
// see docs/design/live-session.md ("Player view & share scope"). Executor's
// choice per plan 012 Step 5: a dedicated page + route (`/share/:token/session`)
// rather than a tab bolted onto SharePage, so the campaign-lore view (static,
// REST-only) and the live-table view (a standing socket connection) stay
// independent — a visitor with only a campaign-lore link never opens a socket.

type ShareSocket = Socket<ShareServerToClientEvents, Record<string, never>>;

type Phase = 'connecting' | 'connected' | 'invalid';

function sortByInit(cs: SharedSessionView['combatants']): SharedSessionView['combatants'] {
  return [...cs].sort((a, b) => b.initiative - a.initiative);
}

export default function ShareSessionView() {
  const { token } = useParams();
  const camp = useShareCampaign(token ?? '');
  const [phase, setPhase] = useState<Phase>('connecting');
  const [session, setSession] = useState<SharedSessionView | null>(null);

  useEffect(() => {
    if (!token) return;
    // A dedicated connection to the read-only /share namespace — deliberately
    // NOT the shared getSocket() client: no cookie, no main-namespace auth,
    // and this namespace has no mutation handlers to accidentally reuse.
    const socket = io('/share', { path: '/socket.io', auth: { token } }) as ShareSocket;

    const onState: ShareServerToClientEvents['session:state'] = (p) => {
      setPhase('connected');
      setSession(p.session);
    };
    const onNone: ShareServerToClientEvents['session:none'] = () => {
      setPhase('connected');
      setSession(null);
    };
    // Revoked/expired token, or the per-IP handshake cooldown/per-token cap —
    // all surface as a connect_error; render the same invalid-link state the
    // REST-backed campaign-lore share page uses (docs/design/live-session.md).
    const onConnectError = () => setPhase('invalid');

    socket.on('session:state', onState);
    socket.on('session:none', onNone);
    socket.on('connect_error', onConnectError);

    return () => {
      socket.off('session:state', onState);
      socket.off('session:none', onNone);
      socket.off('connect_error', onConnectError);
      socket.disconnect();
    };
  }, [token]);

  if (phase === 'invalid') {
    return (
      <div className="grid min-h-screen place-items-center bg-app-bg px-6 text-center text-fg-muted">
        This share link is invalid or has expired.
      </div>
    );
  }

  if (phase === 'connecting') {
    return (
      <div className="grid min-h-screen place-items-center bg-app-bg text-fg-muted">
        Connecting…
      </div>
    );
  }

  const campaignName = camp.data?.campaign?.name;

  return (
    <div className="min-h-screen bg-app-bg text-fg">
      <header className="border-b border-app-border bg-app-surface px-4 py-4">
        <p className="text-[11px] uppercase tracking-[0.15em] text-fg-muted">Live table</p>
        <h1 className="font-heading text-2xl font-bold">{campaignName ?? 'The table'}</h1>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6">
        {!session && (
          <p className="text-sm text-fg-muted">
            No session running — check back when the GM starts one.
          </p>
        )}
        {session && <SessionBody session={session} />}
      </main>
    </div>
  );
}

function SessionBody({ session }: { session: SharedSessionView }) {
  if (session.status === 'ended') {
    return <p className="text-sm text-fg-muted">Session ended. Thanks for playing!</p>;
  }

  const order = sortByInit(session.combatants);

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
        Round {session.round}
      </p>

      <ul className="space-y-2">
        {order.map((c, i) => {
          const acting = i === session.turnIndex;
          const hasHp = c.maxHp !== undefined;
          return (
            <li
              key={c.cid}
              className={`rounded-xl border p-3 ${
                acting ? 'border-brand bg-app-surface2' : 'border-app-border bg-app-surface'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-6 shrink-0 text-right text-xs text-fg-muted">
                    {c.initiative}
                  </span>
                  <span className="truncate font-medium">{c.name}</span>
                  {!c.isPlayer && (
                    <span className="shrink-0 rounded-full bg-app-surface2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-fg-muted">
                      NPC
                    </span>
                  )}
                </div>
                {acting && (
                  <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-app-bg">
                    Acting
                  </span>
                )}
              </div>

              {/* Monster HP is hidden entirely (operator decision 2026-07-14) —
                  hasHp is only ever true for isPlayer: true combatants, because
                  sharedSession() never includes HP fields for anyone else. */}
              {hasHp && (
                <div className="mt-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-app-surface2">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(100, ((c.currentHp ?? 0) / Math.max(1, c.maxHp ?? 1)) * 100),
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-fg-muted">
                    {c.currentHp}/{c.maxHp} HP
                    {c.tempHp ? ` (+${c.tempHp} temp)` : ''}
                  </p>
                </div>
              )}

              {c.conditions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.conditions.map((cond, ci) => (
                    <span
                      key={ci}
                      className="rounded-full border border-app-border px-2 py-0.5 text-[10px] text-fg-muted"
                    >
                      {cond.name}
                      {cond.rounds != null ? ` (${cond.rounds})` : ''}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {session.log.length > 0 && (
        <section>
          <h2 className="mt-6 border-b border-app-border pb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Log
          </h2>
          <ul className="mt-2 space-y-1">
            {session.log
              .slice()
              .reverse()
              .map((l, i) => (
                <li key={i} className="text-sm text-fg-muted">
                  {l.by ? <span className="font-medium text-fg">{l.by}: </span> : null}
                  {l.text}
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
