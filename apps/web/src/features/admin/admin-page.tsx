import { useState, useEffect, useMemo } from 'react';
import {
  Users,
  DoorOpen,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Activity,
  PauseCircle,
  XCircle,
  CircleDot,
  LayoutDashboard,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useDemo } from '../../lib/demo-data.js';

/* ---------------------------------------------------------------------------
   Mock chart data generators
   --------------------------------------------------------------------------- */

const HOURS = ['07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17'];

const patientFlowData = [
  { timme: '07:00', patienter: 3 },
  { timme: '08:00', patienter: 12 },
  { timme: '09:00', patienter: 18 },
  { timme: '10:00', patienter: 24 },
  { timme: '11:00', patienter: 20 },
  { timme: '12:00', patienter: 10 },
  { timme: '13:00', patienter: 16 },
  { timme: '14:00', patienter: 22 },
  { timme: '15:00', patienter: 19 },
  { timme: '16:00', patienter: 14 },
  { timme: '17:00', patienter: 6 },
];

const waitTimeData = [
  { timme: '07:00', väntetid: 4 },
  { timme: '08:00', väntetid: 7 },
  { timme: '09:00', väntetid: 12 },
  { timme: '10:00', väntetid: 18 },
  { timme: '11:00', väntetid: 15 },
  { timme: '12:00', väntetid: 8 },
  { timme: '13:00', väntetid: 10 },
  { timme: '14:00', väntetid: 16 },
  { timme: '15:00', väntetid: 13 },
  { timme: '16:00', väntetid: 9 },
  { timme: '17:00', väntetid: 5 },
];

const serviceTimeDistribution = [
  { intervall: '0-5 min', antal: 8 },
  { intervall: '5-10 min', antal: 22 },
  { intervall: '10-15 min', antal: 35 },
  { intervall: '15-20 min', antal: 18 },
  { intervall: '20-25 min', antal: 9 },
  { intervall: '25-30 min', antal: 4 },
  { intervall: '30+ min', antal: 2 },
];

const PIE_COLORS = {
  open: '#22c55e',
  occupied: '#3b82f6',
  paused: '#f59e0b',
  closed: '#ef4444',
} as const;

const STATUS_LABELS: Record<string, string> = {
  open: 'Ledigt',
  occupied: 'Upptaget',
  paused: 'Pausat',
  closed: 'Stängt',
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  open: 'bg-green-100 text-green-700',
  occupied: 'bg-blue-100 text-blue-700',
  paused: 'bg-amber-100 text-amber-700',
  closed: 'bg-red-100 text-red-700',
};

/* ---------------------------------------------------------------------------
   Helper: format current date/time in Swedish
   --------------------------------------------------------------------------- */

function useCurrentTime() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatSwedishDate(d: Date): string {
  return d.toLocaleDateString('sv-SE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

/* ---------------------------------------------------------------------------
   Sub-components
   --------------------------------------------------------------------------- */

function KpiCard({
  label,
  value,
  suffix,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'amber' | 'purple';
}) {
  const ring: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  };
  const valueColor: Record<string, string> = {
    blue: 'text-blue-700',
    green: 'text-green-700',
    amber: 'text-amber-700',
    purple: 'text-purple-700',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4">
      <div className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${ring[color]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className={`text-2xl font-bold ${valueColor[color]}`}>
          {value}
          {suffix && <span className="text-base font-medium ml-1">{suffix}</span>}
        </p>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      <div className="h-64">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Main component
   --------------------------------------------------------------------------- */

export function AdminPage() {
  const { rooms, patients, stats, clinicName } = useDemo();
  const now = useCurrentTime();

  /* Room utilization pie data derived from actual rooms */
  const roomPieData = useMemo(() => {
    const counts: Record<string, number> = { open: 0, occupied: 0, paused: 0, closed: 0 };
    for (const r of rooms) {
      counts[r.status] = (counts[r.status] || 0) + 1;
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([status, value]) => ({
        name: STATUS_LABELS[status],
        value,
        color: PIE_COLORS[status as keyof typeof PIE_COLORS],
      }));
  }, [rooms]);

  /* Smart alerts */
  const alerts = useMemo(() => {
    const list: { message: string; severity: 'warning' | 'info' | 'error' }[] = [];

    if (stats.waitingCount > 5) {
      list.push({
        message: `Kön längre än vanligt — ${stats.waitingCount} patienter väntar (snitt ${stats.avgWaitMinutes} min).`,
        severity: 'warning',
      });
    }

    const pausedRooms = rooms.filter((r) => r.status === 'paused');
    for (const r of pausedRooms) {
      list.push({
        message: `${r.name} är pausat${r.staffName ? ` (${r.staffName})` : ''}.`,
        severity: 'info',
      });
    }

    const closedWithStaff = rooms.filter((r) => r.status === 'closed');
    if (closedWithStaff.length >= 2) {
      list.push({
        message: `${closedWithStaff.length} rum stängda — öppna fler rum om kön växer.`,
        severity: 'info',
      });
    }

    if (stats.noShowsToday >= 2) {
      list.push({
        message: `${stats.noShowsToday} uteblivna besök idag — överväg SMS-påminnelse.`,
        severity: 'error',
      });
    }

    if (stats.avgWaitMinutes > 20) {
      list.push({
        message: 'Genomsnittlig väntetid överstiger 20 minuter.',
        severity: 'warning',
      });
    }

    return list.slice(0, 4);
  }, [stats, rooms]);

  const alertStyles = {
    warning: 'bg-amber-50 border-amber-300 text-amber-800',
    info: 'bg-blue-50 border-blue-300 text-blue-800',
    error: 'bg-red-50 border-red-300 text-red-800',
  };

  const alertIcons = {
    warning: AlertTriangle,
    info: Activity,
    error: XCircle,
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* ---- Top bar ---- */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="w-6 h-6 text-blue-600" />
            <h1 className="text-lg font-bold text-gray-900 truncate">
              {clinicName} — <span className="font-semibold text-gray-600">Instrumentpanel</span>
            </h1>
          </div>
          <div className="text-sm text-gray-500 text-right hidden sm:block">
            <p className="capitalize">{formatSwedishDate(now)}</p>
            <p className="font-mono text-gray-700">{formatTime(now)}</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ---- KPI cards ---- */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="I kön"
            value={stats.waitingCount}
            icon={Users}
            color="blue"
          />
          <KpiCard
            label="Aktiva rum"
            value={`${stats.activeRooms}/${rooms.length}`}
            icon={DoorOpen}
            color="green"
          />
          <KpiCard
            label="Snitt väntetid"
            value={stats.avgWaitMinutes}
            suffix="min"
            icon={Clock}
            color="amber"
          />
          <KpiCard
            label="Betjänade idag"
            value={stats.completedToday}
            icon={CheckCircle2}
            color="purple"
          />
        </section>

        {/* ---- Charts (2x2) ---- */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Patient flow */}
          <ChartCard title="Patientflöde idag (per timme)">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={patientFlowData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="timme" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="patienter"
                  name="Patienter"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Wait time bar */}
          <ChartCard title="Genomsnittlig väntetid (min per timme)">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={waitTimeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="timme" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="väntetid" name="Väntetid (min)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Room utilization pie */}
          <ChartCard title="Rumsbeläggning">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={roomPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {roomPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Service time histogram */}
          <ChartCard title="Betjäningstid — fördelning">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serviceTimeDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="intervall" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="antal" name="Antal besök" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>

        {/* ---- Rooms overview table ---- */}
        <section className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Rumsöversikt</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wider">
                  <th className="px-5 py-3 font-medium">Rum</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Personal</th>
                  <th className="px-5 py-3 font-medium">Aktuell patient</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rooms.map((room) => {
                  const StatusIcon =
                    room.status === 'occupied'
                      ? CircleDot
                      : room.status === 'paused'
                        ? PauseCircle
                        : room.status === 'closed'
                          ? XCircle
                          : DoorOpen;

                  return (
                    <tr key={room.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900">{room.name}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE_CLASSES[room.status]}`}
                        >
                          <StatusIcon className="w-3.5 h-3.5" />
                          {STATUS_LABELS[room.status]}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {room.staffName ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {room.currentTicketNumber ? (
                          <span className="font-mono font-medium text-gray-900">
                            #{room.currentTicketNumber}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---- Smart alerts ---- */}
        {alerts.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Smarta aviseringar</h3>
            {alerts.map((alert, i) => {
              const AlertIcon = alertIcons[alert.severity];
              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${alertStyles[alert.severity]}`}
                >
                  <AlertIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm leading-relaxed">{alert.message}</p>
                </div>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
