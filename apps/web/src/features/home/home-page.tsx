import { Link } from "react-router-dom";
import {
  Clock,
  TrendingUp,
  Shield,
  QrCode,
  KeyRound,
  Eye,
  DoorOpen,
  ArrowRight,
} from "lucide-react";

const features = [
  {
    icon: Clock,
    title: "Realtidskö",
    description: "Följ din köplats live på mobilen",
  },
  {
    icon: TrendingUp,
    title: "Smart prediktion",
    description: "AI-driven väntidsprediktion baserad på historisk data",
  },
  {
    icon: Shield,
    title: "Noll personuppgifter",
    description: "Personnummer lagras aldrig — end-to-end krypterat",
  },
];

const steps = [
  { icon: QrCode, label: "Skanna QR-koden" },
  { icon: KeyRound, label: "Ange personnummer" },
  { icon: Eye, label: "Följ din plats" },
  { icon: DoorOpen, label: "Gå till rummet" },
];

export function HomePage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* faint decorative gradient blob */}
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-gradient-to-br from-blue-100/60 to-indigo-100/40 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-6 pt-32 pb-24 text-center">
          <h1 className="text-6xl font-extrabold tracking-tight sm:text-7xl">
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              VårdKö
            </span>
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-lg font-medium text-gray-500">
            Digitalt köhanteringssystem för vårdcentraler
          </p>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-gray-600">
            Skippa papperslapparna. Skanna QR-koden, ställ dig i kön digitalt
            och följ din plats i realtid.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/queue/kungsholmen"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Testa demo
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-7 py-3.5 text-sm font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Logga in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Divider ─────────────────────────────────────────── */}
      <div className="mx-auto max-w-6xl px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
      </div>

      {/* ── Features ────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-blue-600">
          Funktioner
        </h2>
        <p className="mt-2 text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Byggt för svensk sjukvård
        </p>

        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-gray-100 bg-gray-50/50 p-8 transition hover:border-blue-200 hover:shadow-lg hover:shadow-blue-600/5"
            >
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Divider ─────────────────────────────────────────── */}
      <div className="mx-auto max-w-6xl px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
      </div>

      {/* ── How it works ────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-blue-600">
          Så funkar det
        </h2>
        <p className="mt-2 text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Fyra enkla steg
        </p>

        <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.label} className="text-center">
              <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20">
                <s.icon className="h-6 w-6" />
                <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-blue-600 shadow ring-1 ring-gray-100">
                  {i + 1}
                </span>
              </div>
              <p className="text-sm font-semibold text-gray-800">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-10">
        <p className="text-center text-sm text-gray-400">
          VårdKö &copy; 2026 — Byggd för svensk sjukvård
        </p>
      </footer>
    </div>
  );
}
