import { useTheme } from '../theme/ThemeProvider';
import { THEMES, isThemeId } from '../themes';

/** Compact theme switcher for the top bar (the full picker is in Settings). */
export default function ThemeQuickSwitch() {
  const { themeId, setThemeId } = useTheme();

  return (
    <label className="flex items-center gap-2 text-xs text-fg-muted">
      <span className="hidden sm:inline">Theme</span>
      <select
        value={themeId}
        onChange={(e) => {
          if (isThemeId(e.target.value)) setThemeId(e.target.value);
        }}
        className="rounded-md border border-app-border bg-app-surface px-2 py-1 text-xs text-fg outline-none focus:border-brand"
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
