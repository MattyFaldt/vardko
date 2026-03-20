import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Mail, Lock, ChevronDown, Eye, EyeOff } from "lucide-react";

const CLINICS = [
  { value: "", label: "Välj klinik (valfritt)" },
  { value: "kungsholmen", label: "Kungsholmens Vårdcentral" },
  { value: "sodermalm", label: "Södermalms Vårdcentral" },
  { value: "norrmalm", label: "Norrmalms Vårdcentral" },
];

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clinic, setClinic] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordValid = password.length >= 6;
  const formValid = emailValid && passwordValid;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!formValid) return;

    setLoading(true);
    // Demo mode — simulate a brief delay, then navigate
    setTimeout(() => {
      navigate("/staff");
    }, 600);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white mb-4 shadow-lg shadow-blue-200">
            <Heart className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            VårdKö
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Digitalt kösystem för vården
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-100 p-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-6">
            Logga in
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                E-postadress
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="namn@klinik.se"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm outline-none transition-colors ${
                    touched.email && !emailValid
                      ? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                      : "border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  }`}
                />
              </div>
              {touched.email && !emailValid && (
                <p className="text-red-500 text-xs mt-1">
                  Ange en giltig e-postadress
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Lösenord
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  className={`w-full pl-10 pr-10 py-2.5 rounded-lg border text-sm outline-none transition-colors ${
                    touched.password && !passwordValid
                      ? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                      : "border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {touched.password && !passwordValid && (
                <p className="text-red-500 text-xs mt-1">
                  Lösenordet måste vara minst 6 tecken
                </p>
              )}
            </div>

            {/* Clinic dropdown */}
            <div>
              <label
                htmlFor="clinic"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Klinik
              </label>
              <div className="relative">
                <select
                  id="clinic"
                  value={clinic}
                  onChange={(e) => setClinic(e.target.value)}
                  className="w-full appearance-none pl-4 pr-10 py-2.5 rounded-lg border border-slate-200 text-sm outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white text-slate-700"
                >
                  {CLINICS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Loggar in…
                </>
              ) : (
                "Logga in"
              )}
            </button>
          </form>

          {/* Forgot password */}
          <div className="text-center mt-5">
            <button
              type="button"
              className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
            >
              Glömt lösenord?
            </button>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-400 mt-6">
          Demo-läge — inloggning simuleras lokalt
        </p>
      </div>
    </div>
  );
}
