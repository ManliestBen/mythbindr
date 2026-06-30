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
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';
import { apiGet, apiPost } from '../lib/api';

export interface AuthUser {
  id: string;
  displayName: string;
  isAdmin: boolean;
  theme: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean; // initial /me check
  busy: boolean; // a register/login/logout call is in flight
  error: string | null;
  register: (displayName: string) => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

type MeResponse = { user: AuthUser | null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<MeResponse>('/api/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const register = useCallback(async (displayName: string) => {
    setBusy(true);
    setError(null);
    try {
      const options = await apiPost('/api/auth/register/options', {
        displayName,
      });
      const attResp = await startRegistration({ optionsJSON: options as never });
      const { user } = await apiPost<MeResponse>(
        '/api/auth/register/verify',
        attResp,
      );
      setUser(user);
    } catch (err) {
      setError(toMessage(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const login = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const options = await apiPost('/api/auth/login/options');
      const authResp = await startAuthentication({
        optionsJSON: options as never,
      });
      const { user } = await apiPost<MeResponse>(
        '/api/auth/login/verify',
        authResp,
      );
      setUser(user);
    } catch (err) {
      setError(toMessage(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setBusy(true);
    try {
      await apiPost('/api/auth/logout');
    } finally {
      setUser(null);
      setBusy(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      busy,
      error,
      register,
      login,
      logout,
      clearError: () => setError(null),
    }),
    [user, loading, busy, error, register, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

function toMessage(err: unknown): string {
  if (err instanceof Error) {
    // Common WebAuthn cancellations.
    if (err.name === 'NotAllowedError') {
      return 'Passkey prompt was dismissed or timed out. Please try again.';
    }
    return err.message;
  }
  return 'Something went wrong.';
}
