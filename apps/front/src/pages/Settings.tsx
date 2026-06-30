import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../auth/AuthProvider';
import { THEMES, type ThemeMeta } from '../themes';
import SpotifyIntegration from '../components/SpotifyIntegration';

function ThemeCard({
  meta,
  active,
  onSelect,
}: {
  meta: ThemeMeta;
  active: boolean;
  onSelect: () => void;
}) {
  const [bg, surface, primary, accent, text] = meta.swatches;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={[
        'group rounded-xl border p-4 text-left transition',
        active
          ? 'border-brand ring-2 ring-brand'
          : 'border-app-border hover:border-fg-muted',
      ].join(' ')}
    >
      {/* Mini preview rendered in the card's OWN theme colors (not the active one). */}
      <div
        className="mb-3 overflow-hidden rounded-lg border"
        style={{ backgroundColor: bg, borderColor: surface }}
      >
        <div className="flex items-center justify-between px-3 py-2.5">
          <span
            style={{ color: text, fontFamily: `'${meta.headingFont}', serif` }}
            className="text-sm font-bold"
          >
            Myth<span style={{ color: primary }}>Bindr</span>
          </span>
          <span
            className="h-4 w-4 rounded"
            style={{ backgroundColor: accent }}
          />
        </div>
        <div className="flex gap-1.5 px-3 pb-3">
          {meta.swatches.map((c) => (
            <span
              key={c}
              className="h-4 flex-1 rounded"
              style={{ backgroundColor: c, outline: '1px solid rgba(128,128,128,.25)' }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-heading text-sm font-bold">{meta.name}</span>
        {active && (
          <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-app-bg">
            Active
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-fg-muted">{meta.mood}</p>
      <p className="mt-0.5 text-[11px] italic text-fg-muted">
        “{meta.tagline}”
      </p>
    </button>
  );
}

export default function Settings() {
  const { themeId, setThemeId } = useTheme();
  const { user, logout, busy } = useAuth();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {user && (
        <section className="mt-6">
          <h2 className="font-heading text-lg font-bold">Account</h2>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-app-border bg-app-surface p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{user.displayName}</span>
                {user.isAdmin && (
                  <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
                    Admin
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-fg-muted">
                Signed in with a passkey.
                {user.isAdmin
                  ? ' You can use AI features.'
                  : ' AI features are limited to admins.'}
              </p>
            </div>
            <button
              onClick={() => logout()}
              disabled={busy}
              className="rounded-lg border border-app-border px-3 py-1.5 text-sm text-fg-muted hover:text-fg disabled:opacity-50"
            >
              Sign out
            </button>
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-heading text-lg font-bold">Appearance</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Choose a theme. Your choice is saved on this device for now, and will
          follow your account once sign-in is added.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {THEMES.map((meta) => (
            <ThemeCard
              key={meta.id}
              meta={meta}
              active={meta.id === themeId}
              onSelect={() => setThemeId(meta.id)}
            />
          ))}
        </div>
      </section>

      {/* Admin-only; renders nothing for non-admins. */}
      <SpotifyIntegration />
    </div>
  );
}
