import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

export interface DemoPatient {
  id: string;
  ticketNumber: number;
  position: number;
  status: 'waiting' | 'called' | 'in_progress' | 'completed' | 'no_show' | 'cancelled';
  assignedRoomId: string | null;
  estimatedWaitMinutes: number;
  joinedAt: Date;
  calledAt: Date | null;
}

export interface DemoRoom {
  id: string;
  name: string;
  status: 'open' | 'occupied' | 'paused' | 'closed';
  staffName: string | null;
  currentTicketNumber: number | null;
  isActive: boolean;
}

export interface DemoStaffMember {
  id: string;
  displayName: string;
  email: string;
  role: 'clinic_admin' | 'staff';
  isActive: boolean;
  assignedRoomId: string | null;
}

export interface DemoStats {
  waitingCount: number;
  activeRooms: number;
  avgWaitMinutes: number;
  patientsToday: number;
  completedToday: number;
  noShowsToday: number;
  avgServiceTimeMinutes: number;
}

export type UserRole = 'superadmin' | 'org_admin' | 'clinic_admin' | 'staff';

interface DemoContextValue {
  patients: DemoPatient[];
  rooms: DemoRoom[];
  staff: DemoStaffMember[];
  stats: DemoStats;
  clinicName: string;
  clinicSlug: string;
  currentUserRole: UserRole;
  setCurrentUserRole: (role: UserRole) => void;
  calledTickets: Array<{ ticketNumber: number; roomName: string }>;
  // Queue operations
  joinQueue: () => DemoPatient;
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
}

const DemoContext = createContext<DemoContextValue | null>(null);

const INITIAL_ROOMS: DemoRoom[] = [
  { id: 'r1', name: 'Rum 1', status: 'occupied', staffName: 'Erik Eriksson', currentTicketNumber: 3, isActive: true },
  { id: 'r2', name: 'Rum 2', status: 'occupied', staffName: 'Maria Johansson', currentTicketNumber: 5, isActive: true },
  { id: 'r3', name: 'Rum 3', status: 'open', staffName: 'Anna Lindberg', currentTicketNumber: null, isActive: true },
  { id: 'r4', name: 'Rum 4', status: 'paused', staffName: 'Karl Svensson', currentTicketNumber: null, isActive: true },
  { id: 'r5', name: 'Rum 5', status: 'closed', staffName: null, currentTicketNumber: null, isActive: true },
];

const INITIAL_STAFF: DemoStaffMember[] = [
  { id: 's1', displayName: 'Anna Adminsson', email: 'anna@kungsholmen.se', role: 'clinic_admin', isActive: true, assignedRoomId: null },
  { id: 's2', displayName: 'Erik Eriksson', email: 'erik@kungsholmen.se', role: 'staff', isActive: true, assignedRoomId: 'r1' },
  { id: 's3', displayName: 'Maria Johansson', email: 'maria@kungsholmen.se', role: 'staff', isActive: true, assignedRoomId: 'r2' },
  { id: 's4', displayName: 'Anna Lindberg', email: 'anna.l@kungsholmen.se', role: 'staff', isActive: true, assignedRoomId: 'r3' },
  { id: 's5', displayName: 'Karl Svensson', email: 'karl@kungsholmen.se', role: 'staff', isActive: true, assignedRoomId: 'r4' },
];

function makeInitialPatients(): DemoPatient[] {
  const now = new Date();
  return [
    { id: 'p1', ticketNumber: 1, position: 0, status: 'completed', assignedRoomId: 'r1', estimatedWaitMinutes: 0, joinedAt: new Date(now.getTime() - 45 * 60000), calledAt: new Date(now.getTime() - 35 * 60000) },
    { id: 'p2', ticketNumber: 2, position: 0, status: 'completed', assignedRoomId: 'r2', estimatedWaitMinutes: 0, joinedAt: new Date(now.getTime() - 40 * 60000), calledAt: new Date(now.getTime() - 30 * 60000) },
    { id: 'p3', ticketNumber: 3, position: 0, status: 'in_progress', assignedRoomId: 'r1', estimatedWaitMinutes: 0, joinedAt: new Date(now.getTime() - 30 * 60000), calledAt: new Date(now.getTime() - 5 * 60000) },
    { id: 'p4', ticketNumber: 4, position: 0, status: 'no_show', assignedRoomId: null, estimatedWaitMinutes: 0, joinedAt: new Date(now.getTime() - 25 * 60000), calledAt: new Date(now.getTime() - 10 * 60000) },
    { id: 'p5', ticketNumber: 5, position: 0, status: 'in_progress', assignedRoomId: 'r2', estimatedWaitMinutes: 0, joinedAt: new Date(now.getTime() - 20 * 60000), calledAt: new Date(now.getTime() - 3 * 60000) },
    { id: 'p6', ticketNumber: 6, position: 1, status: 'waiting', assignedRoomId: null, estimatedWaitMinutes: 8, joinedAt: new Date(now.getTime() - 15 * 60000), calledAt: null },
    { id: 'p7', ticketNumber: 7, position: 2, status: 'waiting', assignedRoomId: null, estimatedWaitMinutes: 14, joinedAt: new Date(now.getTime() - 12 * 60000), calledAt: null },
    { id: 'p8', ticketNumber: 8, position: 3, status: 'waiting', assignedRoomId: null, estimatedWaitMinutes: 20, joinedAt: new Date(now.getTime() - 8 * 60000), calledAt: null },
    { id: 'p9', ticketNumber: 9, position: 4, status: 'waiting', assignedRoomId: null, estimatedWaitMinutes: 26, joinedAt: new Date(now.getTime() - 5 * 60000), calledAt: null },
    { id: 'p10', ticketNumber: 10, position: 5, status: 'waiting', assignedRoomId: null, estimatedWaitMinutes: 32, joinedAt: new Date(now.getTime() - 2 * 60000), calledAt: null },
  ];
}

let nextRoomId = 6;
let nextStaffId = 6;

export function DemoProvider({ children }: { children: ReactNode }) {
  const [patients, setPatients] = useState<DemoPatient[]>(makeInitialPatients);
  const [rooms, setRooms] = useState<DemoRoom[]>(INITIAL_ROOMS);
  const [staff, setStaff] = useState<DemoStaffMember[]>(INITIAL_STAFF);
  const [nextTicket, setNextTicket] = useState(11);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('clinic_admin');

  useEffect(() => {
    const interval = setInterval(() => {
      setPatients(prev => {
        const waiting = prev.filter(p => p.status === 'waiting');
        if (waiting.length === 0) return prev;
        return prev.map(p => {
          if (p.status !== 'waiting') return p;
          return { ...p, estimatedWaitMinutes: Math.max(1, p.estimatedWaitMinutes - 1) };
        });
      });
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const calledTickets = rooms
    .filter(r => r.status === 'occupied' && r.currentTicketNumber !== null)
    .map(r => ({ ticketNumber: r.currentTicketNumber!, roomName: r.name }));

  const waitingPatients = patients.filter(p => p.status === 'waiting');
  const activeRoomCount = rooms.filter(r => r.status === 'open' || r.status === 'occupied').length;

  const stats: DemoStats = {
    waitingCount: waitingPatients.length,
    activeRooms: activeRoomCount,
    avgWaitMinutes: waitingPatients.length > 0
      ? Math.round(waitingPatients.reduce((s, p) => s + p.estimatedWaitMinutes, 0) / waitingPatients.length)
      : 0,
    patientsToday: patients.length,
    completedToday: patients.filter(p => p.status === 'completed').length,
    noShowsToday: patients.filter(p => p.status === 'no_show').length,
    avgServiceTimeMinutes: 7,
  };

  const joinQueue = useCallback(() => {
    const ticket = nextTicket;
    setNextTicket(t => t + 1);
    const position = patients.filter(p => p.status === 'waiting').length + 1;
    const newPatient: DemoPatient = {
      id: `p${ticket}`, ticketNumber: ticket, position, status: 'waiting',
      assignedRoomId: null, estimatedWaitMinutes: position * 7, joinedAt: new Date(), calledAt: null,
    };
    setPatients(prev => [...prev, newPatient]);
    return newPatient;
  }, [nextTicket, patients]);

  const callNextPatient = useCallback((roomId: string) => {
    const next = patients.filter(p => p.status === 'waiting').sort((a, b) => a.position - b.position)[0];
    if (!next) return null;
    setPatients(prev => prev.map(p => {
      if (p.id === next.id) return { ...p, status: 'called' as const, assignedRoomId: roomId, calledAt: new Date() };
      if (p.status === 'waiting' && p.position > next.position) return { ...p, position: p.position - 1, estimatedWaitMinutes: Math.max(1, p.estimatedWaitMinutes - 7) };
      return p;
    }));
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status: 'occupied', currentTicketNumber: next.ticketNumber } : r));
    setTimeout(() => {
      setPatients(prev => prev.map(p => p.id === next.id && p.status === 'called' ? { ...p, status: 'in_progress' } : p));
    }, 1000);
    return { ...next, assignedRoomId: roomId, calledAt: new Date() };
  }, [patients]);

  const completePatient = useCallback((roomId: string) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room?.currentTicketNumber) return;
    setPatients(prev => prev.map(p => p.ticketNumber === room.currentTicketNumber ? { ...p, status: 'completed' } : p));
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status: 'open', currentTicketNumber: null } : r));
  }, [rooms]);

  const markNoShow = useCallback((roomId: string) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room?.currentTicketNumber) return;
    setPatients(prev => prev.map(p => p.ticketNumber === room.currentTicketNumber ? { ...p, status: 'no_show' } : p));
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status: 'open', currentTicketNumber: null } : r));
  }, [rooms]);

  const toggleRoomPause = useCallback((roomId: string) => {
    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      if (r.status === 'paused') return { ...r, status: 'open' };
      if (r.status === 'open') return { ...r, status: 'paused' };
      return r;
    }));
  }, []);

  const openRoom = useCallback((roomId: string) => {
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status: 'open' } : r));
  }, []);

  const closeRoom = useCallback((roomId: string) => {
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status: 'closed', currentTicketNumber: null } : r));
  }, []);

  // Room management
  const addRoom = useCallback((name: string) => {
    const id = `r${nextRoomId++}`;
    setRooms(prev => [...prev, { id, name, status: 'closed', staffName: null, currentTicketNumber: null, isActive: true }]);
  }, []);

  const updateRoom = useCallback((id: string, updates: { name?: string; isActive?: boolean }) => {
    setRooms(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const removeRoom = useCallback((id: string) => {
    setRooms(prev => prev.filter(r => r.id !== id));
  }, []);

  // Staff management
  const addStaffMember = useCallback((member: { displayName: string; email: string; role: 'clinic_admin' | 'staff' }) => {
    const id = `s${nextStaffId++}`;
    setStaff(prev => [...prev, { id, ...member, isActive: true, assignedRoomId: null }]);
  }, []);

  const updateStaffMember = useCallback((id: string, updates: Partial<Pick<DemoStaffMember, 'displayName' | 'email' | 'role' | 'isActive'>>) => {
    setStaff(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const removeStaffMember = useCallback((id: string) => {
    setStaff(prev => prev.filter(s => s.id !== id));
  }, []);

  return (
    <DemoContext.Provider value={{
      patients, rooms, staff, stats, calledTickets,
      clinicName: 'Kungsholmens Vårdcentral', clinicSlug: 'kungsholmen',
      currentUserRole, setCurrentUserRole,
      joinQueue, callNextPatient, completePatient, markNoShow,
      toggleRoomPause, openRoom, closeRoom,
      addRoom, updateRoom, removeRoom,
      addStaffMember, updateStaffMember, removeStaffMember,
    }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemo must be used within DemoProvider');
  return ctx;
}
