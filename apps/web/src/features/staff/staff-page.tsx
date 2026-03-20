import { useState, useEffect, useMemo } from 'react';
import {
  DoorOpen,
  DoorClosed,
  UserRoundCheck,
  UserRoundX,
  Play,
  Pause,
  XCircle,
  Clock,
  Users,
  Activity,
  ChevronDown,
  Stethoscope,
  Hash,
} from 'lucide-react';
import { useDemo } from '../../lib/demo-data';

/* ------------------------------------------------------------------ */
/*  Elapsed-time hook – ticks every second while a patient is active  */
/* ------------------------------------------------------------------ */
function useElapsed(since: Date | null): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [since]);

  if (!since) return '0:00';
  const diff = Math.max(0, Math.floor((now - since.getTime()) / 1_000));
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG = {
  open: { label: 'Ledig', dot: 'bg-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  occupied: { label: 'Upptaget', dot: 'bg-blue-500', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  paused: { label: 'Pausat', dot: 'bg-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  closed: { label: 'Stängt', dot: 'bg-gray-400', bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-500' },
} as const;

function formatWait(joinedAt: Date): string {
  const mins = Math.max(0, Math.round((Date.now() - joinedAt.getTime()) / 60_000));
  if (mins < 1) return '<1 min';
  return `${mins} min`;
}

/* ------------------------------------------------------------------ */
/*  StatusBadge                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: keyof typeof STATUS_CONFIG }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text} ${cfg.border} border`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  StaffPage                                                         */
/* ------------------------------------------------------------------ */

export function StaffPage() {
  const {
    rooms,
    patients,
    stats,
    callNextPatient,
    completePatient,
    markNoShow,
    toggleRoomPause,
    openRoom,
    closeRoom,
  } = useDemo();

  // Default to first room that has a staffName, or simply the first room.
  const defaultRoomId = useMemo(() => {
    const staffRoom = rooms.find(r => r.staffName);
    return staffRoom?.id ?? rooms[0]?.id ?? '';
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [selectedRoomId, setSelectedRoomId] = useState(defaultRoomId);

  const selectedRoom = rooms.find(r => r.id === selectedRoomId) ?? rooms[0];

  // Find the in-progress patient for this room (to get calledAt for timer).
  const currentPatient = useMemo(() => {
    if (!selectedRoom || selectedRoom.status !== 'occupied') return null;
    return patients.find(
      p =>
        p.assignedRoomId === selectedRoom.id &&
        (p.status === 'in_progress' || p.status === 'called'),
    ) ?? null;
  }, [patients, selectedRoom]);

  const elapsed = useElapsed(currentPatient?.calledAt ?? null);

  const waitingPatients = useMemo(
    () => patients.filter(p => p.status === 'waiting').sort((a, b) => a.position - b.position),
    [patients],
  );

  /* ---- action handlers ---- */
  const handleCallNext = () => {
    if (selectedRoom) callNextPatient(selectedRoom.id);
  };
  const handleComplete = () => {
    if (selectedRoom) completePatient(selectedRoom.id);
  };
  const handleNoShow = () => {
    if (selectedRoom) markNoShow(selectedRoom.id);
  };
  const handleTogglePause = () => {
    if (selectedRoom) toggleRoomPause(selectedRoom.id);
  };
  const handleOpen = () => {
    if (selectedRoom) openRoom(selectedRoom.id);
  };
  const handleClose = () => {
    if (selectedRoom) closeRoom(selectedRoom.id);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ──────────────── HEADER ──────────────── */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Stethoscope className="h-6 w-6 text-indigo-600" />
            <h1 className="text-xl font-semibold text-gray-900">Personal</h1>
          </div>

          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4 text-indigo-500" />
              <strong className="font-semibold text-gray-900">{stats.waitingCount}</strong> väntar
            </span>
            <span className="hidden sm:inline text-gray-300">|</span>
            <span className="inline-flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-emerald-500" />
              <strong className="font-semibold text-gray-900">{stats.activeRooms}</strong> rum aktiva
            </span>
            <span className="hidden sm:inline text-gray-300">|</span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-amber-500" />
              snitt väntetid{' '}
              <strong className="font-semibold text-gray-900">{stats.avgWaitMinutes} min</strong>
            </span>
          </div>
        </div>
      </header>

      {/* ──────────────── BODY ──────────────── */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* ═══════════ LEFT: Main panel ═══════════ */}
          <div className="flex-1 space-y-6">
            {/* Room selector */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <label htmlFor="room-select" className="mb-2 block text-sm font-medium text-gray-700">
                Välj ditt rum
              </label>
              <div className="relative">
                <select
                  id="room-select"
                  value={selectedRoomId}
                  onChange={e => setSelectedRoomId(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-gray-300 bg-white py-3 pl-4 pr-10 text-base font-medium text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  {rooms.map(room => {
                    const cfg = STATUS_CONFIG[room.status];
                    return (
                      <option key={room.id} value={room.id}>
                        {room.name} — {cfg.label}
                        {room.staffName ? ` (${room.staffName})` : ''}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              </div>
            </div>

            {/* Room control panel */}
            {selectedRoom && (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                {/* Panel header */}
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-gray-900">{selectedRoom.name}</h2>
                    <StatusBadge status={selectedRoom.status} />
                  </div>
                  {selectedRoom.staffName && (
                    <span className="text-sm text-gray-500">{selectedRoom.staffName}</span>
                  )}
                </div>

                {/* Panel body */}
                <div className="px-6 py-8">
                  {/* ── CLOSED ── */}
                  {selectedRoom.status === 'closed' && (
                    <div className="flex flex-col items-center gap-6 py-8">
                      <DoorClosed className="h-16 w-16 text-gray-300" />
                      <p className="text-lg text-gray-500">Rummet är stängt</p>
                      <button
                        onClick={handleOpen}
                        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-4 text-lg font-semibold text-white shadow-md transition hover:bg-indigo-700 active:scale-[0.98]"
                      >
                        <DoorOpen className="h-6 w-6" />
                        Öppna rum
                      </button>
                    </div>
                  )}

                  {/* ── OPEN (no patient) ── */}
                  {selectedRoom.status === 'open' && (
                    <div className="flex flex-col items-center gap-6 py-4">
                      <DoorOpen className="h-16 w-16 text-emerald-300" />
                      <p className="text-base text-gray-500">
                        {waitingPatients.length > 0
                          ? `${waitingPatients.length} patient${waitingPatients.length === 1 ? '' : 'er'} väntar i kön`
                          : 'Inga patienter i kö just nu'}
                      </p>
                      <button
                        onClick={handleCallNext}
                        disabled={waitingPatients.length === 0}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-10 py-5 text-xl font-semibold text-white shadow-md transition hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
                      >
                        <UserRoundCheck className="h-7 w-7" />
                        Nästa patient
                      </button>

                      {/* Secondary actions */}
                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={handleTogglePause}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
                        >
                          <Pause className="h-4 w-4" />
                          Pausa
                        </button>
                        <button
                          onClick={handleClose}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
                        >
                          <XCircle className="h-4 w-4" />
                          Stäng rum
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── OCCUPIED ── */}
                  {selectedRoom.status === 'occupied' && (
                    <div className="flex flex-col items-center gap-6 py-2">
                      {/* Ticket number */}
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-medium uppercase tracking-wider text-gray-400">
                          Nuvarande patient
                        </span>
                        <span className="mt-1 flex items-center gap-2 text-6xl font-bold tabular-nums text-blue-700">
                          <Hash className="h-10 w-10 text-blue-400" />
                          {selectedRoom.currentTicketNumber}
                        </span>
                      </div>

                      {/* Timer */}
                      <div className="flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-blue-700">
                        <Clock className="h-4 w-4" />
                        <span className="text-lg font-semibold tabular-nums">{elapsed}</span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap justify-center gap-4 pt-2">
                        <button
                          onClick={handleComplete}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-4 text-lg font-semibold text-white shadow-md transition hover:bg-emerald-700 active:scale-[0.98]"
                        >
                          <UserRoundCheck className="h-6 w-6" />
                          Klar
                        </button>
                        <button
                          onClick={handleNoShow}
                          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-8 py-4 text-lg font-semibold text-white shadow-md transition hover:bg-red-700 active:scale-[0.98]"
                        >
                          <UserRoundX className="h-6 w-6" />
                          Utebliven
                        </button>
                      </div>

                      {/* Secondary actions */}
                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={handleClose}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
                        >
                          <XCircle className="h-4 w-4" />
                          Stäng rum
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── PAUSED ── */}
                  {selectedRoom.status === 'paused' && (
                    <div className="flex flex-col items-center gap-6 py-8">
                      <Pause className="h-16 w-16 text-amber-300" />
                      <p className="text-lg text-gray-500">Rummet är pausat</p>
                      <button
                        onClick={handleTogglePause}
                        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-4 text-lg font-semibold text-white shadow-md transition hover:bg-indigo-700 active:scale-[0.98]"
                      >
                        <Play className="h-6 w-6" />
                        Återuppta
                      </button>

                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={handleClose}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
                        >
                          <XCircle className="h-4 w-4" />
                          Stäng rum
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* All rooms overview (mobile: visible, desktop: hidden since sidebar shows queue) */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm lg:hidden">
              <div className="border-b border-gray-100 px-6 py-4">
                <h3 className="text-sm font-semibold text-gray-900">Kööversikt</h3>
              </div>
              <QueueList patients={waitingPatients} />
            </div>
          </div>

          {/* ═══════════ RIGHT: Queue sidebar (desktop) ═══════════ */}
          <aside className="hidden w-80 shrink-0 lg:block">
            <div className="sticky top-6 space-y-4">
              {/* Queue */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <Users className="h-4 w-4 text-indigo-500" />
                    Väntande patienter
                    <span className="ml-auto rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
                      {waitingPatients.length}
                    </span>
                  </h3>
                </div>
                <QueueList patients={waitingPatients} />
              </div>

              {/* Room overview */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h3 className="text-sm font-semibold text-gray-900">Alla rum</h3>
                </div>
                <ul className="divide-y divide-gray-50">
                  {rooms.map(room => {
                    const cfg = STATUS_CONFIG[room.status];
                    return (
                      <li
                        key={room.id}
                        className="flex items-center justify-between px-5 py-3 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                          <span className="font-medium text-gray-800">{room.name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-500">
                          {room.currentTicketNumber && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                              #{room.currentTicketNumber}
                            </span>
                          )}
                          <span className={`text-xs ${cfg.text}`}>{cfg.label}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  QueueList – shared between mobile & desktop                       */
/* ------------------------------------------------------------------ */

function QueueList({ patients }: { patients: ReturnType<typeof useDemo>['patients'] }) {
  if (patients.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-sm text-gray-400">
        Inga patienter väntar
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-50">
      {patients.map((p, i) => (
        <li key={p.id} className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
              {p.ticketNumber}
            </span>
            <span className="text-sm text-gray-500">Plats {i + 1}</span>
          </div>
          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
            <Clock className="h-3 w-3" />
            {formatWait(p.joinedAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
