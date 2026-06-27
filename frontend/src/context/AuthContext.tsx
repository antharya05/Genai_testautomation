import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  checkSession, clearToken, getAuthSession, getToken, login, loginEmail,
  registerEmail, serverLogout, setToken,
} from '../api/client';

export interface AuthUser {
  email: string;
  name: string;
  isDemo: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  signInDemo: () => Promise<void>;
  completeOAuth: (token: string) => Promise<void>;
  /** Adopt a session token already stored client-side (e.g. after password reset). */
  adoptSession: () => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);
const SESSION_KEY = 'autotest_session';

// Demo password — used by the "Access Demo" button. Operators enable the demo
// flow by setting APP_PASSWORD to this value (or override via VITE_DEMO_PASSWORD).
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD ?? 'autotest-demo';

function loadSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch { return null; }
}

function nameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadSession);
  const [ready, setReady] = useState(false);

  // On mount, only trust a stored session if its token still validates server-side.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (getToken() && loadSession()) {
        const ok = await checkSession();
        if (!cancelled && !ok) {
          clearToken();
          localStorage.removeItem(SESSION_KEY);
          setUser(null);
        }
      } else if (loadSession()) {
        // Session JSON without a valid token — stale; drop it.
        localStorage.removeItem(SESSION_KEY);
        setUser(null);
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  async function persist(email: string, isDemo: boolean, name?: string): Promise<void> {
    const u: AuthUser = { email, name: name || nameFromEmail(email), isDemo };
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u);
  }

  async function signIn(email: string, password: string): Promise<void> {
    const r = await loginEmail(email, password); // throws on invalid credentials
    await persist(r.user.email ?? email, false, r.user.display_name ?? undefined);
  }

  async function register(name: string, email: string, password: string): Promise<void> {
    const r = await registerEmail(email, password, name); // throws on 409/422
    await persist(r.user.email ?? email, false, r.user.display_name ?? name);
  }

  async function signInDemo(): Promise<void> {
    await login(DEMO_PASSWORD, 'demo@autotest.ai'); // throws if demo not enabled
    await persist('demo@autotest.ai', true);
  }

  // After a flow stored a session token itself (e.g. password reset), hydrate the
  // user from the server session.
  async function adoptSession(): Promise<void> {
    const s = await getAuthSession();
    await persist(s.user.email ?? s.user.display_name ?? 'user', false, s.user.display_name ?? undefined);
  }

  // Finish an OAuth login: the backend redirected back with a session token in
  // the URL fragment; store it and hydrate the user from the server session.
  async function completeOAuth(token: string): Promise<void> {
    setToken(token);
    const s = await getAuthSession();
    await persist(s.user.email ?? s.user.display_name ?? 'user', false);
  }

  function signOut(): void {
    void serverLogout();  // revoke the server-side session (best effort)
    clearToken();
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, ready, signIn, register, signInDemo, completeOAuth, adoptSession, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
