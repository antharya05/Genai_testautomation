import { createContext, useContext, useState, type ReactNode } from 'react';

export interface AuthUser {
  email: string;
  name: string;
  isDemo: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signInDemo: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);
const SESSION_KEY = 'autotest_session';

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

  async function signIn(email: string, _password: string): Promise<void> {
    // Demo-mode: any valid email is accepted
    const u: AuthUser = { email, name: nameFromEmail(email), isDemo: false };
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u);
  }

  function signInDemo(): void {
    const u: AuthUser = { email: 'demo@autotest.ai', name: 'Demo User', isDemo: true };
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u);
  }

  function signOut(): void {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, signIn, signInDemo, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
