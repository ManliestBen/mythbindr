import { useState } from 'react';
import { useAuth } from './AuthProvider';
import { useTheme } from '../theme/ThemeProvider';

export default function AuthScreen() {
  const { register, login, busy, error, clearError } = useAuth();
  const { theme } = useTheme();
  const [mode, setMode] = useState<'signin' | 'create'>('signin');
  const [displayName, setDisplayName] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === 'create') await register(displayName.trim());
      else await login();
    } catch {
      /* error surfaced via context */
    }
  };

  const switchMode = (next: 'signin' | 'create') => {
    clearError();
    setMode(next);
  };

  return (
    <div className="grid min-h-screen place-items-center bg-app-bg px-4 text-fg">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl border border-app-border bg-app-surface2 font-heading text-2xl font-bold text-brand">
            M
          </div>
          <h1 className="font-heading text-2xl font-bold">
            Myth<span className="text-brand">Bindr</span>
          </h1>
          <p className="mt-1 text-sm italic text-fg-muted">{theme.tagline}</p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-app-border bg-app-surface p-6"
        >
          <div className="mb-5 flex rounded-lg border border-app-border p-1 text-sm">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className={`flex-1 rounded-md py-1.5 ${
                mode === 'signin' ? 'bg-app-surface2 text-fg' : 'text-fg-muted'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode('create')}
              className={`flex-1 rounded-md py-1.5 ${
                mode === 'create' ? 'bg-app-surface2 text-fg' : 'text-fg-muted'
              }`}
            >
              Create account
            </button>
          </div>

          {mode === 'create' && (
            <label className="mb-4 block">
              <span className="mb-1 block text-xs font-medium text-fg-muted">
                Display name
              </span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Ben the GM"
                autoFocus
                required
                className="w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-fg outline-none focus:border-brand"
              />
            </label>
          )}

          {error && (
            <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || (mode === 'create' && !displayName.trim())}
            className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-app-bg disabled:opacity-50"
          >
            {busy
              ? 'Waiting for passkey…'
              : mode === 'create'
                ? 'Create account with a passkey'
                : 'Sign in with a passkey'}
          </button>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-fg-muted">
            MythBindr uses passkeys — no passwords. Your device (Touch ID,
            Windows Hello, or your phone) verifies it's you.
          </p>
        </form>
      </div>
    </div>
  );
}
