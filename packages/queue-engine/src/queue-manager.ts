import type { TicketStatus, RoomStatus } from '@vardko/shared';
import { MAX_QUEUE_SIZE } from '@vardko/shared';
import { predictWaitTime, type HistoricalData } from './prediction/wait-time-predictor.js';
import {
  tryAssignPatient,
  recalculatePositions,
  applyPostponement,
  type QueuedPatient,
  type AvailableRoom,
} from './assignment/patient-assigner.js';
import { QUEUE_EVENTS, type QueueEventPayload } from './events.js';

export interface QueueState {
  clinicId: string;
  patients: QueuedPatient[];
  rooms: AvailableRoom[];
  nextTicketNumber: number;
  todayStats: HistoricalData;
  sameHourStats: HistoricalData;
  sameDayOfWeekStats: HistoricalData;
  noShowProbability: number;
}

export interface JoinResult {
  ticketId: string;
  ticketNumber: number;
  position: number;
  estimatedWaitMinutes: number;
  sessionToken: string;
}

export interface CallResult {
  patientId: string;
  ticketNumber: number;
  roomId: string;
  roomName: string;
}

export type EventEmitter = (event: QueueEventPayload) => void;

/**
 * Core queue manager — pure business logic, no I/O.
 * All state is passed in and results are returned.
 * Side effects (DB writes, Redis, WebSocket) are handled by the caller.
 */
export class QueueManager {
  private emitEvent: EventEmitter;

  constructor(emitEvent: EventEmitter) {
    this.emitEvent = emitEvent;
  }

  /**
   * Add a patient to the queue.
   */
  joinQueue(
    state: QueueState,
    params: {
      ticketId: string;
      anonymousHash: string;
      sessionToken: string;
      language: string;
    },
  ): { result: JoinResult; newState: QueueState } | { error: string } {
    // Check duplicate hash
    const existing = state.patients.find(
      (p) =>
        (p as unknown as { anonymousHash: string }).anonymousHash === params.anonymousHash &&
        p.status === 'waiting',
    );
    if (existing) {
      return { error: 'ALREADY_IN_QUEUE' };
    }

    // Check queue capacity
    const waitingCount = state.patients.filter((p) => p.status === 'waiting').length;
    if (waitingCount >= MAX_QUEUE_SIZE) {
      return { error: 'QUEUE_FULL' };
    }

    // Check if any rooms are open
    const activeRooms = state.rooms.filter(
      (r) => r.status === 'open' || r.status === 'occupied',
    ).length;
    if (activeRooms === 0) {
      return { error: 'QUEUE_CLOSED' };
    }

    const position = waitingCount + 1;
    const ticketNumber = state.nextTicketNumber;

    const prediction = predictWaitTime({
      positionInQueue: position,
      activeRooms,
      todayStats: state.todayStats,
      sameHourStats: state.sameHourStats,
      sameDayOfWeekStats: state.sameDayOfWeekStats,
      noShowProbability: state.noShowProbability,
    });

    const newPatient: QueuedPatient = {
      id: params.ticketId,
      ticketNumber,
      position,
      status: 'waiting',
      priority: 0,
    };

    const newState: QueueState = {
      ...state,
      patients: [...state.patients, newPatient],
      nextTicketNumber: ticketNumber + 1,
    };

    this.emitEvent({
      clinicId: state.clinicId,
      event: QUEUE_EVENTS.PATIENT_JOINED,
      data: { ticketNumber, position, estimatedWaitMinutes: prediction.estimatedWaitMinutes },
      timestamp: new Date().toISOString(),
    });

    return {
      result: {
        ticketId: params.ticketId,
        ticketNumber,
        position,
        estimatedWaitMinutes: prediction.estimatedWaitMinutes,
        sessionToken: params.sessionToken,
      },
      newState,
    };
  }

  /**
   * Try to call the next patient for an available room.
   */
  callNextPatient(state: QueueState): { result: CallResult; newState: QueueState } | null {
    const assignment = tryAssignPatient(state.patients, state.rooms);
    if (!assignment) return null;

    const newPatients = state.patients.map((p) => {
      if (p.id === assignment.patientId) {
        return { ...p, status: 'called' as TicketStatus };
      }
      return p;
    });

    const newRooms = state.rooms.map((r) => {
      if (r.id === assignment.roomId) {
        return { ...r, status: 'occupied' as RoomStatus };
      }
      return r;
    });

    // Recalculate positions for remaining waiting patients
    const positions = recalculatePositions(newPatients);
    const updatedPatients = newPatients.map((p) => {
      const newPos = positions.get(p.id);
      if (newPos !== undefined) {
        return { ...p, position: newPos };
      }
      return p;
    });

    const newState: QueueState = {
      ...state,
      patients: updatedPatients,
      rooms: newRooms,
    };

    this.emitEvent({
      clinicId: state.clinicId,
      event: QUEUE_EVENTS.PATIENT_CALLED,
      data: {
        patientId: assignment.patientId,
        ticketNumber: assignment.ticketNumber,
        roomId: assignment.roomId,
        roomName: assignment.roomName,
      },
      timestamp: new Date().toISOString(),
    });

    return { result: assignment, newState };
  }

  /**
   * Mark the current patient as completed.
   */
  completePatient(
    state: QueueState,
    patientId: string,
    roomId: string,
  ): { newState: QueueState } | null {
    const patient = state.patients.find((p) => p.id === patientId);
    if (!patient || (patient.status !== 'called' && patient.status !== 'in_progress')) return null;

    const newPatients = state.patients.map((p) => {
      if (p.id === patientId) {
        return { ...p, status: 'completed' as TicketStatus };
      }
      return p;
    });

    const newRooms = state.rooms.map((r) => {
      if (r.id === roomId) {
        return { ...r, status: 'open' as RoomStatus };
      }
      return r;
    });

    const newState: QueueState = {
      ...state,
      patients: newPatients,
      rooms: newRooms,
    };

    this.emitEvent({
      clinicId: state.clinicId,
      event: QUEUE_EVENTS.PATIENT_COMPLETED,
      data: { patientId, ticketNumber: patient.ticketNumber, roomId },
      timestamp: new Date().toISOString(),
    });

    return { newState };
  }

  /**
   * Mark a patient as no-show.
   */
  markNoShow(
    state: QueueState,
    patientId: string,
    roomId: string,
  ): { newState: QueueState } | null {
    const patient = state.patients.find((p) => p.id === patientId);
    if (!patient || patient.status !== 'called') return null;

    const newPatients = state.patients.map((p) => {
      if (p.id === patientId) {
        return { ...p, status: 'no_show' as TicketStatus };
      }
      return p;
    });

    const newRooms = state.rooms.map((r) => {
      if (r.id === roomId) {
        return { ...r, status: 'open' as RoomStatus };
      }
      return r;
    });

    const newState: QueueState = {
      ...state,
      patients: newPatients,
      rooms: newRooms,
    };

    this.emitEvent({
      clinicId: state.clinicId,
      event: QUEUE_EVENTS.PATIENT_NO_SHOW,
      data: { patientId, ticketNumber: patient.ticketNumber, roomId },
      timestamp: new Date().toISOString(),
    });

    return { newState };
  }

  /**
   * Patient voluntarily leaves the queue.
   */
  cancelPatient(state: QueueState, patientId: string): { newState: QueueState } | null {
    const patient = state.patients.find((p) => p.id === patientId);
    if (!patient || patient.status !== 'waiting') return null;

    const newPatients = state.patients.map((p) => {
      if (p.id === patientId) {
        return { ...p, status: 'cancelled' as TicketStatus };
      }
      return p;
    });

    // Recalculate positions
    const positions = recalculatePositions(newPatients);
    const updatedPatients = newPatients.map((p) => {
      const newPos = positions.get(p.id);
      if (newPos !== undefined) {
        return { ...p, position: newPos };
      }
      return p;
    });

    const newState: QueueState = {
      ...state,
      patients: updatedPatients,
    };

    this.emitEvent({
      clinicId: state.clinicId,
      event: QUEUE_EVENTS.PATIENT_CANCELLED,
      data: { patientId, ticketNumber: patient.ticketNumber },
      timestamp: new Date().toISOString(),
    });

    return { newState };
  }

  /**
   * Postpone a patient's position in the queue.
   */
  postponePatient(
    state: QueueState,
    patientId: string,
    positionsBack: number,
    maxPostponements: number,
    currentPostponeCount: number,
  ): { newState: QueueState; newPosition: number } | { error: string } {
    const result = applyPostponement(
      state.patients,
      patientId,
      positionsBack,
      maxPostponements,
      currentPostponeCount,
    );

    if (!result) {
      return { error: 'MAX_POSTPONEMENTS_REACHED' };
    }

    const patient = state.patients.find((p) => p.id === patientId);

    const newState: QueueState = {
      ...state,
      patients: result.updatedPatients,
    };

    this.emitEvent({
      clinicId: state.clinicId,
      event: QUEUE_EVENTS.PATIENT_POSTPONED,
      data: {
        patientId,
        ticketNumber: patient?.ticketNumber,
        newPosition: result.newPosition,
        positionsBack,
      },
      timestamp: new Date().toISOString(),
    });

    return { newState, newPosition: result.newPosition };
  }

  /**
   * Open a room (staff signals ready).
   */
  openRoom(state: QueueState, roomId: string): { newState: QueueState } | null {
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room) return null;

    const newRooms = state.rooms.map((r) => {
      if (r.id === roomId) {
        return { ...r, status: 'open' as RoomStatus };
      }
      return r;
    });

    const newState: QueueState = { ...state, rooms: newRooms };

    this.emitEvent({
      clinicId: state.clinicId,
      event: QUEUE_EVENTS.ROOM_OPENED,
      data: { roomId, roomName: room.name },
      timestamp: new Date().toISOString(),
    });

    return { newState };
  }

  /**
   * Pause a room (staff takes a break).
   */
  pauseRoom(state: QueueState, roomId: string): { newState: QueueState } | null {
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room || (room.status !== 'open' && room.status !== 'occupied')) return null;

    const newRooms = state.rooms.map((r) => {
      if (r.id === roomId) {
        return { ...r, status: 'paused' as RoomStatus };
      }
      return r;
    });

    const newState: QueueState = { ...state, rooms: newRooms };

    this.emitEvent({
      clinicId: state.clinicId,
      event: QUEUE_EVENTS.ROOM_PAUSED,
      data: { roomId, roomName: room.name },
      timestamp: new Date().toISOString(),
    });

    return { newState };
  }

  /**
   * Resume a paused room.
   */
  resumeRoom(state: QueueState, roomId: string): { newState: QueueState } | null {
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room || room.status !== 'paused') return null;

    const newRooms = state.rooms.map((r) => {
      if (r.id === roomId) {
        return { ...r, status: 'open' as RoomStatus };
      }
      return r;
    });

    const newState: QueueState = { ...state, rooms: newRooms };

    this.emitEvent({
      clinicId: state.clinicId,
      event: QUEUE_EVENTS.ROOM_RESUMED,
      data: { roomId, roomName: room.name },
      timestamp: new Date().toISOString(),
    });

    return { newState };
  }

  /**
   * Close a room.
   */
  closeRoom(state: QueueState, roomId: string): { newState: QueueState } | null {
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room) return null;

    const newRooms = state.rooms.map((r) => {
      if (r.id === roomId) {
        return { ...r, status: 'closed' as RoomStatus };
      }
      return r;
    });

    const newState: QueueState = { ...state, rooms: newRooms };

    this.emitEvent({
      clinicId: state.clinicId,
      event: QUEUE_EVENTS.ROOM_CLOSED,
      data: { roomId, roomName: room.name },
      timestamp: new Date().toISOString(),
    });

    return { newState };
  }

  /**
   * Get queue statistics for display/admin.
   */
  getQueueStats(state: QueueState): {
    waitingCount: number;
    activeRooms: number;
    avgWaitMinutes: number;
    nextTicketNumber: number;
  } {
    const waitingCount = state.patients.filter((p) => p.status === 'waiting').length;
    const activeRooms = state.rooms.filter(
      (r) => r.status === 'open' || r.status === 'occupied',
    ).length;

    let avgWaitMinutes = 0;
    if (waitingCount > 0 && activeRooms > 0) {
      const prediction = predictWaitTime({
        positionInQueue: Math.ceil(waitingCount / 2),
        activeRooms,
        todayStats: state.todayStats,
        sameHourStats: state.sameHourStats,
        sameDayOfWeekStats: state.sameDayOfWeekStats,
        noShowProbability: state.noShowProbability,
      });
      avgWaitMinutes = prediction.estimatedWaitMinutes;
    }

    return {
      waitingCount,
      activeRooms,
      avgWaitMinutes,
      nextTicketNumber: state.nextTicketNumber,
    };
  }
}
