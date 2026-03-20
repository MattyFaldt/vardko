export const TICKET_STATUSES = [
  'waiting',
  'called',
  'in_progress',
  'completed',
  'no_show',
  'cancelled',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const ROOM_STATUSES = ['open', 'occupied', 'paused', 'closed'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const DEFAULT_MAX_POSTPONEMENTS = 3;
export const DEFAULT_SERVICE_TIME_SECONDS = 480; // 8 minutes
export const SESSION_TOKEN_LENGTH = 128;
export const TICKET_EXPIRY_HOURS = 24;
export const NO_SHOW_TIMER_SECONDS = 180; // 3 minutes
export const MAX_QUEUE_SIZE = 200;
