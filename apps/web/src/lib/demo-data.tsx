import { createContext, useContext } from 'react';

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

export interface DemoClinic {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'inactive';
  rooms: number;
  staff: number;
  patientsToday: number;
}

export interface ClinicSettings {
  maxPostponements: number;
  maxQueueSize: number;
  noShowTimeoutSeconds: number;
  openHour: number;
  closeHour: number;
  language: string;
  qrToken: string;
}

interface DemoContextValue {
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

export const DemoContext = createContext<DemoContextValue | null>(null);

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemo must be used within DemoProvider');
  return ctx;
}
