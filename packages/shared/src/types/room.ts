import type { RoomStatus } from '../constants/queue.js';

export interface Room {
  id: string;
  organizationId: string;
  clinicId: string;
  name: string;
  displayOrder: number;
  status: RoomStatus;
  currentStaffId: string | null;
  currentTicketId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
