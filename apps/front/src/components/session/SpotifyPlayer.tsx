import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useCampaign, useUpdateCampaign } from '../../data/campaigns';
import { useSpotifyPlaylists } from '../../data/spotify';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    Spotify?: any;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

type Phase = 'loading' | 'needs-connect' | 'ready' | 'error';
type MoodSlot = { label: string; spotifyUri: string };

async function fetchToken(): Promise<string | null> {
  const r = await fetch('/api/integrations/spotify/token', { credentials: 'include' });
  if (!r.ok) return null;
  const d = await r.json();
  return d.accessToken as string;
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-app-border bg-app-surface p-3">{children}</div>;
}

export default function SpotifyPlayer({ campaignId }: { campaignId: string }) {
  const campaign = useCampaign(campaignId);
  const updateCampaign = useUpdateCampaign(campaignId);
  const [phase, setPhase] = useState<Phase>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [now, setNow] = useState<{ track: string; artists: string; paused: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    let active = true;
    const init = () => {
      const player = new window.Spotify.Player({
        name: 'MythBindr',
        getOAuthToken: (cb: (t: string) => void) => fetchToken().then((t) => t && cb(t)),
        volume: 0.5,
      });
      player.addListener('ready', ({ device_id }: any) => {
        setDeviceId(device_id);
        setPhase('ready');
      });
      player.addListener('player_state_changed', (st: any) => {
        if (!st) return;
        const t = st.track_window?.current_track;
        if (t) {
          setNow({
            track: t.name,
            artists: (t.artists ?? []).map((a: any) => a.name).join(', '),
            paused: st.paused,
          });
        }
      });
      player.addListener('authentication_error', () => {
        setErrMsg('Spotify authentication error.');
        setPhase('error');
      });
      player.addListener('account_error', () => {
        setErrMsg('Spotify Premium is required for the in-app player.');
        setPhase('error');
      });
      player.addListener('initialization_error', ({ message }: any) => {
        setErrMsg(message || 'Could not initialize the Spotify player.');
        setPhase('error');
      });
      player.connect();
      playerRef.current = player;
    };

    const loadSdk = () => {
      if (window.Spotify) {
        init();
        return;
      }
      window.onSpotifyWebPlaybackSDKReady = init;
      if (!document.getElementById('spotify-sdk')) {
        const s = document.createElement('script');
        s.id = 'spotify-sdk';
        s.src = 'https://sdk.scdn.co/spotify-player.js';
        s.async = true;
        document.body.appendChild(s);
      }
    };

    fetchToken().then((t) => {
      if (!active) return;
      if (!t) setPhase('needs-connect');
      else loadSdk();
    });

    return () => {
      active = false;
      try {
        playerRef.current?.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const playSlot = async (uri: string) => {
    if (!deviceId || !uri) return;
    const tok = await fetchToken();
    if (!tok) return;
    const isContext = /:(playlist|album|artist):/.test(uri);
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(isContext ? { context_uri: uri } : { uris: [uri] }),
    });
  };

  const moodSlots: MoodSlot[] = campaign.data?.moodSlots ?? [];

  if (phase === 'needs-connect') {
    return (
      <Panel>
        <p className="text-sm text-fg-muted">
          Connect a Spotify <strong>Premium</strong> account in <strong>Settings → Integrations</strong>{' '}
          to use the in-session player.
        </p>
      </Panel>
    );
  }
  if (phase === 'error') {
    return (
      <Panel>
        <p className="text-sm text-red-400">{errMsg}</p>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Music</h3>
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-xs text-fg-muted hover:text-fg"
        >
          {editing ? 'Done' : 'Edit slots'}
        </button>
      </div>

      {phase === 'loading' && <p className="mt-2 text-xs text-fg-muted">Loading player…</p>}

      {phase === 'ready' && (
        <>
          <div className="mt-2 text-xs text-fg-muted">
            {now ? (
              <span>
                <span className="text-fg">{now.track}</span> — {now.artists}
              </span>
            ) : (
              'Pick a mood to start.'
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => playerRef.current?.previousTrack()}
              className="rounded-lg border border-app-border px-2 py-1 text-sm"
            >
              ⏮
            </button>
            <button
              onClick={() => playerRef.current?.togglePlay()}
              className="rounded-lg border border-app-border px-3 py-1 text-sm"
            >
              {now?.paused === false ? '⏸' : '▶'}
            </button>
            <button
              onClick={() => playerRef.current?.nextTrack()}
              className="rounded-lg border border-app-border px-2 py-1 text-sm"
            >
              ⏭
            </button>
            <input
              type="range"
              min={0}
              max={100}
              defaultValue={50}
              onChange={(e) => playerRef.current?.setVolume(Number(e.target.value) / 100)}
              className="ml-2 flex-1 accent-brand"
            />
          </div>
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {moodSlots.map((m, i) => (
          <button
            key={i}
            onClick={() => playSlot(m.spotifyUri)}
            disabled={!m.spotifyUri || phase !== 'ready'}
            className="rounded-lg border border-app-border px-2.5 py-1 text-xs hover:border-brand hover:text-brand disabled:opacity-50"
          >
            {m.label || 'Slot'}
          </button>
        ))}
        {moodSlots.length === 0 && !editing && (
          <p className="text-xs text-fg-muted">No mood slots — click “Edit slots”.</p>
        )}
      </div>

      {editing && (
        <MoodSlotEditor
          moodSlots={moodSlots}
          saving={updateCampaign.isPending}
          onSave={(slots) =>
            updateCampaign.mutate({ moodSlots: slots }, { onSuccess: () => setEditing(false) })
          }
        />
      )}
    </Panel>
  );
}

function MoodSlotEditor({
  moodSlots,
  onSave,
  saving,
}: {
  moodSlots: MoodSlot[];
  onSave: (slots: MoodSlot[]) => void;
  saving: boolean;
}) {
  const [slots, setSlots] = useState<MoodSlot[]>(moodSlots);
  const playlists = useSpotifyPlaylists(true);

  const update = (i: number, patch: Partial<MoodSlot>) =>
    setSlots((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="mt-3 space-y-2 border-t border-app-border pt-3">
      {slots.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={s.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="Label"
            className="w-24 rounded-lg border border-app-border bg-app-bg px-2 py-1 text-xs outline-none focus:border-brand"
          />
          {playlists.data && playlists.data.length > 0 ? (
            <select
              value={s.spotifyUri}
              onChange={(e) => update(i, { spotifyUri: e.target.value })}
              className="flex-1 rounded-lg border border-app-border bg-app-bg px-1.5 py-1 text-xs outline-none focus:border-brand"
            >
              <option value="">Pick playlist…</option>
              {playlists.data.map((p) => (
                <option key={p.uri} value={p.uri}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={s.spotifyUri}
              onChange={(e) => update(i, { spotifyUri: e.target.value })}
              placeholder="spotify:playlist:…"
              className="flex-1 rounded-lg border border-app-border bg-app-bg px-2 py-1 text-xs outline-none focus:border-brand"
            />
          )}
          <button
            onClick={() => setSlots((s2) => s2.filter((_, j) => j !== i))}
            className="text-xs text-fg-muted hover:text-red-400"
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <button
          onClick={() => setSlots((s) => [...s, { label: '', spotifyUri: '' }])}
          className="text-xs text-fg-muted hover:text-fg"
        >
          + Add slot
        </button>
        <button
          onClick={() => onSave(slots.filter((s) => s.label.trim()))}
          disabled={saving}
          className="rounded-lg bg-brand px-3 py-1 text-xs font-semibold text-app-bg disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save slots'}
        </button>
      </div>
    </div>
  );
}
