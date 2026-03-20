import {
  Building2,
  Users,
  UserPlus,
  Plus,
  Activity,
  DoorOpen,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface ClinicData {
  name: string;
  slug: string;
  status: "active" | "inactive";
  rooms: number;
  staff: number;
  patientsToday: number;
}

const CLINICS: ClinicData[] = [
  {
    name: "Kungsholmens Vårdcentral",
    slug: "kungsholmen",
    status: "active",
    rooms: 5,
    staff: 3,
    patientsToday: 24,
  },
  {
    name: "Södermalms Vårdcentral",
    slug: "sodermalm",
    status: "active",
    rooms: 3,
    staff: 2,
    patientsToday: 18,
  },
  {
    name: "Norrmalms Vårdcentral",
    slug: "norrmalm",
    status: "inactive",
    rooms: 0,
    staff: 0,
    patientsToday: 0,
  },
];

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function ClinicCard({ clinic }: { clinic: ClinicData }) {
  const isActive = clinic.status === "active";

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              isActive
                ? "bg-blue-50 text-blue-600"
                : "bg-slate-100 text-slate-400"
            }`}
          >
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{clinic.name}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{clinic.slug}</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            isActive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {isActive ? (
            <CheckCircle2 className="w-3 h-3" />
          ) : (
            <Clock className="w-3 h-3" />
          )}
          {isActive ? "Aktiv" : "Konfigurering"}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
            <DoorOpen className="w-3.5 h-3.5" />
          </div>
          <p className="text-lg font-bold text-slate-800">{clinic.rooms}</p>
          <p className="text-xs text-slate-500">Rum</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
            <Users className="w-3.5 h-3.5" />
          </div>
          <p className="text-lg font-bold text-slate-800">{clinic.staff}</p>
          <p className="text-xs text-slate-500">Personal</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
            <Activity className="w-3.5 h-3.5" />
          </div>
          <p className="text-lg font-bold text-slate-800">
            {clinic.patientsToday}
          </p>
          <p className="text-xs text-slate-500">Patienter idag</p>
        </div>
      </div>
    </div>
  );
}

export function OrgAdminPage() {
  const totalClinics = CLINICS.length;
  const totalStaff = CLINICS.reduce((sum, c) => sum + c.staff, 0);
  const totalPatients = CLINICS.reduce((sum, c) => sum + c.patientsToday, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Organisationsadmin
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Stockholms Vårdcentral AB
              </p>
            </div>
            <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors">
              <Plus className="w-4 h-4" />
              Lägg till klinik
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={Building2}
            label="Totalt kliniker"
            value={totalClinics}
          />
          <StatCard
            icon={UserPlus}
            label="Total personal"
            value={totalStaff}
          />
          <StatCard
            icon={Activity}
            label="Patienter idag"
            value={totalPatients}
          />
        </div>

        {/* Clinics */}
        <div>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Kliniker
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {CLINICS.map((clinic) => (
              <ClinicCard key={clinic.slug} clinic={clinic} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
