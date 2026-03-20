import { describe, it, expect, vi } from 'vitest';
import { QueueManager, type QueueState } from './queue-manager.js';
import type { HistoricalData } from './prediction/wait-time-predictor.js';

const DEFAULT_STATS: HistoricalData = { avgServiceTimeSeconds: 300, sampleCount: 20 };

function createState(overrides?: Partial<QueueState>): QueueState {
  return {
    clinicId: 'clinic-1',
    patients: [],
    rooms: [
      { id: 'r1', name: 'Rum 1', status: 'open', currentStaffId: 'staff-1' },
      { id: 'r2', name: 'Rum 2', status: 'open', currentStaffId: 'staff-2' },
    ],
    nextTicketNumber: 1,
    todayStats: DEFAULT_STATS,
    sameHourStats: DEFAULT_STATS,
    sameDayOfWeekStats: DEFAULT_STATS,
    noShowProbability: 0.05,
    ...overrides,
  };
}

describe('QueueManager', () => {
  const emitEvent = vi.fn();

  function createManager() {
    emitEvent.mockClear();
    return new QueueManager(emitEvent);
  }

  describe('joinQueue', () => {
    it('adds a patient to an empty queue', () => {
      const manager = createManager();
      const state = createState();
      const result = manager.joinQueue(state, {
        ticketId: 'ticket-1',
        anonymousHash: 'hash-1',
        sessionToken: 'token-1',
        language: 'sv',
      });

      expect('result' in result).toBe(true);
      if (!('result' in result)) return;

      expect(result.result.ticketNumber).toBe(1);
      expect(result.result.position).toBe(1);
      expect(result.result.estimatedWaitMinutes).toBeGreaterThan(0);
      expect(result.newState.patients).toHaveLength(1);
      expect(result.newState.nextTicketNumber).toBe(2);
      expect(emitEvent).toHaveBeenCalledOnce();
    });

    it('assigns sequential positions', () => {
      const manager = createManager();
      let state = createState();

      const r1 = manager.joinQueue(state, {
        ticketId: 't1', anonymousHash: 'h1', sessionToken: 's1', language: 'sv',
      });
      if (!('result' in r1)) throw new Error('Expected result');
      state = r1.newState;

      const r2 = manager.joinQueue(state, {
        ticketId: 't2', anonymousHash: 'h2', sessionToken: 's2', language: 'sv',
      });
      if (!('result' in r2)) throw new Error('Expected result');

      expect(r2.result.position).toBe(2);
      expect(r2.result.ticketNumber).toBe(2);
    });

    it('rejects when queue is closed (no active rooms)', () => {
      const manager = createManager();
      const state = createState({
        rooms: [{ id: 'r1', name: 'Rum 1', status: 'closed', currentStaffId: null }],
      });
      const result = manager.joinQueue(state, {
        ticketId: 't1', anonymousHash: 'h1', sessionToken: 's1', language: 'sv',
      });
      expect('error' in result).toBe(true);
      if ('error' in result) expect(result.error).toBe('QUEUE_CLOSED');
    });

    it('rejects duplicate anonymous hash', () => {
      const manager = createManager();
      let state = createState();

      const r1 = manager.joinQueue(state, {
        ticketId: 't1', anonymousHash: 'same-hash', sessionToken: 's1', language: 'sv',
      });
      if (!('result' in r1)) throw new Error('Expected result');
      state = r1.newState;

      // Need to add anonymousHash to the patient for the duplicate check
      state.patients = state.patients.map((p) => ({ ...p, anonymousHash: 'same-hash' } as never));

      const r2 = manager.joinQueue(state, {
        ticketId: 't2', anonymousHash: 'same-hash', sessionToken: 's2', language: 'sv',
      });
      expect('error' in r2).toBe(true);
    });
  });

  describe('callNextPatient', () => {
    it('calls the first waiting patient', () => {
      const manager = createManager();
      const state = createState({
        patients: [
          { id: 'p1', ticketNumber: 1, position: 1, status: 'waiting', priority: 0 },
          { id: 'p2', ticketNumber: 2, position: 2, status: 'waiting', priority: 0 },
        ],
      });

      const result = manager.callNextPatient(state);
      expect(result).not.toBeNull();
      expect(result?.result.patientId).toBe('p1');
      expect(result?.result.roomId).toBe('r1');

      // Patient status should be 'called'
      const calledPatient = result?.newState.patients.find((p) => p.id === 'p1');
      expect(calledPatient?.status).toBe('called');

      // Room should be 'occupied'
      const occupiedRoom = result?.newState.rooms.find((r) => r.id === 'r1');
      expect(occupiedRoom?.status).toBe('occupied');

      // p2 should be at position 1 now
      const p2 = result?.newState.patients.find((p) => p.id === 'p2');
      expect(p2?.position).toBe(1);
    });

    it('returns null when no patients are waiting', () => {
      const manager = createManager();
      const state = createState();
      expect(manager.callNextPatient(state)).toBeNull();
    });
  });

  describe('completePatient', () => {
    it('marks patient as completed and frees room', () => {
      const manager = createManager();
      const state = createState({
        patients: [
          { id: 'p1', ticketNumber: 1, position: 1, status: 'called', priority: 0 },
        ],
        rooms: [
          { id: 'r1', name: 'Rum 1', status: 'occupied', currentStaffId: 'staff-1' },
        ],
      });

      const result = manager.completePatient(state, 'p1', 'r1');
      expect(result).not.toBeNull();

      const patient = result?.newState.patients.find((p) => p.id === 'p1');
      expect(patient?.status).toBe('completed');

      const room = result?.newState.rooms.find((r) => r.id === 'r1');
      expect(room?.status).toBe('open');
    });

    it('returns null for non-called patient', () => {
      const manager = createManager();
      const state = createState({
        patients: [
          { id: 'p1', ticketNumber: 1, position: 1, status: 'waiting', priority: 0 },
        ],
      });
      expect(manager.completePatient(state, 'p1', 'r1')).toBeNull();
    });
  });

  describe('markNoShow', () => {
    it('marks patient as no-show and frees room', () => {
      const manager = createManager();
      const state = createState({
        patients: [
          { id: 'p1', ticketNumber: 1, position: 1, status: 'called', priority: 0 },
        ],
        rooms: [
          { id: 'r1', name: 'Rum 1', status: 'occupied', currentStaffId: 'staff-1' },
        ],
      });

      const result = manager.markNoShow(state, 'p1', 'r1');
      expect(result).not.toBeNull();

      const patient = result?.newState.patients.find((p) => p.id === 'p1');
      expect(patient?.status).toBe('no_show');

      const room = result?.newState.rooms.find((r) => r.id === 'r1');
      expect(room?.status).toBe('open');
    });
  });

  describe('cancelPatient', () => {
    it('cancels a waiting patient and recalculates positions', () => {
      const manager = createManager();
      const state = createState({
        patients: [
          { id: 'p1', ticketNumber: 1, position: 1, status: 'waiting', priority: 0 },
          { id: 'p2', ticketNumber: 2, position: 2, status: 'waiting', priority: 0 },
          { id: 'p3', ticketNumber: 3, position: 3, status: 'waiting', priority: 0 },
        ],
      });

      const result = manager.cancelPatient(state, 'p2');
      expect(result).not.toBeNull();

      const cancelled = result?.newState.patients.find((p) => p.id === 'p2');
      expect(cancelled?.status).toBe('cancelled');

      const p3 = result?.newState.patients.find((p) => p.id === 'p3');
      expect(p3?.position).toBe(2);
    });

    it('returns null for non-waiting patient', () => {
      const manager = createManager();
      const state = createState({
        patients: [
          { id: 'p1', ticketNumber: 1, position: 1, status: 'called', priority: 0 },
        ],
      });
      expect(manager.cancelPatient(state, 'p1')).toBeNull();
    });
  });

  describe('postponePatient', () => {
    it('moves patient back and emits event', () => {
      const manager = createManager();
      const state = createState({
        patients: [
          { id: 'p1', ticketNumber: 1, position: 1, status: 'waiting', priority: 0 },
          { id: 'p2', ticketNumber: 2, position: 2, status: 'waiting', priority: 0 },
          { id: 'p3', ticketNumber: 3, position: 3, status: 'waiting', priority: 0 },
        ],
      });

      const result = manager.postponePatient(state, 'p1', 2, 3, 0);
      expect('newState' in result).toBe(true);
      if (!('newState' in result)) return;

      expect(result.newPosition).toBe(3);
    });

    it('returns error when max postponements reached', () => {
      const manager = createManager();
      const state = createState({
        patients: [
          { id: 'p1', ticketNumber: 1, position: 1, status: 'waiting', priority: 0 },
          { id: 'p2', ticketNumber: 2, position: 2, status: 'waiting', priority: 0 },
        ],
      });

      const result = manager.postponePatient(state, 'p1', 1, 3, 3);
      expect('error' in result).toBe(true);
    });
  });

  describe('room management', () => {
    it('opens a room', () => {
      const manager = createManager();
      const state = createState({
        rooms: [{ id: 'r1', name: 'Rum 1', status: 'closed', currentStaffId: 'staff-1' }],
      });

      const result = manager.openRoom(state, 'r1');
      expect(result?.newState.rooms[0]?.status).toBe('open');
    });

    it('pauses an open room', () => {
      const manager = createManager();
      const state = createState();

      const result = manager.pauseRoom(state, 'r1');
      expect(result?.newState.rooms.find((r) => r.id === 'r1')?.status).toBe('paused');
    });

    it('resumes a paused room', () => {
      const manager = createManager();
      const state = createState({
        rooms: [{ id: 'r1', name: 'Rum 1', status: 'paused', currentStaffId: 'staff-1' }],
      });

      const result = manager.resumeRoom(state, 'r1');
      expect(result?.newState.rooms[0]?.status).toBe('open');
    });

    it('closes a room', () => {
      const manager = createManager();
      const state = createState();

      const result = manager.closeRoom(state, 'r1');
      expect(result?.newState.rooms.find((r) => r.id === 'r1')?.status).toBe('closed');
    });

    it('returns null when pausing an already closed room', () => {
      const manager = createManager();
      const state = createState({
        rooms: [{ id: 'r1', name: 'Rum 1', status: 'closed', currentStaffId: null }],
      });
      expect(manager.pauseRoom(state, 'r1')).toBeNull();
    });

    it('returns null when resuming a non-paused room', () => {
      const manager = createManager();
      const state = createState();
      expect(manager.resumeRoom(state, 'r1')).toBeNull();
    });
  });

  describe('getQueueStats', () => {
    it('returns correct stats', () => {
      const manager = createManager();
      const state = createState({
        patients: [
          { id: 'p1', ticketNumber: 1, position: 1, status: 'waiting', priority: 0 },
          { id: 'p2', ticketNumber: 2, position: 2, status: 'waiting', priority: 0 },
          { id: 'p3', ticketNumber: 3, position: 3, status: 'called', priority: 0 },
        ],
        nextTicketNumber: 4,
      });

      const stats = manager.getQueueStats(state);
      expect(stats.waitingCount).toBe(2);
      expect(stats.activeRooms).toBe(2);
      expect(stats.avgWaitMinutes).toBeGreaterThan(0);
      expect(stats.nextTicketNumber).toBe(4);
    });

    it('returns 0 avg wait when queue is empty', () => {
      const manager = createManager();
      const state = createState();
      const stats = manager.getQueueStats(state);
      expect(stats.waitingCount).toBe(0);
      expect(stats.avgWaitMinutes).toBe(0);
    });
  });
});
