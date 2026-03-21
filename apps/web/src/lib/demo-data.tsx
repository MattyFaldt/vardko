import { createContext, useContext } from 'react';

export interface Patient {
  id: string;
  ticketNumber: number;
  position: number;
  status: 'waiting' | 'called' | 'in_progress' | 'completed' | 'no_show' | 'cancelled';
  assignedRoomId: string | null;
  estimatedWaitMinutes: number;
  joinedAt: Date;
  calledAt: Date | null;
}

export interface Room {
  id: string;
  name: string;
  status: 'open' | 'occupied' | 'paused' | 'closed';
  staffName: string | null;
  currentTicketNumber: number | null;
  isActive: boolean;
}

export interface StaffMember {
  id: string;
  displayName: string;
  email: string;
  role: 'org_admin' | 'clinic_admin' | 'staff';
  isActive: boolean;
  assignedRoomId: string | null;
}

export interface DashboardStats {
  waitingCount: number;
  activeRooms: number;
  avgWaitMinutes: number;
  patientsToday: number;
  completedToday: number;
  noShowsToday: number;
  avgServiceTimeMinutes: number;
}

export type UserRole = 'superadmin' | 'org_admin' | 'clinic_admin' | 'staff';

export interface Clinic {
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

interface AppDataContextValue {
  patients: Patient[];
  rooms: Room[];
  staff: StaffMember[];
  clinics: Clinic[];
  clinicSettings: ClinicSettings;
  stats: DashboardStats;
  clinicName: string;
  clinicSlug: string;
  currentUserRole: UserRole;
  setCurrentUserRole: (role: UserRole) => void;
  calledTickets: Array<{ ticketNumber: number; roomName: string }>;
  // Queue operations
  joinQueue: () => Patient;
  postponePatient: (patientId: string, positionsBack: number) => boolean;
  callNextPatient: (roomId: string) => Patient | null;
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
  addStaffMember: (member: { displayName: string; email: string; role: 'org_admin' | 'clinic_admin' | 'staff' }) => void;
  updateStaffMember: (id: string, updates: Partial<Pick<StaffMember, 'displayName' | 'email' | 'role' | 'isActive'>>) => void;
  removeStaffMember: (id: string) => void;
  // Staff-room assignment
  assignStaffToRoom: (roomId: string, staffId: string | null) => void;
  // Clinic management
  addClinic: (clinic: { name: string; slug: string }) => void;
  removeClinic: (id: string) => void;
  // Settings
  updateClinicSettings: (updates: Partial<ClinicSettings>) => void;
}

export const AppDataContext = createContext<AppDataContextValue | null>(null);

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within a data provider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Backward-compatible re-exports
// ---------------------------------------------------------------------------

export type DemoPatient = Patient;
export type DemoRoom = Room;
export type DemoStaffMember = StaffMember;
export type DemoStats = DashboardStats;
export type DemoClinic = Clinic;
export type DemoContextValue = AppDataContextValue;

/** @deprecated Use AppDataContext */
export const DemoContext = AppDataContext;

/** @deprecated Use useAppData */
export const useDemo = useAppData;
