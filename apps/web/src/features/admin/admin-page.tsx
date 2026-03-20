import { useState, useMemo } from 'react';
import {
  LayoutDashboard,
  List,
  DoorOpen,
  Users,
  Settings,
  Building2,
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Activity,
  XCircle,
  PauseCircle,
  CircleDot,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Menu,
  ChevronDown,
  UserPlus,
  Server,
  Database,
  Cpu,
  Globe,
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
} from 'recharts';
import { useDemo, UserRole } from '../../lib/demo-data.js';

/* ---------------------------------------------------------------------------
   Constants & types
   --------------------------------------------------------------------------- */

type Section = 'dashboard' | 'queue' | 'rooms' | 'staff' | 'settings' | 'clinics' | 'system';

interface NavItem {
  id: Section;
  label: string;
  icon: React.ElementType;
  minRole: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Instrumentpanel', icon: LayoutDashboard, minRole: ['superadmin', 'org_admin', 'clinic_admin', 'staff'] },
  { id: 'queue', label: 'Kö', icon: List, minRole: ['superadmin', 'org_admin', 'clinic_admin', 'staff'] },
  { id: 'rooms', label: 'Rum', icon: DoorOpen, minRole: ['superadmin', 'org_admin', 'clinic_admin'] },
  { id: 'staff', label: 'Personal', icon: Users, minRole: ['superadmin', 'org_admin', 'clinic_admin'] },
  { id: 'settings', label: 'Inställningar', icon: Settings, minRole: ['superadmin', 'org_admin', 'clinic_admin'] },
  { id: 'clinics', label: 'Kliniker', icon: Building2, minRole: ['superadmin', 'org_admin'] },
  { id: 'system', label: 'System', icon: Shield, minRole: ['superadmin'] },
];

const ALL_ROLES: UserRole[] = ['superadmin', 'org_admin', 'clinic_admin', 'staff'];

const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Superadmin',
  org_admin: 'Organisationsadmin',
  clinic_admin: 'Klinikadmin',
  staff: 'Personal',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Ledigt',
  occupied: 'Upptaget',
  paused: 'Pausat',
  closed: 'Stängt',
};

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-green-100 text-green-700',
  occupied: 'bg-blue-100 text-blue-700',
  paused: 'bg-amber-100 text-amber-700',
  closed: 'bg-red-100 text-red-700',
};

const PATIENT_STATUS_LABELS: Record<string, string> = {
  waiting: 'Väntar',
  called: 'Kallas',
  in_progress: 'Pågår',
  completed: 'Klar',
  no_show: 'Utebliven',
  cancelled: 'Avbokad',
};

const PATIENT_STATUS_BADGE: Record<string, string> = {
  waiting: 'bg-amber-100 text-amber-700',
  called: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-green-100 text-green-700',
  no_show: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

/* ---------------------------------------------------------------------------
   Mock chart data
   --------------------------------------------------------------------------- */

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

/* ---------------------------------------------------------------------------
   Mock data for org / system sections
   --------------------------------------------------------------------------- */

const MOCK_CLINICS = [
  { name: 'Kungsholmens Vårdcentral', slug: 'kungsholmen', status: 'active' as const, rooms: 5, staff: 3, patientsToday: 24 },
  { name: 'Södermalms Vårdcentral', slug: 'sodermalm', status: 'active' as const, rooms: 3, staff: 2, patientsToday: 18 },
  { name: 'Norrmalms Vårdcentral', slug: 'norrmalm', status: 'inactive' as const, rooms: 0, staff: 0, patientsToday: 0 },
];

const MOCK_ORGS = [
  { name: 'Stockholms Vårdcentral AB', clinics: 3, users: 12, plan: 'Enterprise', status: 'active' },
  { name: 'Göteborg Vård AB', clinics: 2, users: 8, plan: 'Professional', status: 'active' },
  { name: 'Malmö Hälsocenter', clinics: 1, users: 4, plan: 'Starter', status: 'trial' },
];

/* ---------------------------------------------------------------------------
   Helper components
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
  const valColor: Record<string, string> = {
    blue: 'text-blue-700',
    green: 'text-green-700',
    amber: 'text-amber-700',
    purple: 'text-purple-700',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4">
      <div className={`shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${ring[color]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className={`text-2xl font-bold ${valColor[color]}`}>
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

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Section: Dashboard
   --------------------------------------------------------------------------- */

function DashboardSection() {
  const { rooms, stats } = useDemo();

  const alerts = useMemo(() => {
    const list: { message: string; severity: 'warning' | 'info' | 'error' }[] = [];
    if (stats.waitingCount > 5) {
      list.push({ message: `Kön längre än vanligt — ${stats.waitingCount} patienter väntar (snitt ${stats.avgWaitMinutes} min).`, severity: 'warning' });
    }
    const pausedRooms = rooms.filter(r => r.status === 'paused');
    for (const r of pausedRooms) {
      list.push({ message: `${r.name} är pausat${r.staffName ? ` (${r.staffName})` : ''}.`, severity: 'info' });
    }
    const closedRooms = rooms.filter(r => r.status === 'closed');
    if (closedRooms.length >= 2) {
      list.push({ message: `${closedRooms.length} rum stängda — öppna fler rum om kön växer.`, severity: 'info' });
    }
    if (stats.noShowsToday >= 2) {
      list.push({ message: `${stats.noShowsToday} uteblivna besök idag — överväg SMS-påminnelse.`, severity: 'error' });
    }
    if (stats.avgWaitMinutes > 20) {
      list.push({ message: 'Genomsnittlig väntetid överstiger 20 minuter.', severity: 'warning' });
    }
    return list.slice(0, 4);
  }, [stats, rooms]);

  const alertStyles = {
    warning: 'bg-amber-50 border-amber-300 text-amber-800',
    info: 'bg-blue-50 border-blue-300 text-blue-800',
    error: 'bg-red-50 border-red-300 text-red-800',
  };
  const alertIcons = { warning: AlertTriangle, info: Activity, error: XCircle };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Instrumentpanel</h2>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="I kön" value={stats.waitingCount} icon={Users} color="blue" />
        <KpiCard label="Aktiva rum" value={`${stats.activeRooms}/${rooms.length}`} icon={DoorOpen} color="green" />
        <KpiCard label="Snitt väntetid" value={stats.avgWaitMinutes} suffix="min" icon={Clock} color="amber" />
        <KpiCard label="Betjänade idag" value={stats.completedToday} icon={CheckCircle2} color="purple" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Patientflöde idag (per timme)">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={patientFlowData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="timme" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="patienter" name="Patienter" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

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
      </div>

      {/* Smart alerts */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Smarta aviseringar</h3>
          {alerts.map((alert, i) => {
            const AlertIcon = alertIcons[alert.severity];
            return (
              <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${alertStyles[alert.severity]}`}>
                <AlertIcon className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm leading-relaxed">{alert.message}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Section: Queue
   --------------------------------------------------------------------------- */

function QueueSection() {
  const { patients, rooms } = useDemo();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filters = [
    { key: 'all', label: 'Alla' },
    { key: 'waiting', label: 'Väntar' },
    { key: 'called', label: 'Kallas' },
    { key: 'in_progress', label: 'Pågår' },
    { key: 'completed', label: 'Klara' },
  ];

  const filtered = statusFilter === 'all' ? patients : patients.filter(p => p.status === statusFilter);

  function formatWait(joinedAt: Date): string {
    const mins = Math.round((Date.now() - joinedAt.getTime()) / 60000);
    if (mins < 1) return '<1 min';
    return `${mins} min`;
  }

  function getRoomName(roomId: string | null): string {
    if (!roomId) return '—';
    const room = rooms.find(r => r.id === roomId);
    return room ? room.name : '—';
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Kö</h2>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-white rounded-lg p-1 shadow-sm w-fit">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              statusFilter === f.key
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wider">
                <th className="px-5 py-3 font-medium">#</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Position</th>
                <th className="px-5 py-3 font-medium">Väntetid</th>
                <th className="px-5 py-3 font-medium">Rum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-mono font-medium text-gray-900">#{p.ticketNumber}</td>
                  <td className="px-5 py-3">
                    <Badge className={PATIENT_STATUS_BADGE[p.status] || 'bg-gray-100 text-gray-600'}>
                      {PATIENT_STATUS_LABELS[p.status] || p.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    {p.status === 'waiting' ? p.position : '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-600">{formatWait(p.joinedAt)}</td>
                  <td className="px-5 py-3 text-gray-600">{getRoomName(p.assignedRoomId)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                    Inga patienter att visa
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Section: Rooms
   --------------------------------------------------------------------------- */

function RoomsSection() {
  const { rooms, updateRoom, addRoom, removeRoom } = useDemo();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function handleAdd() {
    if (!newRoomName.trim()) return;
    addRoom(newRoomName.trim());
    setNewRoomName('');
    setShowAddForm(false);
  }

  function startEdit(id: string, name: string) {
    setEditingId(id);
    setEditName(name);
  }

  function saveEdit(id: string) {
    if (editName.trim()) {
      updateRoom(id, { name: editName.trim() });
    }
    setEditingId(null);
  }

  function handleDelete(id: string) {
    removeRoom(id);
    setConfirmDeleteId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Rum</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Lägg till rum
        </button>
      </div>

      {/* Inline add form */}
      {showAddForm && (
        <div className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
          <input
            type="text"
            value={newRoomName}
            onChange={e => setNewRoomName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Rumsnamn..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            autoFocus
          />
          <button onClick={handleAdd} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            Spara
          </button>
          <button onClick={() => { setShowAddForm(false); setNewRoomName(''); }} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors">
            Avbryt
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wider">
                <th className="px-5 py-3 font-medium">Namn</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Personal</th>
                <th className="px-5 py-3 font-medium">Patient</th>
                <th className="px-5 py-3 font-medium">Aktiv</th>
                <th className="px-5 py-3 font-medium text-right">Åtgärder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rooms.map(room => (
                <tr key={room.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    {editingId === room.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(room.id); if (e.key === 'Escape') setEditingId(null); }}
                          className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                        <button onClick={() => saveEdit(room.id)} className="text-green-600 hover:text-green-700"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <span className="font-medium text-gray-900 cursor-pointer hover:text-blue-600" onClick={() => startEdit(room.id, room.name)}>
                        {room.name}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Badge className={STATUS_BADGE[room.status] || 'bg-gray-100 text-gray-600'}>{STATUS_LABELS[room.status] || room.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{room.staffName || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">
                    {room.currentTicketNumber ? <span className="font-mono font-medium">#{room.currentTicketNumber}</span> : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => updateRoom(room.id, { isActive: !room.isActive })}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        room.isActive ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        room.isActive ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => startEdit(room.id, room.name)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      {confirmDeleteId === room.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDelete(room.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">Ta bort</button>
                          <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200">Avbryt</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(room.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Section: Staff
   --------------------------------------------------------------------------- */

function StaffSection() {
  const { staff, rooms, addStaffMember, updateStaffMember, removeStaffMember } = useDemo();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'clinic_admin' | 'staff'>('staff');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'clinic_admin' | 'staff'>('staff');

  function handleAdd() {
    if (!newName.trim() || !newEmail.trim()) return;
    addStaffMember({ displayName: newName.trim(), email: newEmail.trim(), role: newRole });
    setNewName('');
    setNewEmail('');
    setNewRole('staff');
    setShowAddForm(false);
  }

  function startEdit(member: { id: string; displayName: string; email: string; role: 'clinic_admin' | 'staff' }) {
    setEditingId(member.id);
    setEditName(member.displayName);
    setEditEmail(member.email);
    setEditRole(member.role);
  }

  function saveEdit(id: string) {
    updateStaffMember(id, { displayName: editName.trim(), email: editEmail.trim(), role: editRole });
    setEditingId(null);
  }

  function getRoomName(roomId: string | null): string {
    if (!roomId) return '—';
    const room = rooms.find(r => r.id === roomId);
    return room ? room.name : '—';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Personal</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Lägg till personal
        </button>
      </div>

      {/* Inline add form */}
      {showAddForm && (
        <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Namn..."
            className="flex-1 min-w-[160px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            autoFocus
          />
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="E-post..."
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <select
            value={newRole}
            onChange={e => setNewRole(e.target.value as 'clinic_admin' | 'staff')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="staff">Personal</option>
            <option value="clinic_admin">Klinikadmin</option>
          </select>
          <button onClick={handleAdd} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            Spara
          </button>
          <button onClick={() => { setShowAddForm(false); setNewName(''); setNewEmail(''); }} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors">
            Avbryt
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wider">
                <th className="px-5 py-3 font-medium">Namn</th>
                <th className="px-5 py-3 font-medium">E-post</th>
                <th className="px-5 py-3 font-medium">Roll</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Tilldelat rum</th>
                <th className="px-5 py-3 font-medium text-right">Åtgärder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staff.map(member => (
                <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                  {editingId === member.id ? (
                    <>
                      <td className="px-5 py-3">
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-5 py-3">
                        <input
                          type="email"
                          value={editEmail}
                          onChange={e => setEditEmail(e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-5 py-3">
                        <select
                          value={editRole}
                          onChange={e => setEditRole(e.target.value as 'clinic_admin' | 'staff')}
                          className="px-2 py-1 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="staff">Personal</option>
                          <option value="clinic_admin">Klinikadmin</option>
                        </select>
                      </td>
                      <td className="px-5 py-3">
                        <Badge className={member.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                          {member.isActive ? 'Aktiv' : 'Inaktiv'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{getRoomName(member.assignedRoomId)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => saveEdit(member.id)} className="text-green-600 hover:text-green-700"><Check className="w-4 h-4" /></button>
                          <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-5 py-3 font-medium text-gray-900">{member.displayName}</td>
                      <td className="px-5 py-3 text-gray-600">{member.email}</td>
                      <td className="px-5 py-3">
                        <Badge className={member.role === 'clinic_admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}>
                          {member.role === 'clinic_admin' ? 'Klinikadmin' : 'Personal'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => updateStaffMember(member.id, { isActive: !member.isActive })}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                            member.isActive ? 'bg-blue-600' : 'bg-gray-200'
                          }`}
                        >
                          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                            member.isActive ? 'translate-x-5' : 'translate-x-0'
                          }`} />
                        </button>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{getRoomName(member.assignedRoomId)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => startEdit(member)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => removeStaffMember(member.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Section: Settings
   --------------------------------------------------------------------------- */

function SettingsSection() {
  const [smsReminders, setSmsReminders] = useState(true);
  const [autoClose, setAutoClose] = useState(false);
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [publicQueue, setPublicQueue] = useState(true);
  const [estimatedWait, setEstimatedWait] = useState(true);

  function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`} />
      </button>
    );
  }

  const settings = [
    { label: 'SMS-påminnelser', description: 'Skicka SMS till patienter när deras tur närmar sig', checked: smsReminders, onChange: setSmsReminders },
    { label: 'Automatisk stängning', description: 'Stäng rum automatiskt efter kl 17:00', checked: autoClose, onChange: setAutoClose },
    { label: 'Ljudaviseringar', description: 'Spela ljud när en ny patient kallas', checked: soundAlerts, onChange: setSoundAlerts },
    { label: 'Mörkt läge', description: 'Aktivera mörkt tema för gränssnittet', checked: darkMode, onChange: setDarkMode },
    { label: 'Publik kövy', description: 'Visa kön på den publika skärmen', checked: publicQueue, onChange: setPublicQueue },
    { label: 'Visa beräknad väntetid', description: 'Visa uppskattad väntetid för patienter', checked: estimatedWait, onChange: setEstimatedWait },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Inställningar</h2>
      <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
        {settings.map((s, i) => (
          <div key={i} className="flex items-center justify-between px-6 py-4">
            <div>
              <p className="text-sm font-medium text-gray-900">{s.label}</p>
              <p className="text-sm text-gray-500">{s.description}</p>
            </div>
            <Toggle checked={s.checked} onChange={s.onChange} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Section: Clinics (org_admin+)
   --------------------------------------------------------------------------- */

function ClinicsSection() {
  const totalClinics = MOCK_CLINICS.length;
  const totalStaff = MOCK_CLINICS.reduce((s, c) => s + c.staff, 0);
  const totalPatients = MOCK_CLINICS.reduce((s, c) => s + c.patientsToday, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Kliniker</h2>
        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" />
          Lägg till klinik
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Totalt kliniker" value={totalClinics} icon={Building2} color="blue" />
        <KpiCard label="Total personal" value={totalStaff} icon={UserPlus} color="green" />
        <KpiCard label="Patienter idag" value={totalPatients} icon={Activity} color="purple" />
      </div>

      {/* Clinic cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {MOCK_CLINICS.map(clinic => {
          const isActive = clinic.status === 'active';
          return (
            <div key={clinic.slug} className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{clinic.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{clinic.slug}</p>
                  </div>
                </div>
                <Badge className={isActive ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                  {isActive ? 'Aktiv' : 'Konfigurering'}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: DoorOpen, value: clinic.rooms, label: 'Rum' },
                  { icon: Users, value: clinic.staff, label: 'Personal' },
                  { icon: Activity, value: clinic.patientsToday, label: 'Patienter' },
                ].map((stat, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center text-gray-400 mb-1">
                      <stat.icon className="w-3.5 h-3.5" />
                    </div>
                    <p className="text-lg font-bold text-gray-800">{stat.value}</p>
                    <p className="text-xs text-gray-500">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Section: System (superadmin only)
   --------------------------------------------------------------------------- */

function SystemSection() {
  const systemHealth = [
    { label: 'API-server', status: 'ok', icon: Server, detail: '12ms svarstid' },
    { label: 'Databas', status: 'ok', icon: Database, detail: 'PostgreSQL 16 — 2.1 GB' },
    { label: 'CPU-användning', status: 'warning', icon: Cpu, detail: '72% — hög belastning' },
    { label: 'CDN', status: 'ok', icon: Globe, detail: 'Alla regioner aktiva' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Systemadministration</h2>

      {/* System health */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Systemhälsa</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {systemHealth.map((item, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-3 mb-2">
                <item.icon className="w-5 h-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-900">{item.label}</span>
                <span className={`ml-auto w-2.5 h-2.5 rounded-full ${item.status === 'ok' ? 'bg-green-500' : 'bg-amber-500'}`} />
              </div>
              <p className="text-xs text-gray-500">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Organizations table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Organisationer</h3>
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-gray-50 text-gray-500 uppercase text-xs tracking-wider">
                  <th className="px-5 py-3 font-medium">Organisation</th>
                  <th className="px-5 py-3 font-medium">Kliniker</th>
                  <th className="px-5 py-3 font-medium">Användare</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {MOCK_ORGS.map((org, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">{org.name}</td>
                    <td className="px-5 py-3 text-gray-600">{org.clinics}</td>
                    <td className="px-5 py-3 text-gray-600">{org.users}</td>
                    <td className="px-5 py-3">
                      <Badge className="bg-gray-100 text-gray-700">{org.plan}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge className={org.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                        {org.status === 'active' ? 'Aktiv' : 'Testperiod'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===========================================================================
   Main AdminPage
   =========================================================================== */

export function AdminPage() {
  const { clinicName, currentUserRole, setCurrentUserRole } = useDemo();
  const [activeSection, setActiveSection] = useState<Section>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  // Filter nav items based on role
  const visibleNav = NAV_ITEMS.filter(item => item.minRole.includes(currentUserRole));

  // If current section is not available for this role, reset to dashboard
  const currentSectionAvailable = visibleNav.some(item => item.id === activeSection);
  if (!currentSectionAvailable && activeSection !== 'dashboard') {
    setActiveSection('dashboard');
  }

  function handleNavClick(section: Section) {
    setActiveSection(section);
    setSidebarOpen(false);
  }

  function renderContent() {
    switch (activeSection) {
      case 'dashboard': return <DashboardSection />;
      case 'queue': return <QueueSection />;
      case 'rooms': return <RoomsSection />;
      case 'staff': return <StaffSection />;
      case 'settings': return <SettingsSection />;
      case 'clinics': return <ClinicsSection />;
      case 'system': return <SystemSection />;
      default: return <DashboardSection />;
    }
  }

  /* Sidebar content (shared between desktop and mobile) */
  function SidebarContent() {
    return (
      <div className="flex flex-col h-full">
        {/* Logo + clinic name */}
        <div className="px-5 py-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-sm">VK</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">VårdKö</p>
              <p className="text-xs text-gray-500 truncate">{clinicName}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNav.map(item => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <item.icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Role switcher (demo) */}
        <div className="px-3 pb-4 border-t border-gray-200 pt-4">
          <p className="px-3 mb-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Demo-roll</p>
          <div className="relative">
            <button
              onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <span className="font-medium">{ROLE_LABELS[currentUserRole]}</span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${roleDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {roleDropdownOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                {ALL_ROLES.map(role => (
                  <button
                    key={role}
                    onClick={() => { setCurrentUserRole(role); setRoleDropdownOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      currentUserRole === role
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile top bar */}
      <header className="lg:hidden bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
                <span className="text-white font-bold text-xs">VK</span>
              </div>
              <span className="text-sm font-bold text-gray-900">VårdKö</span>
            </div>
          </div>
          <Badge className="bg-blue-100 text-blue-700">{ROLE_LABELS[currentUserRole]}</Badge>
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <div className="absolute top-0 left-0 bottom-0 w-64 bg-white shadow-xl">
            <SidebarContent />
          </div>
        </div>
      )}

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white border-r border-gray-200 fixed top-0 bottom-0 left-0 z-30">
          <SidebarContent />
        </aside>

        {/* Main content */}
        <main className="flex-1 lg:ml-64 min-h-screen">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}
