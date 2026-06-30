import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { apiGet, apiPost } from '../lib/api';

/** Matches GET /api/integrations/spotify/status. */
type SpotifyStatus =
  | { connected: false; configured: boolean }
  | {
      connected: true;
      configured: boolean;
      productTier: string;
      premium: boolean;
      displayName: string | null;
      spotifyUserId: string | null;
      connectedAt: string | null;
      scope: string | null;
    };

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; status: SpotifyStatus }
  | { kind: 'error'; message: string };

/** Friendly copy for the ?reason= codes the callback can redirect back with. */
const REASONS: Record<string, string> = {
  missing_params: 'Spotify did not return the expected response.',
  bad_state: 'The connection request expired or was invalid — please try again.',
  exchange_failed: 'Could not complete the connection with Spotify — please try again.',
  access_denied: 'You declined the Spotify authorization.',
};

/**
 * Admin-only Settings → Integrations panel for Spotify (PLAN.md §5.12a).
 * Renders nothing for non-admins; the server also enforces admin on every route.
 */
export default function SpotifyIntegration() {
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;

  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();

  const refresh = useCallback(async () => {
    const status = await apiGet<SpotifyStatus>('/api/integrations/spotify/status');
    setState({ kind: 'ok', status });
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    apiGet<SpotifyStatus>('/api/integrations/spotify/status')
      .then((status) => active && setState({ kind: 'ok', status }))
      .catch(
        (err) =>
          active &&
          setState({
            kind: 'error',
            message:
              err instanceof Error ? err.message : 'Failed to load Spotify status',
          }),
      );
    return () => {
      active = false;
    };
  }, [isAdmin]);

  // The OAuth callback redirects back to /settings?spotify=connected|error.
  const outcome = params.get('spotify');
  const reason = params.get('reason');
  const dismissBanner = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete('spotify');
    next.delete('reason');
    next.delete('tier');
    setParams(next, { replace: true });
  }, [params, setParams]);

  if (!isAdmin) return null;

  const connect = () => {
    // Full-page navigation (not fetch): same-origin so the session cookie rides
    // along through the dev proxy, then the backend 302s to Spotify's consent page.
    window.location.href = '/api/integrations/spotify/login';
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await apiPost('/api/integrations/spotify/disconnect');
      await refresh();
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Disconnect failed',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-8">
      <h2 className="font-heading text-lg font-bold">Integrations</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Connect external services to MythBindr. Spotify lets you attach soundtracks
        to scenes and control playback during a session.
      </p>

      {outcome === 'connected' && (
        <Banner tone="ok" onDismiss={dismissBanner}>
          Spotify connected.
        </Banner>
      )}
      {outcome === 'error' && (
        <Banner tone="error" onDismiss={dismissBanner}>
          {REASONS[reason ?? ''] ?? 'Could not connect Spotify — please try again.'}
        </Banner>
      )}

      <div className="mt-3 rounded-xl border border-app-border bg-app-surface p-4">
        {state.kind === 'loading' && (
          <p className="text-sm text-fg-muted">Checking Spotify connection…</p>
        )}

        {state.kind === 'error' && (
          <p className="text-sm text-red-400">{state.message}</p>
        )}

        {state.kind === 'ok' && !state.status.configured && (
          <Row
            title="Spotify"
            subtitle="Unavailable — the server has no Spotify credentials configured."
            action={
              <button
                disabled
                className="rounded-lg border border-app-border px-3 py-1.5 text-sm text-fg-muted opacity-50"
              >
                Connect
              </button>
            }
          />
        )}

        {state.kind === 'ok' && state.status.configured && state.status.connected && (
          <Row
            title="Spotify"
            badge={
              <span
                className={[
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  state.status.premium
                    ? 'bg-brand/15 text-brand'
                    : 'bg-app-surface2 text-fg-muted',
                ].join(' ')}
              >
                {state.status.premium ? 'Premium' : state.status.productTier}
              </span>
            }
            subtitle={
              `Connected${state.status.displayName ? ` as ${state.status.displayName}` : ''}.` +
              (state.status.premium
                ? ''
                : ' In-app playback requires Spotify Premium.')
            }
            action={
              <button
                onClick={disconnect}
                disabled={busy}
                className="rounded-lg border border-app-border px-3 py-1.5 text-sm text-fg-muted hover:text-fg disabled:opacity-50"
              >
                {busy ? 'Disconnecting…' : 'Disconnect'}
              </button>
            }
          />
        )}

        {state.kind === 'ok' && state.status.configured && !state.status.connected && (
          <Row
            title="Spotify"
            subtitle="Not connected. Link your Spotify account to use soundtracks during a session."
            action={
              <button
                onClick={connect}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-app-bg hover:bg-brand-bright"
              >
                Connect
              </button>
            }
          />
        )}
      </div>
    </section>
  );
}

function Row({
  title,
  subtitle,
  badge,
  action,
}: {
  title: string;
  subtitle: string;
  badge?: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-medium">{title}</span>
          {badge}
        </div>
        <p className="mt-1 text-xs text-fg-muted">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function Banner({
  tone,
  onDismiss,
  children,
}: {
  tone: 'ok' | 'error';
  onDismiss: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={[
        'mt-3 flex items-center justify-between gap-4 rounded-lg border px-3 py-2 text-sm',
        tone === 'ok'
          ? 'border-emerald-600/40 text-emerald-400'
          : 'border-red-600/40 text-red-400',
      ].join(' ')}
    >
      <span>{children}</span>
      <button
        onClick={onDismiss}
        className="text-xs text-fg-muted hover:text-fg"
        aria-label="Dismiss"
      >
        Dismiss
      </button>
    </div>
  );
}
