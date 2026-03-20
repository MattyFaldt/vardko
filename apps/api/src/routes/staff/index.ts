import { Hono } from 'hono';
import {
  createSuccessResponse,
  createErrorResponse,
  ERROR_CODES,
} from '@vardko/shared';
import type { Room } from '@vardko/shared';
import { tickets, getWaitingTickets, recalcPositions } from '../queue/index.js';

// ---------------------------------------------------------------------------
// In-memory room state
// ---------------------------------------------------------------------------

const DEMO_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_CLINIC_ID = '00000000-0000-0000-0000-000000000010';

const rooms = new Map<string, Room>();

// Seed demo rooms
function seedRooms() {
  const now = new Date().toISOString();
  const demoRooms: Room[] = [
    { id: 'room-1', organizationId: DEMO_ORG_ID, clinicId: DEMO_CLINIC_ID, name: 'Rum 1', displayOrder: 1, status: 'open', currentStaffId: null, currentTicketId: null, isActive: true, createdAt: now, updatedAt: now },
    { id: 'room-2', organizationId: DEMO_ORG_ID, clinicId: DEMO_CLINIC_ID, name: 'Rum 2', displayOrder: 2, status: 'open', currentStaffId: null, currentTicketId: null, isActive: true, createdAt: now, updatedAt: now },
    { id: 'room-3', organizationId: DEMO_ORG_ID, clinicId: DEMO_CLINIC_ID, name: 'Rum 3', displayOrder: 3, status: 'open', currentStaffId: null, currentTicketId: null, isActive: true, createdAt: now, updatedAt: now },
  ];
  for (const r of demoRooms) {
    rooms.set(r.id, r);
  }
}
seedRooms();

// ---------------------------------------------------------------------------
// Helpers — extract staff identity from Authorization header (simplified)
// In production this would use proper JWT middleware.
// ---------------------------------------------------------------------------

function getStaffContext(c: any): { staffId: string; clinicId: string } | null {
  // For the demo, accept a staffId from a custom header or default
  // Placeholder: in production, decode JWT. For now accept X-Staff-Id header.
  const staffId = c.req.header('X-Staff-Id') ?? 's2';
  return { staffId, clinicId: DEMO_CLINIC_ID };
}

function findRoomForStaff(staffId: string): Room | undefined {
  return Array.from(rooms.values()).find((r) => r.currentStaffId === staffId);
}

function assignStaffToRoom(staffId: string): Room | undefined {
  // Find an open room with no staff
  let room = findRoomForStaff(staffId);
  if (room) return room;
  room = Array.from(rooms.values()).find((r) => r.status === 'open' && !r.currentStaffId && r.isActive);
  if (room) {
    room.currentStaffId = staffId;
    room.updatedAt = new Date().toISOString();
  }
  return room;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// POST /staff/ready — signal ready for next patient
app.post('/ready', (c) => {
  const ctx = getStaffContext(c);
  if (!ctx) {
    return c.json(createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Unauthorized'), 401);
  }

  const room = assignStaffToRoom(ctx.staffId);
  if (!room) {
    return c.json(createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No available room'), 404);
  }

  // Already has a patient?
  if (room.currentTicketId) {
    return c.json(createErrorResponse(ERROR_CODES.ROOM_NOT_AVAILABLE, 'Room already has a patient'), 409);
  }

  // Get next waiting patient
  const waiting = getWaitingTickets(ctx.clinicId);
  if (waiting.length === 0) {
    return c.json(createSuccessResponse({ message: 'No patients waiting', roomName: room.name }));
  }

  const nextTicket = waiting[0]!;
  nextTicket.status = 'called';
  nextTicket.assignedRoomId = room.id;
  nextTicket.calledAt = new Date().toISOString();
  nextTicket.updatedAt = new Date().toISOString();

  room.currentTicketId = nextTicket.id;
  room.status = 'occupied';
  room.updatedAt = new Date().toISOString();

  recalcPositions(ctx.clinicId);

  return c.json(
    createSuccessResponse({
      ticketNumber: nextTicket.ticketNumber,
      roomName: room.name,
      roomId: room.id,
      status: 'called',
    }),
  );
});

// POST /staff/complete — mark current patient complete
app.post('/complete', (c) => {
  const ctx = getStaffContext(c);
  if (!ctx) {
    return c.json(createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Unauthorized'), 401);
  }

  const room = findRoomForStaff(ctx.staffId);
  if (!room || !room.currentTicketId) {
    return c.json(createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No active patient in room'), 404);
  }

  const ticket = Array.from(tickets.values()).find((t) => t.id === room.currentTicketId);
  if (ticket) {
    ticket.status = 'completed';
    ticket.completedAt = new Date().toISOString();
    ticket.updatedAt = new Date().toISOString();
  }

  room.currentTicketId = null;
  room.status = 'open';
  room.updatedAt = new Date().toISOString();

  recalcPositions(ctx.clinicId);

  return c.json(createSuccessResponse({ message: 'Patient completed', roomName: room.name }));
});

// POST /staff/no-show — mark patient no-show
app.post('/no-show', (c) => {
  const ctx = getStaffContext(c);
  if (!ctx) {
    return c.json(createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Unauthorized'), 401);
  }

  const room = findRoomForStaff(ctx.staffId);
  if (!room || !room.currentTicketId) {
    return c.json(createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No active patient in room'), 404);
  }

  const ticket = Array.from(tickets.values()).find((t) => t.id === room.currentTicketId);
  if (ticket) {
    ticket.status = 'no_show';
    ticket.completedAt = new Date().toISOString();
    ticket.updatedAt = new Date().toISOString();
  }

  room.currentTicketId = null;
  room.status = 'open';
  room.updatedAt = new Date().toISOString();

  recalcPositions(ctx.clinicId);

  return c.json(createSuccessResponse({ message: 'Patient marked no-show', roomName: room.name }));
});

// POST /staff/pause — pause room
app.post('/pause', (c) => {
  const ctx = getStaffContext(c);
  if (!ctx) {
    return c.json(createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Unauthorized'), 401);
  }

  const room = findRoomForStaff(ctx.staffId);
  if (!room) {
    return c.json(createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No room assigned'), 404);
  }

  room.status = 'paused';
  room.updatedAt = new Date().toISOString();

  return c.json(createSuccessResponse({ message: 'Room paused', roomName: room.name, status: room.status }));
});

// POST /staff/resume — resume room
app.post('/resume', (c) => {
  const ctx = getStaffContext(c);
  if (!ctx) {
    return c.json(createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Unauthorized'), 401);
  }

  const room = findRoomForStaff(ctx.staffId);
  if (!room) {
    return c.json(createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No room assigned'), 404);
  }

  room.status = room.currentTicketId ? 'occupied' : 'open';
  room.updatedAt = new Date().toISOString();

  return c.json(createSuccessResponse({ message: 'Room resumed', roomName: room.name, status: room.status }));
});

// GET /staff/room/status — current room status
app.get('/room/status', (c) => {
  const ctx = getStaffContext(c);
  if (!ctx) {
    return c.json(createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Unauthorized'), 401);
  }

  const room = findRoomForStaff(ctx.staffId);
  if (!room) {
    return c.json(createSuccessResponse({ assigned: false, room: null, currentTicket: null }));
  }

  let currentTicket = null;
  if (room.currentTicketId) {
    const ticket = Array.from(tickets.values()).find((t) => t.id === room.currentTicketId);
    if (ticket) {
      currentTicket = {
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        calledAt: ticket.calledAt,
      };
    }
  }

  const waitingCount = getWaitingTickets(ctx.clinicId).length;

  return c.json(
    createSuccessResponse({
      assigned: true,
      room: {
        id: room.id,
        name: room.name,
        status: room.status,
      },
      currentTicket,
      waitingCount,
    }),
  );
});

export default app;
export { rooms };
