import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { UserRole } from './demo-data';
import { loginApi } from './api-client';
// refreshTokenApi is available from './api-client' for future token refresh logic

export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; role?: UserRole }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Demo accounts — kept for backward compatibility (login page shows these)
const DEMO_ACCOUNTS: Array<{ email: string; password: string; user: AuthUser }> = [
  {
    email: 'anna@kungsholmen.se',
    password: 'Admin123456!',
    user: { id: 's1', displayName: 'Anna Adminsson', email: 'anna@kungsholmen.se', role: 'clinic_admin' },
  },
  {
    email: 'erik@kungsholmen.se',
    password: 'Staff123456!',
    user: { id: 's2', displayName: 'Erik Eriksson', email: 'erik@kungsholmen.se', role: 'staff' },
  },
  {
    email: 'maria@kungsholmen.se',
    password: 'Staff123456!',
    user: { id: 's3', displayName: 'Maria Johansson', email: 'maria@kungsholmen.se', role: 'staff' },
  },
  {
    email: 'anna.l@kungsholmen.se',
    password: 'Staff123456!',
    user: { id: 's4', displayName: 'Anna Lindberg', email: 'anna.l@kungsholmen.se', role: 'staff' },
  },
  {
    email: 'karl@kungsholmen.se',
    password: 'Staff123456!',
    user: { id: 's5', displayName: 'Karl Svensson', email: 'karl@kungsholmen.se', role: 'staff' },
  },
  {
    email: 'mattias.faldt@gmail.com',
    password: 'Gabbagabba1!',
    user: { id: 'sa1', displayName: 'Mattias Faldt', email: 'mattias.faldt@gmail.com', role: 'superadmin' },
  },
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string; role?: UserRole }> => {
    const trimmedEmail = email.trim().toLowerCase();

    // Try the real API first
    try {
      const result = await loginApi(trimmedEmail, password);

      if (result.success) {
        const { accessToken: at, refreshToken: rt, user: apiUser } = result.data;
        setAccessToken(at);
        setRefreshToken(rt);
        setUser({
          id: apiUser.id,
          displayName: apiUser.displayName,
          email: apiUser.email,
          role: apiUser.role as UserRole,
        });
        return { success: true, role: apiUser.role as UserRole };
      }

      // API returned an explicit error (credentials wrong, etc.)
      return { success: false, error: result.error.message };
    } catch {
      // Network error or API unavailable — fall back to demo accounts
    }

    // Demo fallback
    const account = DEMO_ACCOUNTS.find(a => a.email === trimmedEmail);

    if (!account || account.password !== password) {
      return { success: false, error: 'Felaktig e-post eller lösenord' };
    }

    setUser(account.user);
    setAccessToken(null); // no real token in demo mode
    setRefreshToken(null);
    return { success: true, role: account.user.role };
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, isAuthenticated: user !== null, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { DEMO_ACCOUNTS };
