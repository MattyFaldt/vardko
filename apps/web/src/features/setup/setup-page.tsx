import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Heart, Building2, User, Mail, Lock, Globe, AlertCircle, Loader2 } from 'lucide-react';
import { setupApi } from '../../lib/api-client';

export function SetupPage() {
  const navigate = useNavigate();

  const [orgName, setOrgName] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [clinicSlug, setClinicSlug] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminName, setAdminName] = useState('');
  const [error, setError] = useState('');
  const [alreadyInitialized, setAlreadyInitialized] = useState(false);
  const [loading, setLoading] = useState(false);

  function slugify(name: string) {
    return name
      .toLowerCase()
      .replace(/[åä]/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function handleClinicNameChange(value: string) {
    setClinicName(value);
    setClinicSlug(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setAlreadyInitialized(false);

    if (!orgName.trim()) { setError('Ange organisationsnamn'); return; }
    if (!clinicName.trim()) { setError('Ange kliniknamn'); return; }
    if (!clinicSlug.trim()) { setError('Ange klinik-slug'); return; }
    if (!adminEmail.trim()) { setError('Ange admin e-post'); return; }
    if (!adminPassword) { setError('Ange admin losenord'); return; }
    if (adminPassword.length < 8) { setError('Losenordet maste vara minst 8 tecken'); return; }
    if (!adminName.trim()) { setError('Ange admin namn'); return; }

    setLoading(true);

    try {
      const result = await setupApi({
        orgName: orgName.trim(),
        clinicName: clinicName.trim(),
        clinicSlug: clinicSlug.trim(),
        adminEmail: adminEmail.trim().toLowerCase(),
        adminPassword,
        adminName: adminName.trim(),
      });

      if (result.success) {
        // Store tokens in localStorage so AuthProvider can pick them up
        localStorage.setItem('accessToken', result.data.accessToken);
        localStorage.setItem('refreshToken', result.data.refreshToken);
        localStorage.setItem('user', JSON.stringify(result.data.user));
        navigate('/admin', { replace: true });
      } else {
        const err = result.error;
        if (err.code === 'CONFLICT' || err.code === '409' || err.message?.includes('already')) {
          setAlreadyInitialized(true);
        } else {
          setError(err.message || 'Ett fel uppstod vid konfigureringen');
        }
      }
    } catch {
      setError('Kunde inte ansluta till servern. Forsok igen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-200">
            <Heart className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Starta VardKo</h1>
          <p className="mt-1 text-sm text-gray-500">Konfigurera din organisation och forsta klinik</p>
        </div>

        {/* Already initialized message */}
        {alreadyInitialized && (
          <div className="mb-6 rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
            <p className="text-sm text-amber-800 font-medium mb-2">Systemet ar redan konfigurerat</p>
            <p className="text-sm text-amber-700">
              VardKo ar redan igangkort.{' '}
              <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700 underline">
                Logga in har
              </Link>{' '}
              for att fortsatta.
            </p>
          </div>
        )}

        {/* Form */}
        <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-gray-100">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Organisation */}
            <div>
              <label htmlFor="orgName" className="block text-sm font-medium text-gray-700 mb-1.5">
                Organisationsnamn
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="orgName"
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Stockholms Vardcentral AB"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Kliniknamn */}
            <div>
              <label htmlFor="clinicName" className="block text-sm font-medium text-gray-700 mb-1.5">
                Kliniknamn
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="clinicName"
                  type="text"
                  value={clinicName}
                  onChange={(e) => handleClinicNameChange(e.target.value)}
                  placeholder="Kungsholmens vardcentral"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Klinik-slug */}
            <div>
              <label htmlFor="clinicSlug" className="block text-sm font-medium text-gray-700 mb-1.5">
                Klinik-slug
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="clinicSlug"
                  type="text"
                  value={clinicSlug}
                  onChange={(e) => setClinicSlug(e.target.value)}
                  placeholder="kungsholmen"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm font-mono outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">Anvands i URL:er, t.ex. /queue/{clinicSlug || 'kungsholmen'}</p>
            </div>

            <hr className="border-gray-100" />

            {/* Admin namn */}
            <div>
              <label htmlFor="adminName" className="block text-sm font-medium text-gray-700 mb-1.5">
                Admin namn
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="adminName"
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Anna Andersson"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Admin e-post */}
            <div>
              <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700 mb-1.5">
                Admin e-post
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="adminEmail"
                  type="email"
                  autoComplete="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@klinik.se"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Admin losenord */}
            <div>
              <label htmlFor="adminPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                Admin losenord
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="adminPassword"
                  type="password"
                  autoComplete="new-password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Minst 8 tecken"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Heart className="h-4 w-4" />
              )}
              {loading ? 'Konfigurerar...' : 'Starta VardKo'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Har du redan ett konto?{' '}
          <Link to="/login" className="font-medium text-blue-600 hover:text-blue-700">
            Logga in
          </Link>
        </p>
      </div>
    </div>
  );
}
