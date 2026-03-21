import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Heart, Mail, Lock, Eye, EyeOff, AlertCircle, LogIn } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';

export function LoginPage() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);

  if (isAuthenticated && user) {
    const target = user.role === 'staff' ? '/staff' : '/admin';
    return <Navigate to={target} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (locked) {
      setError('Kontot är tillfälligt låst. Vänta en stund och försök igen.');
      return;
    }
    if (!email.trim()) { setError('Ange din e-postadress'); return; }
    if (!password) { setError('Ange ditt lösenord'); return; }

    setLoading(true);
    await new Promise(r => setTimeout(r, 600));

    const result = await login(email, password);

    if (result.success) {
      setAttempts(0);
      const target = result.role === 'staff' ? '/staff' : '/admin';
      navigate(target, { replace: true });
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= 5) {
        setLocked(true);
        setError('För många misslyckade försök. Kontot är låst i 15 minuter.');
        setTimeout(() => { setLocked(false); setAttempts(0); }, 15 * 60 * 1000);
      } else {
        setError(result.error || 'Felaktig e-post eller lösenord');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-200">
            <Heart className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">VårdKö</h1>
          <p className="mt-1 text-sm text-gray-500">Logga in för att fortsätta</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-gray-100">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">E-post</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input id="email" type="email" autoComplete="email" value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  placeholder="namn@klinik.se"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">Lösenord</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                  value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
                  className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-10 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading || locked}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {loading ? 'Loggar in...' : 'Logga in'}
            </button>
          </form>

          {attempts > 0 && attempts < 5 && (
            <p className="mt-3 text-center text-xs text-gray-400">{5 - attempts} försök kvar</p>
          )}
        </div>

        <div className="mt-6 rounded-xl bg-blue-50 p-4 ring-1 ring-blue-100">
          <p className="text-xs font-semibold text-blue-800 mb-2">Demokonton:</p>
          <div className="space-y-1.5 text-xs text-blue-700">
            <div className="flex justify-between"><span className="font-medium">Admin:</span><span className="font-mono">anna@kungsholmen.se / Admin123456!</span></div>
            <div className="flex justify-between"><span className="font-medium">Personal:</span><span className="font-mono">erik@kungsholmen.se / Staff123456!</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
