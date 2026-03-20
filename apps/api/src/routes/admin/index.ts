import { Hono } from 'hono';
import {
  createRoomSchema,
  updateRoomSchema,
  createUserSchema,
  updateUserSchema,
  paginationSchema,
  createSuccessResponse,
  createErrorResponse,
  ERROR_CODES,
} from '@vardko/shared';
import type { Room, AuditLogEntry } from '@vardko/shared';
import { tickets, getWaitingTickets } from '../queue/index.js';
import { rooms } from '../staff/index.js';

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

const DEMO_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_CLINIC_ID = '00000000-0000-0000-0000-000000000010';

interface StaffRecord {
  id: string;
  organizationId: string;
  clinicId: string | null;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const staffStore = new Map<string, StaffRecord>();

// Seed demo staff
const now = new Date().toISOString();
[
  { id: 's1', email: 'anna@kungsholmen.se', displayName: 'Anna Adminsson', role: 'clinic_admin' },
  { id: 's2', email: 'erik@kungsholmen.se', displayName: 'Erik Eriksson', role: 'staff' },
  { id: 's3', email: 'maria@kungsholmen.se', displayName: 'Maria Johansson', role: 'staff' },
  { id: 's4', email: 'anna.l@kungsholmen.se', displayName: 'Anna Lindberg', role: 'staff' },
  { id: 's5', email: 'karl@kungsholmen.se', displayName: 'Karl Svensson', role: 'staff' },
].forEach((s) => {
  staffStore.set(s.id, {
    ...s,
    organizationId: DEMO_ORG_ID,
    clinicId: DEMO_CLINIC_ID,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
});

const auditLog: AuditLogEntry[] = [];

function addAuditEntry(action: string, resourceType: string, resourceId: string | null, actorId: string = 'system') {
  auditLog.push({
    id: crypto.randomUUID(),
    organizationId: DEMO_ORG_ID,
    clinicId: DEMO_CLINIC_ID,
    actorType: 'admin',
    actorId,
    action,
    resourceType,
    resourceId,
    metadata: {},
    ipHash: null,
    timestamp: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// GET /admin/dashboard — live dashboard data
app.get('/dashboard', (c) => {
  const waiting = getWaitingTickets(DEMO_CLINIC_ID);
  const allTickets = Array.from(tickets.values()).filter((t) => t.clinicId === DEMO_CLINIC_ID);
  const roomList = Array.from(rooms.values()).filter((r) => r.clinicId === DEMO_CLINIC_ID);

  const completed = allTickets.filter((t) => t.status === 'completed').length;
  const noShows = allTickets.filter((t) => t.status === 'no_show').length;
  const activeRooms = roomList.filter((r) => r.isActive && r.status !== 'closed').length;
  const occupiedRooms = roomList.filter((r) => r.status === 'occupied').length;

  return c.json(
    createSuccessResponse({
      clinicId: DEMO_CLINIC_ID,
      queueLength: waiting.length,
      completedToday: completed,
      noShowsToday: noShows,
      totalRooms: roomList.length,
      activeRooms,
      occupiedRooms,
      averageWaitMinutes: waiting.length > 0 ? Math.round(waiting.reduce((sum, t) => sum + (t.estimatedWaitMinutes ?? 0), 0) / waiting.length) : 0,
    }),
  );
});

// GET /admin/queue — full queue list
app.get('/queue', (c) => {
  const allTickets = Array.from(tickets.values())
    .filter((t) => t.clinicId === DEMO_CLINIC_ID)
    .sort((a, b) => a.position - b.position);

  return c.json(
    createSuccessResponse(
      allTickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        status: t.status,
        position: t.position,
        estimatedWaitMinutes: t.estimatedWaitMinutes,
        assignedRoomId: t.assignedRoomId,
        joinedAt: t.joinedAt,
        calledAt: t.calledAt,
        language: t.language,
      })),
    ),
  );
});

// POST /admin/rooms — add room
app.post('/rooms', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createRoomSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()), 400);
  }

  const { clinicId, name, displayOrder } = parsed.data;
  const id = crypto.randomUUID();
  const roomNow = new Date().toISOString();

  const room: Room = {
    id,
    organizationId: DEMO_ORG_ID,
    clinicId,
    name,
    displayOrder,
    status: 'open',
    currentStaffId: null,
    currentTicketId: null,
    isActive: true,
    createdAt: roomNow,
    updatedAt: roomNow,
  };

  rooms.set(id, room);
  addAuditEntry('room.created', 'room', id);

  return c.json(createSuccessResponse(room), 201);
});

// PUT /admin/rooms/:roomId — update room
app.put('/rooms/:roomId', async (c) => {
  const roomId = c.req.param('roomId');
  const room = rooms.get(roomId);
  if (!room) {
    return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Room not found'), 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = updateRoomSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()), 400);
  }

  const updates = parsed.data;
  if (updates.name !== undefined) room.name = updates.name;
  if (updates.displayOrder !== undefined) room.displayOrder = updates.displayOrder;
  if (updates.isActive !== undefined) room.isActive = updates.isActive;
  room.updatedAt = new Date().toISOString();

  addAuditEntry('room.updated', 'room', roomId);

  return c.json(createSuccessResponse(room));
});

// DELETE /admin/rooms/:roomId — delete room
app.delete('/rooms/:roomId', (c) => {
  const roomId = c.req.param('roomId');
  const room = rooms.get(roomId);
  if (!room) {
    return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Room not found'), 404);
  }

  rooms.delete(roomId);
  addAuditEntry('room.deleted', 'room', roomId);

  return c.json(createSuccessResponse({ message: 'Room deleted' }));
});

// GET /admin/rooms — list rooms
app.get('/rooms', (c) => {
  const roomList = Array.from(rooms.values())
    .filter((r) => r.clinicId === DEMO_CLINIC_ID)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return c.json(createSuccessResponse(roomList));
});

// GET /admin/staff — list staff
app.get('/staff', (c) => {
  const staffList = Array.from(staffStore.values()).filter((s) => s.clinicId === DEMO_CLINIC_ID);
  return c.json(createSuccessResponse(staffList));
});

// POST /admin/staff — create staff
app.post('/staff', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()), 400);
  }

  const { organizationId, clinicId, email, displayName, role } = parsed.data;
  const id = crypto.randomUUID();
  const staffNow = new Date().toISOString();

  const staff: StaffRecord = {
    id,
    organizationId,
    clinicId: clinicId ?? null,
    email,
    displayName,
    role,
    isActive: true,
    createdAt: staffNow,
    updatedAt: staffNow,
  };

  staffStore.set(id, staff);
  addAuditEntry('staff.created', 'user', id);

  return c.json(createSuccessResponse(staff), 201);
});

// PUT /admin/staff/:userId — update staff
app.put('/staff/:userId', async (c) => {
  const userId = c.req.param('userId');
  const staff = staffStore.get(userId);
  if (!staff) {
    return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Staff member not found'), 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()), 400);
  }

  const updates = parsed.data;
  if (updates.email !== undefined) staff.email = updates.email;
  if (updates.displayName !== undefined) staff.displayName = updates.displayName;
  if (updates.role !== undefined) staff.role = updates.role;
  if (updates.isActive !== undefined) staff.isActive = updates.isActive;
  staff.updatedAt = new Date().toISOString();

  addAuditEntry('staff.updated', 'user', userId);

  return c.json(createSuccessResponse(staff));
});

// DELETE /admin/staff/:userId — deactivate staff
app.delete('/staff/:userId', (c) => {
  const userId = c.req.param('userId');
  const staff = staffStore.get(userId);
  if (!staff) {
    return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Staff member not found'), 404);
  }

  staff.isActive = false;
  staff.updatedAt = new Date().toISOString();
  addAuditEntry('staff.deactivated', 'user', userId);

  return c.json(createSuccessResponse({ message: 'Staff member deactivated' }));
});

// GET /admin/audit-log — audit log entries
app.get('/audit-log', (c) => {
  const query = paginationSchema.safeParse({
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  });

  const page = query.success ? query.data.page : 1;
  const pageSize = query.success ? query.data.pageSize : 20;

  const filtered = auditLog
    .filter((e) => e.clinicId === DEMO_CLINIC_ID)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return c.json(
    createSuccessResponse(paginated, {
      pagination: { page, pageSize, total, totalPages },
    }),
  );
});

export default app;
