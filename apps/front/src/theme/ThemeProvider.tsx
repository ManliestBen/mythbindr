import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_THEME_ID,
  getTheme,
  isThemeId,
  type ThemeId,
  type ThemeMeta,
} from '../themes';

const STORAGE_KEY = 'mythbindr-theme';

interface ThemeContextValue {
  themeId: ThemeId;
  theme: ThemeMeta;
  setThemeId: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): ThemeId {
  // The inline script in index.html already set data-theme before paint;
  // trust that, then fall back to storage, then the default.
  const fromDom = document.documentElement.getAttribute('data-theme');
  if (isThemeId(fromDom)) return fromDom;
  const fromStorage = localStorage.getItem(STORAGE_KEY);
  if (isThemeId(fromStorage)) return fromStorage;
  return DEFAULT_THEME_ID;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(readInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeId);
    // TODO(auth): once passkey auth lands, also persist the choice to the
    // signed-in user's profile (PLAN.md §5.2) instead of only localStorage.
    try {
      localStorage.setItem(STORAGE_KEY, themeId);
    } catch {
      /* ignore storage failures (private mode, etc.) */
    }
  }, [themeId]);

  const setThemeId = useCallback((id: ThemeId) => setThemeIdState(id), []);

  const value = useMemo<ThemeContextValue>(
    () => ({ themeId, theme: getTheme(themeId), setThemeId }),
    [themeId, setThemeId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
