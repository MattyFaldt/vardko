export interface QueueStatistics {
  id: string;
  organizationId: string;
  clinicId: string;
  date: string;
  hourSlot: number;
  dayOfWeek: number;
  totalPatients: number;
  avgServiceTimeSeconds: number | null;
  medianServiceTimeSeconds: number | null;
  p90ServiceTimeSeconds: number | null;
  avgWaitTimeSeconds: number | null;
  maxWaitTimeSeconds: number | null;
  roomsAvailable: number | null;
  noShowCount: number;
  postponeCount: number;
  createdAt: string;
}
