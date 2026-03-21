/**
 * VardKo Hono API — Vercel Serverless Entry Point
 *
 * Self-contained serverless function that inlines all route logic so that
 * workspace packages (`@vardko/shared`, etc.) do not need to be resolved
 * at deploy time. In-memory state is shared across warm invocations.
 *
 * For production, replace the in-memory Maps with Supabase queries.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle } from 'hono/vercel';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import crypto from 'crypto';

const randomBytes = crypto.randomBytes;

// =============================================================================
// Runtime config — tell Vercel to use the Node.js runtime (not Edge)
// =============================================================================

// Vercel uses Node.js runtime by default for api/ functions

// =============================================================================
// Inlined constants (from @vardko/shared)
// =============================================================================

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const DEFAULT_SERVICE_TIME_SECONDS = 480; // 8 minutes
const MAX_QUEUE_SIZE = 200;
const DEFAULT_MAX_POSTPONEMENTS = 3;

const SUPPORTED_LANGUAGES = ['sv', 'no', 'da', 'fi', 'en', 'de', 'es', 'fr', 'it'] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const USER_ROLES = ['org_admin', 'clinic_admin', 'staff'] as const;
type UserRole = (typeof USER_ROLES)[number];

type TicketStatus = 'waiting' | 'called' | 'in_progress' | 'completed' | 'no_show' | 'cancelled';
type RoomStatus = 'open' | 'occupied' | 'paused' | 'closed';
type ActorType = 'staff' | 'patient' | 'system' | 'admin' | 'superadmin';

const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  QUEUE_FULL: 'QUEUE_FULL',
  QUEUE_CLOSED: 'QUEUE_CLOSED',
  ALREADY_IN_QUEUE: 'ALREADY_IN_QUEUE',
  MAX_POSTPONEMENTS_REACHED: 'MAX_POSTPONEMENTS_REACHED',
  TICKET_NOT_FOUND: 'TICKET_NOT_FOUND',
  TICKET_EXPIRED: 'TICKET_EXPIRED',
  ROOM_NOT_AVAILABLE: 'ROOM_NOT_AVAILABLE',
  NO_ACTIVE_ROOM: 'NO_ACTIVE_ROOM',
  CLINIC_NOT_FOUND: 'CLINIC_NOT_FOUND',
  ORGANIZATION_NOT_FOUND: 'ORGANIZATION_NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

// =============================================================================
// Inlined types (from @vardko/shared)
// =============================================================================

interface QueueTicket {
  id: string;
  organizationId: string;
  clinicId: string;
  ticketNumber: number;
  anonymousHash: string;
  status: TicketStatus;
  priority: number;
  position: number;
  assignedRoomId: string | null;
  sessionToken: string;
  estimatedWaitMinutes: number | null;
  joinedAt: string;
  calledAt: string | null;
  completedAt: string | null;
  language: SupportedLanguage;
  createdAt: string;
  updatedAt: string;
}

interface Room {
  id: string;
  organizationId: string;
  clinicId: string;
  name: string;
  displayOrder: number;
  status: RoomStatus;
  currentStaffId: string | null;
  currentTicketId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Clinic {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  address: string | null;
  timezone: string;
  defaultLanguage: SupportedLanguage;
  settings: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AuditLogEntry {
  id: string;
  organizationId: string | null;
  clinicId: string | null;
  actorType: ActorType;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipHash: string | null;
  timestamp: string;
}

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

// =============================================================================
// Inlined API response helpers
// =============================================================================

interface ApiMeta {
  pagination?: { page: number; pageSize: number; total: number; totalPages: number };
  timestamp: string;
}

function createSuccessResponse<T>(data: T, meta?: Partial<ApiMeta>) {
  return {
    success: true as const,
    data,
    meta: { timestamp: new Date().toISOString(), ...meta },
  };
}

function createErrorResponse(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details !== undefined && { details }) },
  };
}

// =============================================================================
// Inlined Zod schemas (from @vardko/shared)
// =============================================================================

const uuidSchema = z.string().uuid();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  clinicSlug: z.string().optional(),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

const superAdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().length(6).regex(/^\d{6}$/),
});

const joinQueueSchema = z.object({
  clinicId: uuidSchema,
  anonymousHash: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/, 'Must be a valid HMAC-SHA256 hex string'),
  language: z.enum(SUPPORTED_LANGUAGES).default('sv'),
});

const postponeSchema = z.object({
  positionsBack: z
    .number()
    .int()
    .positive()
    .max(DEFAULT_MAX_POSTPONEMENTS * 10, 'Cannot postpone that many positions'),
});

const createRoomSchema = z.object({
  clinicId: uuidSchema,
  name: z.string().min(1).max(100),
  displayOrder: z.number().int().min(0).default(0),
});

const updateRoomSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const createUserSchema = z.object({
  organizationId: uuidSchema,
  clinicId: uuidSchema.nullable().optional(),
  email: z.string().email().max(255),
  password: passwordSchema,
  displayName: z.string().min(1).max(255),
  role: z.enum(USER_ROLES),
  preferredLanguage: z.enum(SUPPORTED_LANGUAGES).default('sv'),
});

const updateUserSchema = z.object({
  email: z.string().email().max(255).optional(),
  displayName: z.string().min(1).max(255).optional(),
  role: z.enum(USER_ROLES).optional(),
  preferredLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
  isActive: z.boolean().optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// =============================================================================
// JWT helpers
// =============================================================================

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-change-in-production-minimum-32-chars!',
);

interface DemoUser {
  id: string;
  organizationId: string;
  clinicId: string | null;
  email: string;
  displayName: string;
  role: UserRole;
  password: string; // plain-text for demo (argon2 is not available in Vercel serverless easily)
}

async function createAccessToken(user: DemoUser): Promise<string> {
  return new SignJWT({
    userId: user.id,
    role: user.role,
    organizationId: user.organizationId,
    clinicId: user.clinicId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

async function createRefreshTokenJWT(user: DemoUser): Promise<string> {
  return new SignJWT({ userId: user.id, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

// =============================================================================
// Demo data — in-memory stores (shared across warm serverless invocations)
// =============================================================================

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const CLINIC_ID = '00000000-0000-0000-0000-000000000010';

// -- Demo users (plain-text passwords for the serverless demo) ----------------

const demoUsers: DemoUser[] = [
  { id: 's1', organizationId: ORG_ID, clinicId: CLINIC_ID, email: 'anna@kungsholmen.se', displayName: 'Anna Adminsson', role: 'clinic_admin', password: 'Admin123456!' },
  { id: 's2', organizationId: ORG_ID, clinicId: CLINIC_ID, email: 'erik@kungsholmen.se', displayName: 'Erik Eriksson', role: 'staff', password: 'Staff123456!' },
  { id: 's3', organizationId: ORG_ID, clinicId: CLINIC_ID, email: 'maria@kungsholmen.se', displayName: 'Maria Johansson', role: 'staff', password: 'Staff123456!' },
  { id: 's4', organizationId: ORG_ID, clinicId: CLINIC_ID, email: 'anna.l@kungsholmen.se', displayName: 'Anna Lindberg', role: 'staff', password: 'Staff123456!' },
  { id: 's5', organizationId: ORG_ID, clinicId: CLINIC_ID, email: 'karl@kungsholmen.se', displayName: 'Karl Svensson', role: 'staff', password: 'Staff123456!' },
];

// -- SuperAdmin ---------------------------------------------------------------

interface SuperAdminRecord {
  id: string;
  email: string;
  password: string;
  totpSecret: string;
  isActive: boolean;
}

const superAdmins: SuperAdminRecord[] = [
  { id: 'sa-1', email: 'superadmin@vardko.se', password: 'SuperAdmin123456!', totpSecret: 'demo-totp-secret', isActive: true },
];

// -- Refresh token store ------------------------------------------------------

const activeRefreshTokens = new Set<string>();

// -- Queue tickets ------------------------------------------------------------

const tickets = new Map<string, QueueTicket>();
let nextTicketNumber = 1;

function getWaitingTickets(clinicId: string): QueueTicket[] {
  return Array.from(tickets.values())
    .filter((t) => t.clinicId === clinicId && t.status === 'waiting')
    .sort((a, b) => a.position - b.position);
}

function recalcPositions(clinicId: string): void {
  const waiting = getWaitingTickets(clinicId);
  waiting.forEach((t, idx) => {
    t.position = idx + 1;
    t.estimatedWaitMinutes = Math.ceil((idx * DEFAULT_SERVICE_TIME_SECONDS) / 60);
    t.updatedAt = new Date().toISOString();
  });
}

// -- Rooms --------------------------------------------------------------------

const rooms = new Map<string, Room>();

function seedRooms() {
  const now = new Date().toISOString();
  const demoRooms: Room[] = [
    { id: 'room-1', organizationId: ORG_ID, clinicId: CLINIC_ID, name: 'Rum 1', displayOrder: 1, status: 'open', currentStaffId: null, currentTicketId: null, isActive: true, createdAt: now, updatedAt: now },
    { id: 'room-2', organizationId: ORG_ID, clinicId: CLINIC_ID, name: 'Rum 2', displayOrder: 2, status: 'open', currentStaffId: null, currentTicketId: null, isActive: true, createdAt: now, updatedAt: now },
    { id: 'room-3', organizationId: ORG_ID, clinicId: CLINIC_ID, name: 'Rum 3', displayOrder: 3, status: 'open', currentStaffId: null, currentTicketId: null, isActive: true, createdAt: now, updatedAt: now },
  ];
  for (const r of demoRooms) {
    rooms.set(r.id, r);
  }
}
seedRooms();

// -- Staff store --------------------------------------------------------------

const staffStore = new Map<string, StaffRecord>();

const seedNow = new Date().toISOString();
[
  { id: 's1', email: 'anna@kungsholmen.se', displayName: 'Anna Adminsson', role: 'clinic_admin' },
  { id: 's2', email: 'erik@kungsholmen.se', displayName: 'Erik Eriksson', role: 'staff' },
  { id: 's3', email: 'maria@kungsholmen.se', displayName: 'Maria Johansson', role: 'staff' },
  { id: 's4', email: 'anna.l@kungsholmen.se', displayName: 'Anna Lindberg', role: 'staff' },
  { id: 's5', email: 'karl@kungsholmen.se', displayName: 'Karl Svensson', role: 'staff' },
].forEach((s) => {
  staffStore.set(s.id, {
    ...s,
    organizationId: ORG_ID,
    clinicId: CLINIC_ID,
    isActive: true,
    createdAt: seedNow,
    updatedAt: seedNow,
  });
});

// -- Clinics ------------------------------------------------------------------

const clinics = new Map<string, Clinic>();

clinics.set('kungsholmen', {
  id: CLINIC_ID,
  organizationId: ORG_ID,
  name: 'Kungsholmens Vardcentral',
  slug: 'kungsholmen',
  address: 'Hantverkargatan 11, Stockholm',
  timezone: 'Europe/Stockholm',
  defaultLanguage: 'sv',
  settings: {},
  isActive: true,
  createdAt: seedNow,
  updatedAt: seedNow,
});

// -- Organizations ------------------------------------------------------------

const organizations = new Map<string, Organization>();

organizations.set(ORG_ID, {
  id: ORG_ID,
  name: 'Kungsholmen Vard AB',
  slug: 'kungsholmen-vard',
  settings: { maxClinics: 5 },
  isActive: true,
  createdAt: seedNow,
  updatedAt: seedNow,
});

// -- Audit log ----------------------------------------------------------------

const auditLog: AuditLogEntry[] = [];

function addAuditEntry(action: string, resourceType: string, resourceId: string | null, actorId: string = 'system') {
  auditLog.push({
    id: crypto.randomUUID(),
    organizationId: ORG_ID,
    clinicId: CLINIC_ID,
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

// =============================================================================
// Staff helpers
// =============================================================================

function getStaffContext(c: { req: { header: (name: string) => string | undefined } }): { staffId: string; clinicId: string } | null {
  const staffId = c.req.header('X-Staff-Id') ?? 's2';
  return { staffId, clinicId: CLINIC_ID };
}

function findRoomForStaff(staffId: string): Room | undefined {
  return Array.from(rooms.values()).find((r) => r.currentStaffId === staffId);
}

function assignStaffToRoom(staffId: string): Room | undefined {
  let room = findRoomForStaff(staffId);
  if (room) return room;
  room = Array.from(rooms.values()).find((r) => r.status === 'open' && !r.currentStaffId && r.isActive);
  if (room) {
    room.currentStaffId = staffId;
    room.updatedAt = new Date().toISOString();
  }
  return room;
}

function generateSessionToken(): string {
  return randomBytes(64).toString('hex');
}

// =============================================================================
// Hono app
// =============================================================================

const app = new Hono().basePath('/api/v1');

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

app.use(
  '*',
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Staff-Id'],
    credentials: true,
  }),
);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', (c) =>
  c.json(
    createSuccessResponse({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
    }),
  ),
);

// =============================================================================
// AUTH routes — /api/v1/auth/*
// =============================================================================

const auth = new Hono();

// POST /auth/login
auth.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()), 400);
  }

  const { email, password } = parsed.data;
  const user = demoUsers.find((u) => u.email === email.trim().toLowerCase());

  if (!user) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password'), 401);
  }

  // Plain-text comparison for the serverless demo (no argon2 native dep)
  if (user.password !== password) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password'), 401);
  }

  const accessToken = await createAccessToken(user);
  const refreshToken = await createRefreshTokenJWT(user);
  activeRefreshTokens.add(refreshToken);

  return c.json(
    createSuccessResponse({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        role: user.role,
        clinicId: user.clinicId,
        organizationId: user.organizationId,
        displayName: user.displayName,
      },
    }),
  );
});

// POST /auth/refresh
auth.post('/refresh', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = refreshTokenSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()), 400);
  }

  const { refreshToken } = parsed.data;

  if (!activeRefreshTokens.has(refreshToken)) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_TOKEN, 'Invalid or revoked refresh token'), 401);
  }

  try {
    const { payload } = await jwtVerify(refreshToken, JWT_SECRET);
    const userId = payload.userId as string;
    const user = demoUsers.find((u) => u.id === userId);

    if (!user) {
      return c.json(createErrorResponse(ERROR_CODES.INVALID_TOKEN, 'User not found'), 401);
    }

    activeRefreshTokens.delete(refreshToken);
    const newAccessToken = await createAccessToken(user);
    const newRefreshToken = await createRefreshTokenJWT(user);
    activeRefreshTokens.add(newRefreshToken);

    return c.json(createSuccessResponse({ accessToken: newAccessToken, refreshToken: newRefreshToken }));
  } catch {
    activeRefreshTokens.delete(refreshToken);
    return c.json(createErrorResponse(ERROR_CODES.TOKEN_EXPIRED, 'Refresh token expired'), 401);
  }
});

// POST /auth/logout
auth.post('/logout', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = refreshTokenSchema.safeParse(body);

  if (parsed.success) {
    activeRefreshTokens.delete(parsed.data.refreshToken);
  }

  return c.json(createSuccessResponse({ message: 'Logged out' }));
});

app.route('/auth', auth);

// =============================================================================
// QUEUE routes — /api/v1/queue/*
// =============================================================================

const queue = new Hono();

// POST /queue/join
queue.post('/join', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = joinQueueSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()), 400);
  }

  const { clinicId, anonymousHash, language } = parsed.data;

  const existing = Array.from(tickets.values()).find(
    (t) => t.clinicId === clinicId && t.anonymousHash === anonymousHash && t.status === 'waiting',
  );
  if (existing) {
    return c.json(createErrorResponse(ERROR_CODES.ALREADY_IN_QUEUE, 'Already in queue'), 409);
  }

  const currentSize = getWaitingTickets(clinicId).length;
  if (currentSize >= MAX_QUEUE_SIZE) {
    return c.json(createErrorResponse(ERROR_CODES.QUEUE_FULL, 'Queue is full'), 503);
  }

  const sessionToken = generateSessionToken();
  const ticketNumber = nextTicketNumber++;
  const position = currentSize + 1;
  const estimatedWaitMinutes = Math.ceil((currentSize * DEFAULT_SERVICE_TIME_SECONDS) / 60);
  const now = new Date().toISOString();

  const ticket: QueueTicket = {
    id: crypto.randomUUID(),
    organizationId: ORG_ID,
    clinicId,
    ticketNumber,
    anonymousHash,
    status: 'waiting',
    priority: 0,
    position,
    assignedRoomId: null,
    sessionToken,
    estimatedWaitMinutes,
    joinedAt: now,
    calledAt: null,
    completedAt: null,
    language,
    createdAt: now,
    updatedAt: now,
  };

  tickets.set(sessionToken, ticket);

  return c.json(
    createSuccessResponse({ sessionToken, ticketNumber, position, estimatedWaitMinutes }),
    201,
  );
});

// GET /queue/status/:sessionToken
queue.get('/status/:sessionToken', (c) => {
  const sessionToken = c.req.param('sessionToken');
  const ticket = tickets.get(sessionToken);

  if (!ticket) {
    return c.json(createErrorResponse(ERROR_CODES.TICKET_NOT_FOUND, 'Ticket not found'), 404);
  }

  const queueLength = getWaitingTickets(ticket.clinicId).length;

  return c.json(
    createSuccessResponse({
      ticketNumber: ticket.ticketNumber,
      position: ticket.position,
      estimatedWaitMinutes: ticket.estimatedWaitMinutes ?? 0,
      status: ticket.status,
      queueLength,
    }),
  );
});

// POST /queue/postpone/:sessionToken
queue.post('/postpone/:sessionToken', async (c) => {
  const sessionToken = c.req.param('sessionToken');
  const ticket = tickets.get(sessionToken);

  if (!ticket) {
    return c.json(createErrorResponse(ERROR_CODES.TICKET_NOT_FOUND, 'Ticket not found'), 404);
  }

  if (ticket.status !== 'waiting') {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Ticket is not in waiting state'), 400);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = postponeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()), 400);
  }

  const { positionsBack } = parsed.data;
  const waiting = getWaitingTickets(ticket.clinicId);
  const currentIdx = waiting.findIndex((t) => t.sessionToken === sessionToken);

  if (currentIdx === -1) {
    return c.json(createErrorResponse(ERROR_CODES.TICKET_NOT_FOUND, 'Ticket not in waiting list'), 404);
  }

  const newIdx = Math.min(currentIdx + positionsBack, waiting.length - 1);
  waiting.splice(currentIdx, 1);
  waiting.splice(newIdx, 0, ticket);
  recalcPositions(ticket.clinicId);

  return c.json(
    createSuccessResponse({
      ticketNumber: ticket.ticketNumber,
      position: ticket.position,
      estimatedWaitMinutes: ticket.estimatedWaitMinutes ?? 0,
      status: ticket.status,
    }),
  );
});

// DELETE /queue/leave/:sessionToken
queue.delete('/leave/:sessionToken', (c) => {
  const sessionToken = c.req.param('sessionToken');
  const ticket = tickets.get(sessionToken);

  if (!ticket) {
    return c.json(createErrorResponse(ERROR_CODES.TICKET_NOT_FOUND, 'Ticket not found'), 404);
  }

  ticket.status = 'cancelled';
  ticket.completedAt = new Date().toISOString();
  ticket.updatedAt = new Date().toISOString();
  recalcPositions(ticket.clinicId);

  return c.json(createSuccessResponse({ message: 'Left queue', ticketNumber: ticket.ticketNumber }));
});

app.route('/queue', queue);

// =============================================================================
// STAFF routes — /api/v1/staff/*
// =============================================================================

const staff = new Hono();

// POST /staff/ready
staff.post('/ready', (c) => {
  const ctx = getStaffContext(c);
  if (!ctx) {
    return c.json(createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Unauthorized'), 401);
  }

  const room = assignStaffToRoom(ctx.staffId);
  if (!room) {
    return c.json(createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No available room'), 404);
  }

  if (room.currentTicketId) {
    return c.json(createErrorResponse(ERROR_CODES.ROOM_NOT_AVAILABLE, 'Room already has a patient'), 409);
  }

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

// POST /staff/complete
staff.post('/complete', (c) => {
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

// POST /staff/no-show
staff.post('/no-show', (c) => {
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

// POST /staff/pause
staff.post('/pause', (c) => {
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

// POST /staff/resume
staff.post('/resume', (c) => {
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

// GET /staff/room/status
staff.get('/room/status', (c) => {
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
      room: { id: room.id, name: room.name, status: room.status },
      currentTicket,
      waitingCount,
    }),
  );
});

app.route('/staff', staff);

// =============================================================================
// ADMIN routes — /api/v1/admin/*
// =============================================================================

const admin = new Hono();

// GET /admin/dashboard
admin.get('/dashboard', (c) => {
  const waiting = getWaitingTickets(CLINIC_ID);
  const allTickets = Array.from(tickets.values()).filter((t) => t.clinicId === CLINIC_ID);
  const roomList = Array.from(rooms.values()).filter((r) => r.clinicId === CLINIC_ID);

  const completed = allTickets.filter((t) => t.status === 'completed').length;
  const noShows = allTickets.filter((t) => t.status === 'no_show').length;
  const activeRooms = roomList.filter((r) => r.isActive && r.status !== 'closed').length;
  const occupiedRooms = roomList.filter((r) => r.status === 'occupied').length;

  return c.json(
    createSuccessResponse({
      clinicId: CLINIC_ID,
      queueLength: waiting.length,
      completedToday: completed,
      noShowsToday: noShows,
      totalRooms: roomList.length,
      activeRooms,
      occupiedRooms,
      averageWaitMinutes:
        waiting.length > 0
          ? Math.round(waiting.reduce((sum, t) => sum + (t.estimatedWaitMinutes ?? 0), 0) / waiting.length)
          : 0,
    }),
  );
});

// GET /admin/queue
admin.get('/queue', (c) => {
  const allTickets = Array.from(tickets.values())
    .filter((t) => t.clinicId === CLINIC_ID)
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

// POST /admin/rooms
admin.post('/rooms', async (c) => {
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
    organizationId: ORG_ID,
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

// PUT /admin/rooms/:roomId
admin.put('/rooms/:roomId', async (c) => {
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

// DELETE /admin/rooms/:roomId
admin.delete('/rooms/:roomId', (c) => {
  const roomId = c.req.param('roomId');
  const room = rooms.get(roomId);
  if (!room) {
    return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Room not found'), 404);
  }

  rooms.delete(roomId);
  addAuditEntry('room.deleted', 'room', roomId);

  return c.json(createSuccessResponse({ message: 'Room deleted' }));
});

// GET /admin/rooms
admin.get('/rooms', (c) => {
  const roomList = Array.from(rooms.values())
    .filter((r) => r.clinicId === CLINIC_ID)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return c.json(createSuccessResponse(roomList));
});

// GET /admin/staff
admin.get('/staff', (c) => {
  const staffList = Array.from(staffStore.values()).filter((s) => s.clinicId === CLINIC_ID);
  return c.json(createSuccessResponse(staffList));
});

// POST /admin/staff
admin.post('/staff', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()), 400);
  }

  const { organizationId, clinicId, email, displayName, role } = parsed.data;
  const id = crypto.randomUUID();
  const staffNow = new Date().toISOString();

  const staffMember: StaffRecord = {
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

  staffStore.set(id, staffMember);
  addAuditEntry('staff.created', 'user', id);

  return c.json(createSuccessResponse(staffMember), 201);
});

// PUT /admin/staff/:userId
admin.put('/staff/:userId', async (c) => {
  const userId = c.req.param('userId');
  const staffMember = staffStore.get(userId);
  if (!staffMember) {
    return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Staff member not found'), 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()), 400);
  }

  const updates = parsed.data;
  if (updates.email !== undefined) staffMember.email = updates.email;
  if (updates.displayName !== undefined) staffMember.displayName = updates.displayName;
  if (updates.role !== undefined) staffMember.role = updates.role;
  if (updates.isActive !== undefined) staffMember.isActive = updates.isActive;
  staffMember.updatedAt = new Date().toISOString();

  addAuditEntry('staff.updated', 'user', userId);

  return c.json(createSuccessResponse(staffMember));
});

// DELETE /admin/staff/:userId
admin.delete('/staff/:userId', (c) => {
  const userId = c.req.param('userId');
  const staffMember = staffStore.get(userId);
  if (!staffMember) {
    return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Staff member not found'), 404);
  }

  staffMember.isActive = false;
  staffMember.updatedAt = new Date().toISOString();
  addAuditEntry('staff.deactivated', 'user', userId);

  return c.json(createSuccessResponse({ message: 'Staff member deactivated' }));
});

// GET /admin/audit-log
admin.get('/audit-log', (c) => {
  const query = paginationSchema.safeParse({
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  });

  const page = query.success ? query.data.page : 1;
  const pageSize = query.success ? query.data.pageSize : 20;

  const filtered = auditLog
    .filter((e) => e.clinicId === CLINIC_ID)
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

app.route('/admin', admin);

// =============================================================================
// PUBLIC / DISPLAY routes — /api/v1/display/* and /api/v1/clinic/*
// =============================================================================

const publicRoutes = new Hono();

// GET /display/:clinicSlug
publicRoutes.get('/display/:clinicSlug', (c) => {
  const slug = c.req.param('clinicSlug');
  const clinic = clinics.get(slug);

  if (!clinic) {
    return c.json(createErrorResponse(ERROR_CODES.CLINIC_NOT_FOUND, 'Clinic not found'), 404);
  }

  const waiting = getWaitingTickets(clinic.id);
  const roomList = Array.from(rooms.values())
    .filter((r) => r.clinicId === clinic.id && r.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const calledTickets = Array.from(tickets.values())
    .filter((t) => t.clinicId === clinic.id && (t.status === 'called' || t.status === 'in_progress'))
    .map((t) => ({
      ticketNumber: t.ticketNumber,
      roomName: roomList.find((r) => r.id === t.assignedRoomId)?.name ?? null,
      status: t.status,
    }));

  return c.json(
    createSuccessResponse({
      clinicName: clinic.name,
      clinicSlug: clinic.slug,
      queueLength: waiting.length,
      rooms: roomList.map((r) => ({
        name: r.name,
        status: r.status,
        displayOrder: r.displayOrder,
      })),
      calledTickets,
      nextTicketNumbers: waiting.slice(0, 5).map((t) => t.ticketNumber),
    }),
  );
});

// GET /clinic/:clinicSlug/info
publicRoutes.get('/clinic/:clinicSlug/info', (c) => {
  const slug = c.req.param('clinicSlug');
  const clinic = clinics.get(slug);

  if (!clinic) {
    return c.json(createErrorResponse(ERROR_CODES.CLINIC_NOT_FOUND, 'Clinic not found'), 404);
  }

  return c.json(
    createSuccessResponse({
      id: clinic.id,
      name: clinic.name,
      slug: clinic.slug,
      address: clinic.address,
      timezone: clinic.timezone,
      defaultLanguage: clinic.defaultLanguage,
      isActive: clinic.isActive,
    }),
  );
});

app.route('/', publicRoutes);

// =============================================================================
// SYSTEM routes — /api/v1/system/*
// =============================================================================

const system = new Hono();

// POST /system/auth/login — SuperAdmin login
system.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = superAdminLoginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()), 400);
  }

  const { email, password, totpCode } = parsed.data;
  const adminUser = superAdmins.find((a) => a.email === email && a.isActive);

  if (!adminUser) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials'), 401);
  }

  if (adminUser.password !== password) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials'), 401);
  }

  if (!/^\d{6}$/.test(totpCode)) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid TOTP code'), 401);
  }

  const accessToken = await new SignJWT({
    userId: adminUser.id,
    role: 'superadmin',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET);

  return c.json(
    createSuccessResponse({
      accessToken,
      user: {
        id: adminUser.id,
        email: adminUser.email,
        role: 'superadmin',
      },
    }),
  );
});

// GET /system/organizations
system.get('/organizations', (c) => {
  const orgList = Array.from(organizations.values());
  return c.json(createSuccessResponse(orgList));
});

// GET /system/health
system.get('/health', (c) => {
  return c.json(
    createSuccessResponse({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    }),
  );
});

app.route('/system', system);

// =============================================================================
// Error handler & catch-all
// =============================================================================

app.onError((err, c) => {
  console.error('API Error:', err.message, err.stack);
  return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
});

app.notFound((c) => {
  return c.json({ success: false, error: { code: 'NOT_FOUND', message: `Route not found: ${c.req.path}` } }, 404);
});

// =============================================================================
// Export for Vercel
// =============================================================================

export default handle(app);
