import type { TicketStatus, RoomStatus } from '@vardko/shared';

export interface QueuedPatient {
  id: string;
  ticketNumber: number;
  position: number;
  status: TicketStatus;
  priority: number;
}

export interface AvailableRoom {
  id: string;
  name: string;
  status: RoomStatus;
  currentStaffId: string | null;
}

export interface AssignmentResult {
  patientId: string;
  ticketNumber: number;
  roomId: string;
  roomName: string;
}

/**
 * Finds the next patient to assign to a room.
 * Priority: lowest position with status='waiting' and lowest priority value (0 = normal).
 */
export function findNextPatient(patients: QueuedPatient[]): QueuedPatient | null {
  const waiting = patients
    .filter((p) => p.status === 'waiting')
    .sort((a, b) => {
      // Lower priority value = higher actual priority (0 = normal, higher = deprioritized)
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.position - b.position;
    });

  return waiting[0] ?? null;
}

/**
 * Finds available rooms (status = 'open' and has staff assigned).
 */
export function findAvailableRooms(rooms: AvailableRoom[]): AvailableRoom[] {
  return rooms.filter((r) => r.status === 'open' && r.currentStaffId !== null);
}

/**
 * Attempts to assign the next waiting patient to an available room.
 * Returns null if no patient is waiting or no room is available.
 */
export function tryAssignPatient(
  patients: QueuedPatient[],
  rooms: AvailableRoom[],
): AssignmentResult | null {
  const nextPatient = findNextPatient(patients);
  if (!nextPatient) return null;

  const availableRooms = findAvailableRooms(rooms);
  if (availableRooms.length === 0) return null;

  // Assign to the first available room (by display order, assumed pre-sorted)
  const room = availableRooms[0]!;

  return {
    patientId: nextPatient.id,
    ticketNumber: nextPatient.ticketNumber,
    roomId: room.id,
    roomName: room.name,
  };
}

/**
 * Recalculates positions for all waiting patients after a change.
 * Returns a map of patientId → new position.
 */
export function recalculatePositions(patients: QueuedPatient[]): Map<string, number> {
  const waiting = patients
    .filter((p) => p.status === 'waiting')
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.position - b.position;
    });

  const result = new Map<string, number>();
  waiting.forEach((patient, index) => {
    result.set(patient.id, index + 1);
  });

  return result;
}

/**
 * Validates and applies a postponement.
 * Returns the updated patients array with new positions, or null if invalid.
 */
export function applyPostponement(
  patients: QueuedPatient[],
  patientId: string,
  positionsBack: number,
  maxPostponements: number,
  currentPostponeCount: number,
): { updatedPatients: QueuedPatient[]; newPosition: number } | null {
  if (currentPostponeCount >= maxPostponements) return null;

  const patient = patients.find((p) => p.id === patientId);
  if (!patient || patient.status !== 'waiting') return null;

  const waitingPatients = patients
    .filter((p) => p.status === 'waiting')
    .sort((a, b) => a.position - b.position);

  const currentIndex = waitingPatients.findIndex((p) => p.id === patientId);
  if (currentIndex === -1) return null;

  const maxMoveBack = waitingPatients.length - 1 - currentIndex;
  const actualMoveBack = Math.min(positionsBack, maxMoveBack);

  if (actualMoveBack <= 0) return null;

  // Remove patient from current position
  waitingPatients.splice(currentIndex, 1);
  // Insert at new position
  const newIndex = currentIndex + actualMoveBack;
  waitingPatients.splice(newIndex, 0, patient);

  // Reassign positions
  const updated = patients.map((p) => {
    if (p.status !== 'waiting') return p;
    const waitIdx = waitingPatients.findIndex((w) => w.id === p.id);
    if (waitIdx === -1) return p;
    return { ...p, position: waitIdx + 1 };
  });

  return {
    updatedPatients: updated,
    newPosition: newIndex + 1,
  };
}
