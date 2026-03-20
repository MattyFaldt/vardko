import type { TicketStatus } from '../constants/queue.js';
import type { SupportedLanguage } from '../constants/i18n.js';

export interface QueueTicket {
  id: string;
  organizationId: string;
  clinicId: string;
  ticketNumber: number;
  anonymousHash: string;
  status: TicketStatus;
  priority: number;
  position: number;
  assignedRoomId: string | null;
  sessionToken: string;
  estimatedWaitMinutes: number | null;
  joinedAt: string;
  calledAt: string | null;
  completedAt: string | null;
  language: SupportedLanguage;
  createdAt: string;
  updatedAt: string;
}

export interface JoinQueueInput {
  clinicId: string;
  anonymousHash: string;
  language: SupportedLanguage;
}

export interface JoinQueueResponse {
  sessionToken: string;
  ticketNumber: number;
  position: number;
  estimatedWaitMinutes: number;
}

export interface PostponeInput {
  positionsBack: number;
}

export interface QueuePosition {
  ticketNumber: number;
  position: number;
  estimatedWaitMinutes: number;
  status: TicketStatus;
  queueLength: number;
}
