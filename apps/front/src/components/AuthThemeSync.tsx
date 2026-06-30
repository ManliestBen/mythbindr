import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../theme/ThemeProvider';
import { apiPatch } from '../lib/api';
import { isThemeId } from '../themes';

/**
 * Bridges auth <-> theme:
 *  - on sign-in, adopt the theme saved on the user's profile
 *  - when a signed-in user changes theme, persist it to the server
 * Renders nothing.
 */
export default function AuthThemeSync() {
  const { user } = useAuth();
  const { themeId, setThemeId } = useTheme();
  // The theme we last reconciled with the server, to avoid loops / repeat PATCHes.
  const synced = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      synced.current = null;
      return;
    }
    // First time we see this signed-in user: their saved theme wins.
    if (synced.current === null) {
      synced.current = user.theme;
      if (isThemeId(user.theme) && user.theme !== themeId) {
        setThemeId(user.theme);
      }
      return;
    }
    // Later local changes get pushed up.
    if (themeId !== synced.current) {
      synced.current = themeId;
      apiPatch('/api/auth/me', { theme: themeId }).catch(() => undefined);
    }
  }, [user, themeId, setThemeId]);

  return null;
}
