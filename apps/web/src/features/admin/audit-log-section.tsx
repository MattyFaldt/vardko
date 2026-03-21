import { useState, useMemo, useEffect } from 'react';
import {
  Filter,
  Calendar,
  UserCheck,
  DoorOpen,
  LogIn,
  Pause,
  CheckCircle2,
  UserPlus,
  Settings,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { getAuditLogApi } from '../../lib/api-client';

/* ---------------------------------------------------------------------------
   Types
   --------------------------------------------------------------------------- */

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorRole: 'patient' | 'staff' | 'admin';
  action: string;
  resource: string;
  details: string;
}

const ACTION_LABELS: Record<string, string> = {
  'queue.join': 'Köanmälan',
  'patient.called': 'Patient kallad',
  'room.opened': 'Rum öppnat',
  'room.paused': 'Rum pausat',
  'patient.completed': 'Patient klar',
  'user.created': 'Användare skapad',
  'settings.updated': 'Inställningar ändrade',
};

const ACTION_BADGE: Record<string, string> = {
  'queue.join': 'bg-blue-100 text-blue-700',
  'patient.called': 'bg-indigo-100 text-indigo-700',
  'room.opened': 'bg-green-100 text-green-700',
  'room.paused': 'bg-amber-100 text-amber-700',
  'patient.completed': 'bg-emerald-100 text-emerald-700',
  'user.created': 'bg-purple-100 text-purple-700',
  'settings.updated': 'bg-gray-100 text-gray-700',
};

const ACTION_ICON: Record<string, React.ElementType> = {
  'queue.join': LogIn,
  'patient.called': UserCheck,
  'room.opened': DoorOpen,
  'room.paused': Pause,
  'patient.completed': CheckCircle2,
  'user.created': UserPlus,
  'settings.updated': Settings,
};

const ALL_ACTIONS = Object.keys(ACTION_LABELS);

/* ---------------------------------------------------------------------------
   Component
   --------------------------------------------------------------------------- */

export function AuditLogSection() {
  const { accessToken } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;

    async function fetchAuditLog() {
      setLoading(true);
      setError('');
      try {
        const result = await getAuditLogApi(accessToken!);
        if (!active) return;
        if (result.success) {
          setEntries(
            result.data.map((e) => ({
              id: e.id,
              timestamp: e.timestamp,
              actor: e.userId,
              actorRole: 'staff' as const,
              action: e.action,
              resource: '',
              details: e.details,
            })),
          );
        } else {
          setError('Kunde inte hämta revisionsloggen.');
        }
      } catch {
        if (active) setError('Kunde inte nå servern.');
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchAuditLog();
    return () => { active = false; };
  }, [accessToken]);

  const filtered = useMemo(() => {
    let result = entries;
    if (actionFilter !== 'all') {
      result = result.filter(e => e.action === actionFilter);
    }
    if (dateFrom) {
      result = result.filter(e => e.timestamp >= dateFrom);
    }
    if (dateTo) {
      result = result.filter(e => e.timestamp <= dateTo + ' 23:59');
    }
    return result;
  }, [entries, actionFilter, dateFrom, dateTo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Laddar revisionslogg...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 rounded-xl p-6 text-center">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">Revisionslogg</h2>
        <button
          onClick={() => setFilterOpen(!filterOpen)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px] sm:hidden"
        >
          <Filter className="w-4 h-4" />
          Filter
          <ChevronDown className={`w-4 h-4 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className={`${filterOpen ? 'block' : 'hidden'} sm:block`}>
        <div className="bg-white rounded-xl shadow-sm p-4 flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-end">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-gray-500 mb-1">Åtgärdstyp</label>
            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px] bg-white"
            >
              <option value="all">Alla åtgärder</option>
              {ALL_ACTIONS.map(a => (
                <option key={a} value={a}>{ACTION_LABELS[a]}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              <Calendar className="w-3 h-3 inline mr-1" />
              Från datum
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px]"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              <Calendar className="w-3 h-3 inline mr-1" />
              Till datum
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px]"
            />
          </div>
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-gray-500">{filtered.length} poster</p>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-3">
        {filtered.map(entry => {
          const Icon = ACTION_ICON[entry.action] ?? Filter;
          return (
            <div key={entry.id} className="bg-white rounded-xl shadow-sm p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-400">{entry.timestamp}</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_BADGE[entry.action] ?? 'bg-gray-100 text-gray-700'}`}>
                  <Icon className="w-3 h-3" />
                  {ACTION_LABELS[entry.action] ?? entry.action}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{entry.actor}</p>
                <p className="text-xs text-gray-500">{entry.resource}</p>
              </div>
              <p className="text-sm text-gray-600">{entry.details}</p>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Tidpunkt</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Aktör</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Åtgärd</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Resurs</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Detaljer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(entry => {
                const Icon = ACTION_ICON[entry.action] ?? Filter;
                return (
                  <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{entry.timestamp}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{entry.actor}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${ACTION_BADGE[entry.action] ?? 'bg-gray-100 text-gray-700'}`}>
                        <Icon className="w-3 h-3" />
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{entry.resource}</td>
                    <td className="px-4 py-3 text-gray-600">{entry.details}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <p className="text-gray-400 text-sm">Inga loggposter matchar filtret.</p>
        </div>
      )}
    </div>
  );
}
