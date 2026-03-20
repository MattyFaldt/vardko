export const QUEUE_EVENTS = {
  PATIENT_JOINED: 'patient.joined',
  PATIENT_CALLED: 'patient.called',
  PATIENT_COMPLETED: 'patient.completed',
  PATIENT_NO_SHOW: 'patient.no_show',
  PATIENT_CANCELLED: 'patient.cancelled',
  PATIENT_POSTPONED: 'patient.postponed',
  POSITION_UPDATED: 'position.updated',
  ROOM_OPENED: 'room.opened',
  ROOM_CLOSED: 'room.closed',
  ROOM_PAUSED: 'room.paused',
  ROOM_RESUMED: 'room.resumed',
  QUEUE_STATS_UPDATED: 'queue.stats_updated',
  DISPLAY_UPDATED: 'display.updated',
} as const;

export type QueueEvent = (typeof QUEUE_EVENTS)[keyof typeof QUEUE_EVENTS];

export interface QueueEventPayload {
  clinicId: string;
  event: QueueEvent;
  data: Record<string, unknown>;
  timestamp: string;
}
