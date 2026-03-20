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

interface DemoContextValue {
  patients: DemoPatient[];
  rooms: DemoRoom[];
  stats: DemoStats;
  clinicName: string;
  clinicSlug: string;
  calledTickets: Array<{ ticketNumber: number; roomName: string }>;
  joinQueue: () => DemoPatient;
  callNextPatient: (roomId: string) => DemoPatient | null;
  completePatient: (roomId: string) => void;
  markNoShow: (roomId: string) => void;
  toggleRoomPause: (roomId: string) => void;
  openRoom: (roomId: string) => void;
  closeRoom: (roomId: string) => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

const INITIAL_ROOMS: DemoRoom[] = [
  { id: 'r1', name: 'Rum 1', status: 'occupied', staffName: 'Erik Eriksson', currentTicketNumber: 3 },
  { id: 'r2', name: 'Rum 2', status: 'occupied', staffName: 'Maria Johansson', currentTicketNumber: 5 },
  { id: 'r3', name: 'Rum 3', status: 'open', staffName: 'Anna Lindberg', currentTicketNumber: null },
  { id: 'r4', name: 'Rum 4', status: 'paused', staffName: 'Karl Svensson', currentTicketNumber: null },
  { id: 'r5', name: 'Rum 5', status: 'closed', staffName: null, currentTicketNumber: null },
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

export function DemoProvider({ children }: { children: ReactNode }) {
  const [patients, setPatients] = useState<DemoPatient[]>(makeInitialPatients);
  const [rooms, setRooms] = useState<DemoRoom[]>(INITIAL_ROOMS);
  const [nextTicket, setNextTicket] = useState(11);

  // Recalculate waiting times periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setPatients(prev => {
        const waiting = prev.filter(p => p.status === 'waiting');
        if (waiting.length === 0) return prev;
        return prev.map(p => {
          if (p.status !== 'waiting') return p;
          const newWait = Math.max(1, p.estimatedWaitMinutes - 1);
          return { ...p, estimatedWaitMinutes: newWait };
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
      id: `p${ticket}`,
      ticketNumber: ticket,
      position,
      status: 'waiting',
      assignedRoomId: null,
      estimatedWaitMinutes: position * 7,
      joinedAt: new Date(),
      calledAt: null,
    };
    setPatients(prev => [...prev, newPatient]);
    return newPatient;
  }, [nextTicket, patients]);

  const callNextPatient = useCallback((roomId: string) => {
    const next = patients
      .filter(p => p.status === 'waiting')
      .sort((a, b) => a.position - b.position)[0];
    if (!next) return null;

    setPatients(prev => {
      const updated = prev.map(p => {
        if (p.id === next.id) return { ...p, status: 'called' as const, assignedRoomId: roomId, calledAt: new Date() };
        if (p.status === 'waiting' && p.position > next.position) return { ...p, position: p.position - 1, estimatedWaitMinutes: Math.max(1, p.estimatedWaitMinutes - 7) };
        return p;
      });
      return updated;
    });

    const room = rooms.find(r => r.id === roomId);
    setRooms(prev => prev.map(r =>
      r.id === roomId ? { ...r, status: 'occupied', currentTicketNumber: next.ticketNumber } : r
    ));

    setTimeout(() => {
      setPatients(prev => prev.map(p =>
        p.id === next.id && p.status === 'called' ? { ...p, status: 'in_progress' } : p
      ));
    }, 1000);

    return { ...next, assignedRoomId: roomId, calledAt: new Date() };
  }, [patients, rooms]);

  const completePatient = useCallback((roomId: string) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room?.currentTicketNumber) return;

    setPatients(prev => prev.map(p =>
      p.ticketNumber === room.currentTicketNumber ? { ...p, status: 'completed' } : p
    ));
    setRooms(prev => prev.map(r =>
      r.id === roomId ? { ...r, status: 'open', currentTicketNumber: null } : r
    ));
  }, [rooms]);

  const markNoShow = useCallback((roomId: string) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room?.currentTicketNumber) return;

    setPatients(prev => prev.map(p =>
      p.ticketNumber === room.currentTicketNumber ? { ...p, status: 'no_show' } : p
    ));
    setRooms(prev => prev.map(r =>
      r.id === roomId ? { ...r, status: 'open', currentTicketNumber: null } : r
    ));
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
    setRooms(prev => prev.map(r =>
      r.id === roomId ? { ...r, status: 'open' } : r
    ));
  }, []);

  const closeRoom = useCallback((roomId: string) => {
    setRooms(prev => prev.map(r =>
      r.id === roomId ? { ...r, status: 'closed', currentTicketNumber: null } : r
    ));
  }, []);

  return (
    <DemoContext.Provider value={{
      patients, rooms, stats, calledTickets,
      clinicName: 'Kungsholmens Vårdcentral',
      clinicSlug: 'kungsholmen',
      joinQueue, callNextPatient, completePatient, markNoShow,
      toggleRoomPause, openRoom, closeRoom,
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
