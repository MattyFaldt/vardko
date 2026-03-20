import { describe, it, expect } from 'vitest';
import {
  findNextPatient,
  findAvailableRooms,
  tryAssignPatient,
  recalculatePositions,
  applyPostponement,
  type QueuedPatient,
  type AvailableRoom,
} from './patient-assigner.js';

function makePatient(overrides: Partial<QueuedPatient> & { id: string }): QueuedPatient {
  return {
    ticketNumber: 1,
    position: 1,
    status: 'waiting',
    priority: 0,
    ...overrides,
  };
}

function makeRoom(overrides: Partial<AvailableRoom> & { id: string }): AvailableRoom {
  return {
    name: 'Rum 1',
    status: 'open',
    currentStaffId: 'staff-1',
    ...overrides,
  };
}

describe('findNextPatient', () => {
  it('returns null when no patients are waiting', () => {
    const patients = [makePatient({ id: 'p1', status: 'called' })];
    expect(findNextPatient(patients)).toBeNull();
  });

  it('returns the patient with the lowest position', () => {
    const patients = [
      makePatient({ id: 'p1', position: 3 }),
      makePatient({ id: 'p2', position: 1 }),
      makePatient({ id: 'p3', position: 2 }),
    ];
    expect(findNextPatient(patients)?.id).toBe('p2');
  });

  it('prioritizes lower priority value (normal over deprioritized)', () => {
    const patients = [
      makePatient({ id: 'p1', position: 1, priority: 1 }),
      makePatient({ id: 'p2', position: 2, priority: 0 }),
    ];
    expect(findNextPatient(patients)?.id).toBe('p2');
  });

  it('uses position as tiebreaker when priority is equal', () => {
    const patients = [
      makePatient({ id: 'p1', position: 3, priority: 0 }),
      makePatient({ id: 'p2', position: 1, priority: 0 }),
    ];
    expect(findNextPatient(patients)?.id).toBe('p2');
  });

  it('ignores non-waiting patients', () => {
    const patients = [
      makePatient({ id: 'p1', position: 1, status: 'completed' }),
      makePatient({ id: 'p2', position: 2, status: 'waiting' }),
    ];
    expect(findNextPatient(patients)?.id).toBe('p2');
  });
});

describe('findAvailableRooms', () => {
  it('returns rooms that are open and have staff', () => {
    const rooms = [
      makeRoom({ id: 'r1', status: 'open', currentStaffId: 'staff-1' }),
      makeRoom({ id: 'r2', status: 'closed', currentStaffId: 'staff-2' }),
      makeRoom({ id: 'r3', status: 'open', currentStaffId: null }),
      makeRoom({ id: 'r4', status: 'paused', currentStaffId: 'staff-3' }),
    ];
    const available = findAvailableRooms(rooms);
    expect(available).toHaveLength(1);
    expect(available[0]?.id).toBe('r1');
  });

  it('returns empty array when no rooms are available', () => {
    const rooms = [makeRoom({ id: 'r1', status: 'closed' })];
    expect(findAvailableRooms(rooms)).toHaveLength(0);
  });
});

describe('tryAssignPatient', () => {
  it('assigns next patient to first available room', () => {
    const patients = [
      makePatient({ id: 'p1', position: 1, ticketNumber: 101 }),
      makePatient({ id: 'p2', position: 2, ticketNumber: 102 }),
    ];
    const rooms = [
      makeRoom({ id: 'r1', name: 'Rum 1', status: 'open' }),
    ];
    const result = tryAssignPatient(patients, rooms);
    expect(result).not.toBeNull();
    expect(result?.patientId).toBe('p1');
    expect(result?.roomId).toBe('r1');
    expect(result?.roomName).toBe('Rum 1');
    expect(result?.ticketNumber).toBe(101);
  });

  it('returns null when no patients are waiting', () => {
    const patients = [makePatient({ id: 'p1', status: 'called' })];
    const rooms = [makeRoom({ id: 'r1', status: 'open' })];
    expect(tryAssignPatient(patients, rooms)).toBeNull();
  });

  it('returns null when no rooms are available', () => {
    const patients = [makePatient({ id: 'p1', position: 1 })];
    const rooms = [makeRoom({ id: 'r1', status: 'closed' })];
    expect(tryAssignPatient(patients, rooms)).toBeNull();
  });
});

describe('recalculatePositions', () => {
  it('assigns sequential positions to waiting patients', () => {
    const patients = [
      makePatient({ id: 'p1', position: 5, status: 'waiting' }),
      makePatient({ id: 'p2', position: 1, status: 'completed' }),
      makePatient({ id: 'p3', position: 3, status: 'waiting' }),
    ];
    const positions = recalculatePositions(patients);
    expect(positions.get('p3')).toBe(1);
    expect(positions.get('p1')).toBe(2);
    expect(positions.has('p2')).toBe(false);
  });

  it('returns empty map for no waiting patients', () => {
    const patients = [makePatient({ id: 'p1', status: 'completed' })];
    expect(recalculatePositions(patients).size).toBe(0);
  });
});

describe('applyPostponement', () => {
  const patients = [
    makePatient({ id: 'p1', position: 1, ticketNumber: 1 }),
    makePatient({ id: 'p2', position: 2, ticketNumber: 2 }),
    makePatient({ id: 'p3', position: 3, ticketNumber: 3 }),
    makePatient({ id: 'p4', position: 4, ticketNumber: 4 }),
    makePatient({ id: 'p5', position: 5, ticketNumber: 5 }),
  ];

  it('moves a patient back by the specified number of positions', () => {
    const result = applyPostponement(patients, 'p1', 3, 3, 0);
    expect(result).not.toBeNull();
    expect(result!.newPosition).toBe(4);
    // p2 should now be position 1
    const p2 = result!.updatedPatients.find((p) => p.id === 'p2');
    expect(p2?.position).toBe(1);
  });

  it('returns null when max postponements reached', () => {
    const result = applyPostponement(patients, 'p1', 2, 3, 3);
    expect(result).toBeNull();
  });

  it('returns null for non-waiting patient', () => {
    const patientsWithCalled = patients.map((p) =>
      p.id === 'p1' ? { ...p, status: 'called' as const } : p,
    );
    const result = applyPostponement(patientsWithCalled, 'p1', 2, 3, 0);
    expect(result).toBeNull();
  });

  it('caps postponement at end of queue', () => {
    const result = applyPostponement(patients, 'p1', 100, 3, 0);
    expect(result).not.toBeNull();
    expect(result!.newPosition).toBe(5);
  });

  it('returns null when patient is already last', () => {
    const result = applyPostponement(patients, 'p5', 1, 3, 0);
    expect(result).toBeNull();
  });

  it('correctly shifts all affected patients', () => {
    const result = applyPostponement(patients, 'p2', 2, 3, 0);
    expect(result).not.toBeNull();
    // p2 was at position 2, moved back 2 → position 4
    expect(result!.newPosition).toBe(4);

    const positions = result!.updatedPatients
      .filter((p) => p.status === 'waiting')
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ id: p.id, position: p.position }));

    expect(positions).toEqual([
      { id: 'p1', position: 1 },
      { id: 'p3', position: 2 },
      { id: 'p4', position: 3 },
      { id: 'p2', position: 4 },
      { id: 'p5', position: 5 },
    ]);
  });
});
