export interface QueueUpdateData {
  position: number;
  estimatedWait: number;
  queueLength: number;
}

export interface YourTurnData {
  roomName: string;
  roomId: string;
}

export interface PositionChangedData {
  oldPosition: number;
  newPosition: number;
  estimatedWait: number;
}

export interface NoShowData {
  message: string;
}

export interface PatientAssignedData {
  ticketNumber: number;
  encryptedPnr: string;
}

export interface RoomStatusChangedData {
  roomId: string;
  status: string;
  roomName: string;
}

export interface QueueStatsData {
  waiting: number;
  avgWait: number;
  activeRooms: number;
}

export interface DisplayUpdateData {
  calledTickets: Array<{ ticketNumber: number; roomName: string }>;
}

export type WSMessage =
  | { type: 'QUEUE_UPDATE'; data: QueueUpdateData }
  | { type: 'YOUR_TURN'; data: YourTurnData }
  | { type: 'POSITION_CHANGED'; data: PositionChangedData }
  | { type: 'NO_SHOW'; data: NoShowData }
  | { type: 'PATIENT_ASSIGNED'; data: PatientAssignedData }
  | { type: 'ROOM_STATUS_CHANGED'; data: RoomStatusChangedData }
  | { type: 'QUEUE_STATS'; data: QueueStatsData }
  | { type: 'DISPLAY_UPDATE'; data: DisplayUpdateData }
  | { type: 'HEARTBEAT'; data: Record<string, never> };
