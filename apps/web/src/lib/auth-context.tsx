import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { UserRole } from './demo-data';
import { loginApi } from './api-client';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string; role?: UserRole }> => {
    const trimmedEmail = email.trim().toLowerCase();

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
      return { success: false, error: 'Kunde inte nå servern. Försök igen senare.' };
    }
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
