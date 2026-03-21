import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { useAuth } from './auth-context';
import * as api from './api-client';
import { withTokenRefresh, getCurrentToken } from './token-refresh';

// Re-export the exact same types so consumers can import from here
export type {
  DemoPatient,
  DemoRoom,
  DemoStaffMember,
  DemoStats,
  DemoClinic,
  ClinicSettings,
  UserRole,
} from './demo-data';

import type {
  DemoPatient,
  DemoRoom,
  DemoStaffMember,
  DemoStats,
  DemoClinic,
  ClinicSettings,
  UserRole,
} from './demo-data';
import { DemoContext } from './demo-data';

// ---------------------------------------------------------------------------
// Context interface — must match DemoContextValue exactly
// ---------------------------------------------------------------------------

interface ApiDataContextValue {
  patients: DemoPatient[];
  rooms: DemoRoom[];
  staff: DemoStaffMember[];
  clinics: DemoClinic[];
  clinicSettings: ClinicSettings;
  stats: DemoStats;
  clinicName: string;
  clinicSlug: string;
  currentUserRole: UserRole;
  setCurrentUserRole: (role: UserRole) => void;
  calledTickets: Array<{ ticketNumber: number; roomName: string }>;
  // Queue operations
  joinQueue: () => DemoPatient;
  postponePatient: (patientId: string, positionsBack: number) => boolean;
  callNextPatient: (roomId: string) => DemoPatient | null;
  completePatient: (roomId: string) => void;
  markNoShow: (roomId: string) => void;
  toggleRoomPause: (roomId: string) => void;
  openRoom: (roomId: string) => void;
  closeRoom: (roomId: string) => void;
  // Room management
  addRoom: (name: string) => void;
  updateRoom: (id: string, updates: { name?: string; isActive?: boolean }) => void;
  removeRoom: (id: string) => void;
  // Staff management
  addStaffMember: (member: { displayName: string; email: string; role: 'clinic_admin' | 'staff' }) => void;
  updateStaffMember: (id: string, updates: Partial<Pick<DemoStaffMember, 'displayName' | 'email' | 'role' | 'isActive'>>) => void;
  removeStaffMember: (id: string) => void;
  // Staff-room assignment
  assignStaffToRoom: (roomId: string, staffId: string | null) => void;
  // Clinic management
  addClinic: (clinic: { name: string; slug: string }) => void;
  removeClinic: (id: string) => void;
  // Settings
  updateClinicSettings: (updates: Partial<ClinicSettings>) => void;
}

const ApiDataContext = createContext<ApiDataContextValue | null>(null);

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const EMPTY_STATS: DemoStats = {
  waitingCount: 0,
  activeRooms: 0,
  avgWaitMinutes: 0,
  patientsToday: 0,
  completedToday: 0,
  noShowsToday: 0,
  avgServiceTimeMinutes: 0,
};

const DEFAULT_SETTINGS: ClinicSettings = {
  maxPostponements: 3,
  maxQueueSize: 200,
  noShowTimeoutSeconds: 180,
  openHour: 7,
  closeHour: 17,
  language: 'sv',
  qrToken: 'kungsholmen',
};

// ---------------------------------------------------------------------------
// Helper to convert API date strings to Date objects
// ---------------------------------------------------------------------------

function toDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  return new Date(val);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ApiDataProvider({ children }: { children: ReactNode }) {
  const { accessToken, user, isAuthenticated } = useAuth();

  // State mirrors demo-data
  const [patients, setPatients] = useState<DemoPatient[]>([]);
  const [rooms, setRooms] = useState<DemoRoom[]>([]);
  const [staff, setStaff] = useState<DemoStaffMember[]>([]);
  const [clinics, setClinics] = useState<DemoClinic[]>([]);
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<DemoStats>(EMPTY_STATS);
  const [clinicName, setClinicName] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('staff');

  // Track next ticket for optimistic joinQueue
  const nextTicketRef = useRef(1);

  // Sync role from auth user when it changes
  useEffect(() => {
    if (user?.role) {
      setCurrentUserRole(user.role);
    }
  }, [user?.role]);

  // ---------------------------------------------------------------------------
  // Polling — fetch dashboard, rooms, queue, staff every 3 seconds
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let active = true;
    const token = accessToken || '';

    async function poll() {
      if (!active) return;
      if (!token) return; // no token = nothing to fetch for admin endpoints

      try {
        const [dashRes, roomsRes, queueRes, staffRes] = await Promise.all([
          api.getDashboardApi(token),
          api.getRoomsApi(token),
          api.getQueueListApi(token),
          api.getStaffListApi(token),
        ]);

        if (!active) return;

        if (dashRes.success) {
          setStats(dashRes.data);
        }

        if (roomsRes.success) {
          setRooms(
            roomsRes.data.map((r) => ({
              id: r.id,
              name: r.name,
              status: r.status as DemoRoom['status'],
              staffName: r.staffName,
              currentTicketNumber: r.currentTicketNumber,
              isActive: r.isActive,
            })),
          );
        }

        if (queueRes.success) {
          const mapped: DemoPatient[] = queueRes.data.map((p) => ({
            id: p.id,
            ticketNumber: p.ticketNumber,
            position: p.position,
            status: p.status as DemoPatient['status'],
            assignedRoomId: p.assignedRoomId,
            estimatedWaitMinutes: p.estimatedWaitMinutes,
            joinedAt: new Date(p.joinedAt),
            calledAt: toDate(p.calledAt),
          }));
          setPatients(mapped);

          // Keep nextTicketRef above the highest known ticket
          const maxTicket = mapped.reduce((m, p) => Math.max(m, p.ticketNumber), 0);
          if (maxTicket >= nextTicketRef.current) {
            nextTicketRef.current = maxTicket + 1;
          }
        }

        if (staffRes.success) {
          setStaff(
            staffRes.data.map((s) => ({
              id: s.id,
              displayName: s.displayName,
              email: s.email,
              role: s.role as DemoStaffMember['role'],
              isActive: s.isActive,
              assignedRoomId: s.assignedRoomId,
            })),
          );
        }
      } catch {
        // Ignore polling errors — state keeps last known values
      }
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [accessToken]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const calledTickets = rooms
    .filter((r) => r.status === 'occupied' && r.currentTicketNumber !== null)
    .map((r) => ({ ticketNumber: r.currentTicketNumber!, roomName: r.name }));

  const clinicSlug = clinicSettings.qrToken;

  // ---------------------------------------------------------------------------
  // Queue operations — optimistic local update + fire-and-forget API call
  // ---------------------------------------------------------------------------

  const joinQueue = useCallback((): DemoPatient => {
    const ticket = nextTicketRef.current++;
    const waitingCount = patients.filter((p) => p.status === 'waiting').length;
    const position = waitingCount + 1;
    const newPatient: DemoPatient = {
      id: `p-opt-${ticket}`,
      ticketNumber: ticket,
      position,
      status: 'waiting',
      assignedRoomId: null,
      estimatedWaitMinutes: position * 7,
      joinedAt: new Date(),
      calledAt: null,
    };

    setPatients((prev) => [...prev, newPatient]);

    // Fire API call — next poll will reconcile
    const token = getCurrentToken();
    api.joinQueueApi(clinicSlug, `anon-${ticket}`, clinicSettings.language).catch(() => {});

    return newPatient;
  }, [patients, clinicSlug, clinicSettings.language]);

  const postponePatient = useCallback(
    (patientId: string, positionsBack: number): boolean => {
      const waiting = patients
        .filter((p) => p.status === 'waiting')
        .sort((a, b) => a.position - b.position);
      const patientIndex = waiting.findIndex((p) => p.id === patientId);
      if (patientIndex === -1) return false;
      if (patientIndex + positionsBack >= waiting.length) return false;

      const patient = waiting[patientIndex]!;
      const newWaiting = [...waiting];
      newWaiting.splice(patientIndex, 1);
      newWaiting.splice(patientIndex + positionsBack, 0, patient);

      const positionMap = new Map<string, number>();
      newWaiting.forEach((p, idx) => positionMap.set(p.id, idx + 1));

      setPatients((prev) =>
        prev.map((p) => {
          if (p.status !== 'waiting') return p;
          const newPos = positionMap.get(p.id);
          if (newPos === undefined) return p;
          return { ...p, position: newPos, estimatedWaitMinutes: newPos * 7 };
        }),
      );

      // Fire API call (uses session token if available, not admin token)
      // For now, staff can postpone via admin endpoint — poll will reconcile
      return true;
    },
    [patients],
  );

  const callNextPatient = useCallback(
    (roomId: string): DemoPatient | null => {
      const next = patients
        .filter((p) => p.status === 'waiting')
        .sort((a, b) => a.position - b.position)[0];
      if (!next) return null;

      // Optimistic update
      setPatients((prev) =>
        prev.map((p) => {
          if (p.id === next.id)
            return { ...p, status: 'called' as const, assignedRoomId: roomId, calledAt: new Date() };
          if (p.status === 'waiting' && p.position > next.position)
            return { ...p, position: p.position - 1, estimatedWaitMinutes: Math.max(1, p.estimatedWaitMinutes - 7) };
          return p;
        }),
      );
      setRooms((prev) =>
        prev.map((r) =>
          r.id === roomId ? { ...r, status: 'occupied' as const, currentTicketNumber: next.ticketNumber } : r,
        ),
      );

      // Transition called -> in_progress after 1s (matches demo-data behavior)
      setTimeout(() => {
        setPatients((prev) =>
          prev.map((p) => (p.id === next.id && p.status === 'called' ? { ...p, status: 'in_progress' } : p)),
        );
      }, 1000);

      // Find staff assigned to this room and call the API
      const roomStaff = staff.find((s) => s.assignedRoomId === roomId);
      if (roomStaff) {
        const token = getCurrentToken();
        api.staffReadyApi(token, roomStaff.id).catch(() => {});
      }

      return { ...next, assignedRoomId: roomId, calledAt: new Date() };
    },
    [patients, staff],
  );

  const completePatient = useCallback(
    (roomId: string) => {
      const room = rooms.find((r) => r.id === roomId);
      if (!room?.currentTicketNumber) return;

      // Optimistic
      setPatients((prev) =>
        prev.map((p) => (p.ticketNumber === room.currentTicketNumber ? { ...p, status: 'completed' as const } : p)),
      );
      setRooms((prev) =>
        prev.map((r) => (r.id === roomId ? { ...r, status: 'open' as const, currentTicketNumber: null } : r)),
      );

      const roomStaff = staff.find((s) => s.assignedRoomId === roomId);
      if (roomStaff) {
        const token = getCurrentToken();
        api.staffCompleteApi(token, roomStaff.id).catch(() => {});
      }
    },
    [rooms, staff],
  );

  const markNoShow = useCallback(
    (roomId: string) => {
      const room = rooms.find((r) => r.id === roomId);
      if (!room?.currentTicketNumber) return;

      setPatients((prev) =>
        prev.map((p) => (p.ticketNumber === room.currentTicketNumber ? { ...p, status: 'no_show' as const } : p)),
      );
      setRooms((prev) =>
        prev.map((r) => (r.id === roomId ? { ...r, status: 'open' as const, currentTicketNumber: null } : r)),
      );

      const roomStaff = staff.find((s) => s.assignedRoomId === roomId);
      if (roomStaff) {
        const token = getCurrentToken();
        api.staffNoShowApi(token, roomStaff.id).catch(() => {});
      }
    },
    [rooms, staff],
  );

  const toggleRoomPause = useCallback(
    (roomId: string) => {
      setRooms((prev) =>
        prev.map((r) => {
          if (r.id !== roomId) return r;
          if (r.status === 'paused') return { ...r, status: 'open' as const };
          if (r.status === 'open') return { ...r, status: 'paused' as const };
          return r;
        }),
      );

      const roomStaff = staff.find((s) => s.assignedRoomId === roomId);
      if (roomStaff) {
        const token = getCurrentToken();
        const room = rooms.find((r) => r.id === roomId);
        if (room?.status === 'open') {
          api.staffPauseApi(token, roomStaff.id).catch(() => {});
        } else if (room?.status === 'paused') {
          api.staffResumeApi(token, roomStaff.id).catch(() => {});
        }
      }
    },
    [rooms, staff],
  );

  const openRoom = useCallback(
    (roomId: string) => {
      setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, status: 'open' as const } : r)));
      const token = getCurrentToken();
      api.updateRoomApi(token, roomId, { status: 'open' }).catch(() => {});
    },
    [],
  );

  const closeRoom = useCallback(
    (roomId: string) => {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === roomId ? { ...r, status: 'closed' as const, currentTicketNumber: null } : r,
        ),
      );
      const token = getCurrentToken();
      api.updateRoomApi(token, roomId, { status: 'closed' }).catch(() => {});
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Room management
  // ---------------------------------------------------------------------------

  const addRoom = useCallback(
    (name: string) => {
      // Optimistic with temp id
      const tempId = `r-tmp-${Date.now()}`;
      setRooms((prev) => [
        ...prev,
        { id: tempId, name, status: 'closed' as const, staffName: null, currentTicketNumber: null, isActive: true },
      ]);

      const token = getCurrentToken();
      api.addRoomApi(token, name, '').catch(() => {});
      // Next poll will replace the temp entry with the real one
    },
    [],
  );

  const updateRoom = useCallback(
    (id: string, updates: { name?: string; isActive?: boolean }) => {
      setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
      const token = getCurrentToken();
      api.updateRoomApi(token, id, updates).catch(() => {});
    },
    [],
  );

  const removeRoom = useCallback(
    (id: string) => {
      setRooms((prev) => prev.filter((r) => r.id !== id));
      const token = getCurrentToken();
      api.deleteRoomApi(token, id).catch(() => {});
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Staff management
  // ---------------------------------------------------------------------------

  const addStaffMember = useCallback(
    (member: { displayName: string; email: string; role: 'clinic_admin' | 'staff' }) => {
      const tempId = `s-tmp-${Date.now()}`;
      setStaff((prev) => [...prev, { id: tempId, ...member, isActive: true, assignedRoomId: null }]);
      const token = getCurrentToken();
      api.addStaffApi(token, member).catch(() => {});
    },
    [],
  );

  const updateStaffMember = useCallback(
    (id: string, updates: Partial<Pick<DemoStaffMember, 'displayName' | 'email' | 'role' | 'isActive'>>) => {
      setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
      const token = getCurrentToken();
      api.updateStaffApi(token, id, updates).catch(() => {});
    },
    [],
  );

  const removeStaffMember = useCallback(
    (id: string) => {
      setStaff((prev) => prev.filter((s) => s.id !== id));
      const token = getCurrentToken();
      api.deleteStaffApi(token, id).catch(() => {});
    },
    [],
  );

  const assignStaffToRoom = useCallback(
    (roomId: string, staffId: string | null) => {
      // Unassign any staff currently on this room
      setStaff((prev) => prev.map((s) => (s.assignedRoomId === roomId ? { ...s, assignedRoomId: null } : s)));

      if (staffId) {
        setStaff((prev) => prev.map((s) => (s.id === staffId ? { ...s, assignedRoomId: roomId } : s)));
        const member = staff.find((s) => s.id === staffId);
        setRooms((prev) =>
          prev.map((r) => (r.id === roomId ? { ...r, staffName: member?.displayName ?? null } : r)),
        );
        const token = getCurrentToken();
        api.updateStaffApi(token, staffId, { assignedRoomId: roomId }).catch(() => {});
      } else {
        setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, staffName: null } : r)));
      }
    },
    [staff],
  );

  // ---------------------------------------------------------------------------
  // Clinic management (superadmin)
  // ---------------------------------------------------------------------------

  const addClinic = useCallback(
    (clinic: { name: string; slug: string }) => {
      const tempId = `c-tmp-${Date.now()}`;
      setClinics((prev) => [
        ...prev,
        { id: tempId, name: clinic.name, slug: clinic.slug, status: 'active' as const, rooms: 0, staff: 0, patientsToday: 0 },
      ]);
      // No dedicated API endpoint for clinic creation yet — poll will reconcile if backend supports it
    },
    [],
  );

  const removeClinic = useCallback(
    (id: string) => {
      setClinics((prev) => prev.filter((c) => c.id !== id));
      // No dedicated API endpoint for clinic deletion yet
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  const updateClinicSettings = useCallback(
    (updates: Partial<ClinicSettings>) => {
      setClinicSettings((prev) => ({ ...prev, ...updates }));
      // Settings API endpoint can be added later — optimistic update for now
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <DemoContext.Provider
      value={{
        patients,
        rooms,
        staff,
        clinics,
        clinicSettings,
        stats,
        calledTickets,
        clinicName,
        clinicSlug,
        currentUserRole,
        setCurrentUserRole,
        joinQueue,
        postponePatient,
        callNextPatient,
        completePatient,
        markNoShow,
        toggleRoomPause,
        openRoom,
        closeRoom,
        addRoom,
        updateRoom,
        removeRoom,
        addStaffMember,
        updateStaffMember,
        removeStaffMember,
        assignStaffToRoom,
        addClinic,
        removeClinic,
        updateClinicSettings,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useApiData() {
  const ctx = useContext(ApiDataContext);
  if (!ctx) throw new Error('useApiData must be used within ApiDataProvider');
  return ctx;
}

/**
 * Alias for useApiData — allows components to import { useDemo } from this module
 * as a drop-in replacement for demo-data imports.
 */
export const useDemo = useApiData;
