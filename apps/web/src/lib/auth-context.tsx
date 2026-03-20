import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { UserRole } from './demo-data';

export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => { success: boolean; error?: string };
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Demo accounts — in production this would be Argon2-hashed and validated server-side
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

  const login = useCallback((email: string, password: string): { success: boolean; error?: string } => {
    const trimmedEmail = email.trim().toLowerCase();

    // Simulate brute-force delay
    const account = DEMO_ACCOUNTS.find(a => a.email === trimmedEmail);

    if (!account || account.password !== password) {
      return { success: false, error: 'Felaktig e-post eller lösenord' };
    }

    setUser(account.user);
    return { success: true };
  }, []);

  const logout = useCallback(() => {
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: user !== null, login, logout }}>
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
