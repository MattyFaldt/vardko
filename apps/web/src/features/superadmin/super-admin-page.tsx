import {
  Shield,
  CheckCircle2,
  Building2,
  Globe,
  Users,
  Activity,
  Server,
  Database,
  Wifi,
  Radio,
} from "lucide-react";

interface OrgRow {
  name: string;
  status: "active" | "setup";
  clinics: number;
  staff: number;
  patientsToday: number;
}

const ORGS: OrgRow[] = [
  {
    name: "Stockholms Vårdcentral AB",
    status: "active",
    clinics: 3,
    staff: 5,
    patientsToday: 42,
  },
  {
    name: "Göteborg Vård AB",
    status: "active",
    clinics: 2,
    staff: 4,
    patientsToday: 31,
  },
  {
    name: "Malmö HC",
    status: "setup",
    clinics: 0,
    staff: 1,
    patientsToday: 0,
  },
];

interface HealthItem {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "operational";
}

const HEALTH: HealthItem[] = [
  { name: "API", icon: Server, status: "operational" },
  { name: "Databas", icon: Database, status: "operational" },
  { name: "Redis", icon: Radio, status: "operational" },
  { name: "WebSocket", icon: Wifi, status: "operational" },
];

export function SuperAdminPage() {
  const totalOrgs = ORGS.length;
  const totalClinics = ORGS.reduce((sum, o) => sum + o.clinics, 0);
  const totalPatients = ORGS.reduce((sum, o) => sum + o.patientsToday, 0);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-700/60">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-violet-600 text-white flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Systemadministration
            </h1>
            <p className="text-xs text-slate-400">VårdKö — Superadmin</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Metrics row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Drifttid", value: "99.98%", icon: Activity },
            { label: "Organisationer", value: totalOrgs, icon: Globe },
            { label: "Kliniker", value: totalClinics, icon: Building2 },
            { label: "Patienter idag", value: totalPatients, icon: Users },
          ].map((m) => (
            <div
              key={m.label}
              className="bg-slate-800 rounded-xl border border-slate-700/50 p-4"
            >
              <div className="flex items-center gap-2 text-slate-400 mb-2">
                <m.icon className="w-4 h-4" />
                <span className="text-xs">{m.label}</span>
              </div>
              <p className="text-2xl font-bold text-slate-50">{m.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Organizations table — takes 2 cols */}
          <div className="lg:col-span-2 bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50">
              <h2 className="font-semibold text-sm text-slate-200">
                Organisationer
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-700/40">
                    <th className="px-5 py-3 font-medium">Organisation</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-right">
                      Kliniker
                    </th>
                    <th className="px-5 py-3 font-medium text-right">
                      Personal
                    </th>
                    <th className="px-5 py-3 font-medium text-right">
                      Patienter idag
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ORGS.map((org) => (
                    <tr
                      key={org.name}
                      className="border-b border-slate-700/30 last:border-0 hover:bg-slate-750/40 transition-colors"
                    >
                      <td className="px-5 py-3.5 font-medium text-slate-100">
                        {org.name}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                            org.status === "active"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-amber-500/15 text-amber-400"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              org.status === "active"
                                ? "bg-emerald-400"
                                : "bg-amber-400"
                            }`}
                          />
                          {org.status === "active" ? "Aktiv" : "Konfigurering"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-slate-300">
                        {org.clinics}
                      </td>
                      <td className="px-5 py-3.5 text-right text-slate-300">
                        {org.staff}
                      </td>
                      <td className="px-5 py-3.5 text-right text-slate-300">
                        {org.patientsToday}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* System health panel */}
          <div className="bg-slate-800 rounded-xl border border-slate-700/50">
            <div className="px-5 py-4 border-b border-slate-700/50">
              <h2 className="font-semibold text-sm text-slate-200">
                Systemhälsa
              </h2>
            </div>
            <div className="p-5 space-y-3">
              {HEALTH.map((h) => (
                <div
                  key={h.name}
                  className="flex items-center justify-between bg-slate-750/40 rounded-lg px-4 py-3 border border-slate-700/30"
                >
                  <div className="flex items-center gap-3">
                    <h.icon className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-200">{h.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-xs font-medium">Operational</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
