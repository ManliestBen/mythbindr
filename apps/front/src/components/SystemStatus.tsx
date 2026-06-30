import { useEffect, useState } from 'react';

type Health = { status: string; db: string; dbName: string; env: string };
type State =
  | { kind: 'loading' }
  | { kind: 'ok'; health: Health }
  | { kind: 'offline' };

/**
 * Small connectivity indicator in the sidebar footer. On the Netlify-deployed
 * client (no backend yet) this simply reads "API offline", which is expected.
 */
export default function SystemStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((health: Health) => active && setState({ kind: 'ok', health }))
      .catch(() => active && setState({ kind: 'offline' }));
    return () => {
      active = false;
    };
  }, []);

  const dot =
    state.kind === 'ok'
      ? 'bg-emerald-500'
      : state.kind === 'offline'
        ? 'bg-app-border'
        : 'bg-fg-muted';

  const label =
    state.kind === 'loading'
      ? 'Checking API…'
      : state.kind === 'ok'
        ? `API ok · DB ${state.health.db}`
        : 'API offline';

  return (
    <div className="flex items-center gap-2 text-xs text-fg-muted">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span>{label}</span>
    </div>
  );
}
