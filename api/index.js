// ==========================================================================
// VardKo Queue API — Single-file Vercel Serverless Function (CommonJS)
// Plain Node.js handler with manual routing (no frameworks).
// ==========================================================================

const { SignJWT, jwtVerify } = require('jose');
const { z } = require('zod');
const crypto = require('crypto');
const randomBytes = crypto.randomBytes;
const createHash = crypto.createHash;

// ==========================================================================
// CONSTANTS
// ==========================================================================

const API_VERSION = 'v1';

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
};

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

const TICKET_STATUSES = ['waiting', 'called', 'in_progress', 'completed', 'no_show', 'cancelled'];
const ROOM_STATUSES = ['open', 'occupied', 'paused', 'closed'];

const DEFAULT_MAX_POSTPONEMENTS = 3;
const DEFAULT_SERVICE_TIME_SECONDS = 480; // 8 minutes
const MAX_QUEUE_SIZE = 200;

const SUPPORTED_LANGUAGES = ['sv', 'no', 'da', 'fi', 'en', 'de', 'es', 'fr', 'it'];
const USER_ROLES = ['org_admin', 'clinic_admin', 'staff'];

// ==========================================================================
// ZOD SCHEMAS
// ==========================================================================

const uuidSchema = z.string().uuid();

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

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

// ==========================================================================
// UTILITY: API response helpers
// ==========================================================================

function createSuccessResponse(data, meta) {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

function createErrorResponse(code, message, details) {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
  };
}

// ==========================================================================
// UTILITY: Simple password hashing (SHA-256 based, suitable for demo/Vercel)
// In production, use argon2 or bcrypt with a proper runtime.
// ==========================================================================

function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(salt + plain).digest('hex');
  return salt + ':' + hash;
}

function verifyPassword(storedHash, plain) {
  const [salt, hash] = storedHash.split(':');
  const check = createHash('sha256').update(salt + plain).digest('hex');
  return hash === check;
}

// ==========================================================================
// IN-MEMORY STORES
// ==========================================================================

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const CLINIC_ID = '00000000-0000-0000-0000-000000000010';

// --- Demo users (auth) ---
const demoUsers = [];

const usersReady = (async () => {
  const entries = [
    { id: 's1', organizationId: ORG_ID, clinicId: CLINIC_ID, email: 'anna@kungsholmen.se', displayName: 'Anna Adminsson', role: 'clinic_admin', plainPassword: 'Admin123456!' },
    { id: 's2', organizationId: ORG_ID, clinicId: CLINIC_ID, email: 'erik@kungsholmen.se', displayName: 'Erik Eriksson', role: 'staff', plainPassword: 'Staff123456!' },
    { id: 's3', organizationId: ORG_ID, clinicId: CLINIC_ID, email: 'maria@kungsholmen.se', displayName: 'Maria Johansson', role: 'staff', plainPassword: 'Staff123456!' },
    { id: 's4', organizationId: ORG_ID, clinicId: CLINIC_ID, email: 'anna.l@kungsholmen.se', displayName: 'Anna Lindberg', role: 'staff', plainPassword: 'Staff123456!' },
    { id: 's5', organizationId: ORG_ID, clinicId: CLINIC_ID, email: 'karl@kungsholmen.se', displayName: 'Karl Svensson', role: 'staff', plainPassword: 'Staff123456!' },
  ];
  for (const entry of entries) {
    const { plainPassword, ...rest } = entry;
    const passwordHash = hashPassword(plainPassword);
    demoUsers.push({ ...rest, passwordHash });
  }
})();

// --- Queue tickets ---
const tickets = new Map();
let nextTicketNumber = 1;

// --- Rooms ---
const rooms = new Map();

function seedRooms() {
  const now = new Date().toISOString();
  const demoRooms = [
    { id: 'room-1', organizationId: ORG_ID, clinicId: CLINIC_ID, name: 'Rum 1', displayOrder: 1, status: 'open', currentStaffId: null, currentTicketId: null, isActive: true, createdAt: now, updatedAt: now },
    { id: 'room-2', organizationId: ORG_ID, clinicId: CLINIC_ID, name: 'Rum 2', displayOrder: 2, status: 'open', currentStaffId: null, currentTicketId: null, isActive: true, createdAt: now, updatedAt: now },
    { id: 'room-3', organizationId: ORG_ID, clinicId: CLINIC_ID, name: 'Rum 3', displayOrder: 3, status: 'open', currentStaffId: null, currentTicketId: null, isActive: true, createdAt: now, updatedAt: now },
  ];
  for (const r of demoRooms) {
    rooms.set(r.id, r);
  }
}
seedRooms();

// --- Staff store (admin) ---
const staffStore = new Map();

const staffNow = new Date().toISOString();
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
    createdAt: staffNow,
    updatedAt: staffNow,
  });
});

// --- Clinics ---
const clinics = new Map();

const clinicNow = new Date().toISOString();
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
  createdAt: clinicNow,
  updatedAt: clinicNow,
});

// --- SuperAdmin ---
const superAdmins = [];

const superAdminsReady = (async () => {
  const hash = hashPassword('SuperAdmin123456!');
  superAdmins.push({
    id: 'sa-1',
    email: 'superadmin@vardko.se',
    passwordHash: hash,
    totpSecret: 'demo-totp-secret',
    isActive: true,
  });
})();

// --- Organizations ---
const organizations = new Map();

const orgNow = new Date().toISOString();
organizations.set(ORG_ID, {
  id: ORG_ID,
  name: 'Kungsholmen Vard AB',
  slug: 'kungsholmen-vard',
  settings: { maxClinics: 5 },
  isActive: true,
  createdAt: orgNow,
  updatedAt: orgNow,
});

// --- Audit log ---
const auditLog = [];

function addAuditEntry(action, resourceType, resourceId, actorId) {
  actorId = actorId || 'system';
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

// --- Refresh token store ---
const activeRefreshTokens = new Set();

// ==========================================================================
// JWT HELPERS
// ==========================================================================

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-change-in-production-minimum-32-chars!',
);

async function createAccessToken(user) {
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

async function createRefreshTokenJWT(user) {
  return new SignJWT({ userId: user.id, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

// ==========================================================================
// QUEUE HELPERS
// ==========================================================================

function generateSessionToken() {
  return randomBytes(64).toString('hex');
}

function getWaitingTickets(clinicId) {
  return Array.from(tickets.values())
    .filter((t) => t.clinicId === clinicId && t.status === 'waiting')
    .sort((a, b) => a.position - b.position);
}

function recalcPositions(clinicId) {
  const waiting = getWaitingTickets(clinicId);
  waiting.forEach((t, idx) => {
    t.position = idx + 1;
    t.estimatedWaitMinutes = Math.ceil((idx * DEFAULT_SERVICE_TIME_SECONDS) / 60);
    t.updatedAt = new Date().toISOString();
  });
}

// ==========================================================================
// STAFF HELPERS
// ==========================================================================

function getStaffContext(req) {
  const staffId = req.headers['x-staff-id'] || 's2';
  return { staffId, clinicId: CLINIC_ID };
}

function findRoomForStaff(staffId) {
  return Array.from(rooms.values()).find((r) => r.currentStaffId === staffId);
}

function assignStaffToRoom(staffId) {
  let room = findRoomForStaff(staffId);
  if (room) return room;
  room = Array.from(rooms.values()).find((r) => r.status === 'open' && !r.currentStaffId && r.isActive);
  if (room) {
    room.currentStaffId = staffId;
    room.updatedAt = new Date().toISOString();
  }
  return room;
}

// ==========================================================================
// REQUEST HELPERS
// ==========================================================================

// Helper to parse JSON body from incoming request
async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', function (chunk) { data += chunk; });
    req.on('end', function () {
      try { resolve(JSON.parse(data)); } catch (_e) { resolve(null); }
    });
    req.on('error', reject);
  });
}

// Helper to parse query string params from a URL
function getQueryParams(url) {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  const params = {};
  const qs = url.slice(idx + 1);
  qs.split('&').forEach(function (pair) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) {
      params[decodeURIComponent(pair)] = '';
    } else {
      params[decodeURIComponent(pair.slice(0, eqIdx))] = decodeURIComponent(pair.slice(eqIdx + 1));
    }
  });
  return params;
}

// Helper to strip query string from URL for route matching
function getPathname(url) {
  const idx = url.indexOf('?');
  return idx === -1 ? url : url.slice(0, idx);
}

// ==========================================================================
// VERCEL HANDLER
// ==========================================================================

module.exports = async function handler(req, res) {
  const url = req.url || '/';
  const method = req.method || 'GET';
  const pathname = getPathname(url);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Staff-Id');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    let match;

    // -----------------------------------------------------------------------
    // Health check — GET /api/v1/health
    // -----------------------------------------------------------------------
    if (method === 'GET' && pathname === '/api/v1/health') {
      return res.status(200).json(
        createSuccessResponse({
          status: 'ok',
          timestamp: new Date().toISOString(),
          version: '0.0.1',
        }),
      );
    }

    // =====================================================================
    // AUTH ROUTES — /api/v1/auth/*
    // =====================================================================

    // POST /api/v1/auth/login
    if (method === 'POST' && pathname === '/api/v1/auth/login') {
      await usersReady;

      const body = await parseBody(req);
      const parsed = loginSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()));
      }

      const { email, password } = parsed.data;
      const user = demoUsers.find((u) => u.email === email.trim().toLowerCase());

      if (!user) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password'));
      }

      const valid = verifyPassword(user.passwordHash, password);
      if (!valid) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password'));
      }

      const accessToken = await createAccessToken(user);
      const refreshToken = await createRefreshTokenJWT(user);
      activeRefreshTokens.add(refreshToken);

      return res.status(200).json(
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
    }

    // POST /api/v1/auth/refresh
    if (method === 'POST' && pathname === '/api/v1/auth/refresh') {
      await usersReady;

      const body = await parseBody(req);
      const parsed = refreshTokenSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()));
      }

      const { refreshToken } = parsed.data;

      if (!activeRefreshTokens.has(refreshToken)) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.INVALID_TOKEN, 'Invalid or revoked refresh token'));
      }

      try {
        const { payload } = await jwtVerify(refreshToken, JWT_SECRET);
        const userId = payload.userId;
        const user = demoUsers.find((u) => u.id === userId);

        if (!user) {
          return res.status(401).json(createErrorResponse(ERROR_CODES.INVALID_TOKEN, 'User not found'));
        }

        // Rotate refresh token
        activeRefreshTokens.delete(refreshToken);
        const newAccessToken = await createAccessToken(user);
        const newRefreshToken = await createRefreshTokenJWT(user);
        activeRefreshTokens.add(newRefreshToken);

        return res.status(200).json(
          createSuccessResponse({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
          }),
        );
      } catch (_err) {
        activeRefreshTokens.delete(refreshToken);
        return res.status(401).json(createErrorResponse(ERROR_CODES.TOKEN_EXPIRED, 'Refresh token expired'));
      }
    }

    // POST /api/v1/auth/logout
    if (method === 'POST' && pathname === '/api/v1/auth/logout') {
      const body = await parseBody(req);
      const parsed = refreshTokenSchema.safeParse(body);

      if (parsed.success) {
        activeRefreshTokens.delete(parsed.data.refreshToken);
      }

      return res.status(200).json(createSuccessResponse({ message: 'Logged out' }));
    }

    // =====================================================================
    // QUEUE ROUTES — /api/v1/queue/*
    // =====================================================================

    // POST /api/v1/queue/join
    if (method === 'POST' && pathname === '/api/v1/queue/join') {
      const body = await parseBody(req);
      const parsed = joinQueueSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()));
      }

      const { clinicId, anonymousHash, language } = parsed.data;

      // Check for duplicate hash (already in queue)
      const existing = Array.from(tickets.values()).find(
        (t) => t.clinicId === clinicId && t.anonymousHash === anonymousHash && t.status === 'waiting',
      );
      if (existing) {
        return res.status(409).json(createErrorResponse(ERROR_CODES.ALREADY_IN_QUEUE, 'Already in queue'));
      }

      // Check queue capacity
      const currentSize = getWaitingTickets(clinicId).length;
      if (currentSize >= MAX_QUEUE_SIZE) {
        return res.status(503).json(createErrorResponse(ERROR_CODES.QUEUE_FULL, 'Queue is full'));
      }

      const sessionToken = generateSessionToken();
      const ticketNumber = nextTicketNumber++;
      const position = currentSize + 1;
      const estimatedWaitMinutes = Math.ceil((currentSize * DEFAULT_SERVICE_TIME_SECONDS) / 60);
      const now = new Date().toISOString();

      const ticket = {
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

      return res.status(201).json(
        createSuccessResponse({
          sessionToken,
          ticketNumber,
          position,
          estimatedWaitMinutes,
        }),
      );
    }

    // GET /api/v1/queue/status/:sessionToken
    match = pathname.match(/^\/api\/v1\/queue\/status\/([^/]+)$/);
    if (method === 'GET' && match) {
      const sessionToken = match[1];
      const ticket = tickets.get(sessionToken);

      if (!ticket) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.TICKET_NOT_FOUND, 'Ticket not found'));
      }

      const queueLength = getWaitingTickets(ticket.clinicId).length;

      return res.status(200).json(
        createSuccessResponse({
          ticketNumber: ticket.ticketNumber,
          position: ticket.position,
          estimatedWaitMinutes: ticket.estimatedWaitMinutes ?? 0,
          status: ticket.status,
          queueLength,
        }),
      );
    }

    // POST /api/v1/queue/postpone/:sessionToken
    match = pathname.match(/^\/api\/v1\/queue\/postpone\/([^/]+)$/);
    if (method === 'POST' && match) {
      const sessionToken = match[1];
      const ticket = tickets.get(sessionToken);

      if (!ticket) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.TICKET_NOT_FOUND, 'Ticket not found'));
      }

      if (ticket.status !== 'waiting') {
        return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Ticket is not in waiting state'));
      }

      const body = await parseBody(req);
      const parsed = postponeSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()));
      }

      const { positionsBack } = parsed.data;
      const waiting = getWaitingTickets(ticket.clinicId);
      const currentIdx = waiting.findIndex((t) => t.sessionToken === sessionToken);

      if (currentIdx === -1) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.TICKET_NOT_FOUND, 'Ticket not in waiting list'));
      }

      const newIdx = Math.min(currentIdx + positionsBack, waiting.length - 1);

      // Move ticket in the array
      waiting.splice(currentIdx, 1);
      waiting.splice(newIdx, 0, ticket);

      // Recalculate all positions
      recalcPositions(ticket.clinicId);

      return res.status(200).json(
        createSuccessResponse({
          ticketNumber: ticket.ticketNumber,
          position: ticket.position,
          estimatedWaitMinutes: ticket.estimatedWaitMinutes ?? 0,
          status: ticket.status,
        }),
      );
    }

    // DELETE /api/v1/queue/leave/:sessionToken
    match = pathname.match(/^\/api\/v1\/queue\/leave\/([^/]+)$/);
    if (method === 'DELETE' && match) {
      const sessionToken = match[1];
      const ticket = tickets.get(sessionToken);

      if (!ticket) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.TICKET_NOT_FOUND, 'Ticket not found'));
      }

      ticket.status = 'cancelled';
      ticket.completedAt = new Date().toISOString();
      ticket.updatedAt = new Date().toISOString();

      recalcPositions(ticket.clinicId);

      return res.status(200).json(createSuccessResponse({ message: 'Left queue', ticketNumber: ticket.ticketNumber }));
    }

    // =====================================================================
    // STAFF ROUTES — /api/v1/staff/*
    // =====================================================================

    // POST /api/v1/staff/ready
    if (method === 'POST' && pathname === '/api/v1/staff/ready') {
      const ctx = getStaffContext(req);
      if (!ctx) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Unauthorized'));
      }

      const room = assignStaffToRoom(ctx.staffId);
      if (!room) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No available room'));
      }

      if (room.currentTicketId) {
        return res.status(409).json(createErrorResponse(ERROR_CODES.ROOM_NOT_AVAILABLE, 'Room already has a patient'));
      }

      const waiting = getWaitingTickets(ctx.clinicId);
      if (waiting.length === 0) {
        return res.status(200).json(createSuccessResponse({ message: 'No patients waiting', roomName: room.name }));
      }

      const nextTicket = waiting[0];
      nextTicket.status = 'called';
      nextTicket.assignedRoomId = room.id;
      nextTicket.calledAt = new Date().toISOString();
      nextTicket.updatedAt = new Date().toISOString();

      room.currentTicketId = nextTicket.id;
      room.status = 'occupied';
      room.updatedAt = new Date().toISOString();

      recalcPositions(ctx.clinicId);

      return res.status(200).json(
        createSuccessResponse({
          ticketNumber: nextTicket.ticketNumber,
          roomName: room.name,
          roomId: room.id,
          status: 'called',
        }),
      );
    }

    // POST /api/v1/staff/complete
    if (method === 'POST' && pathname === '/api/v1/staff/complete') {
      const ctx = getStaffContext(req);
      if (!ctx) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Unauthorized'));
      }

      const room = findRoomForStaff(ctx.staffId);
      if (!room || !room.currentTicketId) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No active patient in room'));
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

      return res.status(200).json(createSuccessResponse({ message: 'Patient completed', roomName: room.name }));
    }

    // POST /api/v1/staff/no-show
    if (method === 'POST' && pathname === '/api/v1/staff/no-show') {
      const ctx = getStaffContext(req);
      if (!ctx) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Unauthorized'));
      }

      const room = findRoomForStaff(ctx.staffId);
      if (!room || !room.currentTicketId) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No active patient in room'));
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

      return res.status(200).json(createSuccessResponse({ message: 'Patient marked no-show', roomName: room.name }));
    }

    // POST /api/v1/staff/pause
    if (method === 'POST' && pathname === '/api/v1/staff/pause') {
      const ctx = getStaffContext(req);
      if (!ctx) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Unauthorized'));
      }

      const room = findRoomForStaff(ctx.staffId);
      if (!room) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No room assigned'));
      }

      room.status = 'paused';
      room.updatedAt = new Date().toISOString();

      return res.status(200).json(createSuccessResponse({ message: 'Room paused', roomName: room.name, status: room.status }));
    }

    // POST /api/v1/staff/resume
    if (method === 'POST' && pathname === '/api/v1/staff/resume') {
      const ctx = getStaffContext(req);
      if (!ctx) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Unauthorized'));
      }

      const room = findRoomForStaff(ctx.staffId);
      if (!room) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No room assigned'));
      }

      room.status = room.currentTicketId ? 'occupied' : 'open';
      room.updatedAt = new Date().toISOString();

      return res.status(200).json(createSuccessResponse({ message: 'Room resumed', roomName: room.name, status: room.status }));
    }

    // GET /api/v1/staff/room/status
    if (method === 'GET' && pathname === '/api/v1/staff/room/status') {
      const ctx = getStaffContext(req);
      if (!ctx) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Unauthorized'));
      }

      const room = findRoomForStaff(ctx.staffId);
      if (!room) {
        return res.status(200).json(createSuccessResponse({ assigned: false, room: null, currentTicket: null }));
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

      return res.status(200).json(
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
    }

    // =====================================================================
    // ADMIN ROUTES — /api/v1/admin/*
    // =====================================================================

    // GET /api/v1/admin/dashboard
    if (method === 'GET' && pathname === '/api/v1/admin/dashboard') {
      const waiting = getWaitingTickets(CLINIC_ID);
      const allTickets = Array.from(tickets.values()).filter((t) => t.clinicId === CLINIC_ID);
      const roomList = Array.from(rooms.values()).filter((r) => r.clinicId === CLINIC_ID);

      const completed = allTickets.filter((t) => t.status === 'completed').length;
      const noShows = allTickets.filter((t) => t.status === 'no_show').length;
      const activeRooms = roomList.filter((r) => r.isActive && r.status !== 'closed').length;
      const occupiedRooms = roomList.filter((r) => r.status === 'occupied').length;

      return res.status(200).json(
        createSuccessResponse({
          clinicId: CLINIC_ID,
          queueLength: waiting.length,
          completedToday: completed,
          noShowsToday: noShows,
          totalRooms: roomList.length,
          activeRooms,
          occupiedRooms,
          averageWaitMinutes: waiting.length > 0 ? Math.round(waiting.reduce((sum, t) => sum + (t.estimatedWaitMinutes ?? 0), 0) / waiting.length) : 0,
        }),
      );
    }

    // GET /api/v1/admin/queue
    if (method === 'GET' && pathname === '/api/v1/admin/queue') {
      const allTickets = Array.from(tickets.values())
        .filter((t) => t.clinicId === CLINIC_ID)
        .sort((a, b) => a.position - b.position);

      return res.status(200).json(
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
    }

    // POST /api/v1/admin/rooms
    if (method === 'POST' && pathname === '/api/v1/admin/rooms') {
      const body = await parseBody(req);
      const parsed = createRoomSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()));
      }

      const { clinicId, name, displayOrder } = parsed.data;
      const id = crypto.randomUUID();
      const roomNow = new Date().toISOString();

      const room = {
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

      return res.status(201).json(createSuccessResponse(room));
    }

    // GET /api/v1/admin/rooms
    if (method === 'GET' && pathname === '/api/v1/admin/rooms') {
      const roomList = Array.from(rooms.values())
        .filter((r) => r.clinicId === CLINIC_ID)
        .sort((a, b) => a.displayOrder - b.displayOrder);

      return res.status(200).json(createSuccessResponse(roomList));
    }

    // PUT /api/v1/admin/rooms/:roomId
    match = pathname.match(/^\/api\/v1\/admin\/rooms\/([^/]+)$/);
    if (method === 'PUT' && match) {
      const roomId = match[1];
      const room = rooms.get(roomId);
      if (!room) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Room not found'));
      }

      const body = await parseBody(req);
      const parsed = updateRoomSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()));
      }

      const updates = parsed.data;
      if (updates.name !== undefined) room.name = updates.name;
      if (updates.displayOrder !== undefined) room.displayOrder = updates.displayOrder;
      if (updates.isActive !== undefined) room.isActive = updates.isActive;
      room.updatedAt = new Date().toISOString();

      addAuditEntry('room.updated', 'room', roomId);

      return res.status(200).json(createSuccessResponse(room));
    }

    // DELETE /api/v1/admin/rooms/:roomId
    match = pathname.match(/^\/api\/v1\/admin\/rooms\/([^/]+)$/);
    if (method === 'DELETE' && match) {
      const roomId = match[1];
      const room = rooms.get(roomId);
      if (!room) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Room not found'));
      }

      rooms.delete(roomId);
      addAuditEntry('room.deleted', 'room', roomId);

      return res.status(200).json(createSuccessResponse({ message: 'Room deleted' }));
    }

    // GET /api/v1/admin/staff
    if (method === 'GET' && pathname === '/api/v1/admin/staff') {
      const staffList = Array.from(staffStore.values()).filter((s) => s.clinicId === CLINIC_ID);
      return res.status(200).json(createSuccessResponse(staffList));
    }

    // POST /api/v1/admin/staff
    if (method === 'POST' && pathname === '/api/v1/admin/staff') {
      const body = await parseBody(req);
      const parsed = createUserSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()));
      }

      const { organizationId, clinicId, email, displayName, role } = parsed.data;
      const id = crypto.randomUUID();
      const createNow = new Date().toISOString();

      const staff = {
        id,
        organizationId,
        clinicId: clinicId ?? null,
        email,
        displayName,
        role,
        isActive: true,
        createdAt: createNow,
        updatedAt: createNow,
      };

      staffStore.set(id, staff);
      addAuditEntry('staff.created', 'user', id);

      return res.status(201).json(createSuccessResponse(staff));
    }

    // PUT /api/v1/admin/staff/:userId
    match = pathname.match(/^\/api\/v1\/admin\/staff\/([^/]+)$/);
    if (method === 'PUT' && match) {
      const userId = match[1];
      const staff = staffStore.get(userId);
      if (!staff) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Staff member not found'));
      }

      const body = await parseBody(req);
      const parsed = updateUserSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()));
      }

      const updates = parsed.data;
      if (updates.email !== undefined) staff.email = updates.email;
      if (updates.displayName !== undefined) staff.displayName = updates.displayName;
      if (updates.role !== undefined) staff.role = updates.role;
      if (updates.isActive !== undefined) staff.isActive = updates.isActive;
      staff.updatedAt = new Date().toISOString();

      addAuditEntry('staff.updated', 'user', userId);

      return res.status(200).json(createSuccessResponse(staff));
    }

    // DELETE /api/v1/admin/staff/:userId
    match = pathname.match(/^\/api\/v1\/admin\/staff\/([^/]+)$/);
    if (method === 'DELETE' && match) {
      const userId = match[1];
      const staff = staffStore.get(userId);
      if (!staff) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Staff member not found'));
      }

      staff.isActive = false;
      staff.updatedAt = new Date().toISOString();
      addAuditEntry('staff.deactivated', 'user', userId);

      return res.status(200).json(createSuccessResponse({ message: 'Staff member deactivated' }));
    }

    // GET /api/v1/admin/audit-log
    if (method === 'GET' && pathname === '/api/v1/admin/audit-log') {
      const queryParams = getQueryParams(url);
      const query = paginationSchema.safeParse({
        page: queryParams.page,
        pageSize: queryParams.pageSize,
      });

      const page = query.success ? query.data.page : 1;
      const pageSize = query.success ? query.data.pageSize : 20;

      const filtered = auditLog
        .filter((e) => e.clinicId === CLINIC_ID)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      const total = filtered.length;
      const totalPages = Math.ceil(total / pageSize);
      const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

      return res.status(200).json(
        createSuccessResponse(paginated, {
          pagination: { page, pageSize, total, totalPages },
        }),
      );
    }

    // =====================================================================
    // PUBLIC ROUTES — /api/v1/*
    // =====================================================================

    // GET /api/v1/display/:clinicSlug
    match = pathname.match(/^\/api\/v1\/display\/([^/]+)$/);
    if (method === 'GET' && match) {
      const slug = match[1];
      const clinic = clinics.get(slug);

      if (!clinic) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.CLINIC_NOT_FOUND, 'Clinic not found'));
      }

      const waiting = getWaitingTickets(clinic.id);
      const roomList = Array.from(rooms.values())
        .filter((r) => r.clinicId === clinic.id && r.isActive)
        .sort((a, b) => a.displayOrder - b.displayOrder);

      // Build display data — only expose non-sensitive information
      const calledTickets = Array.from(tickets.values())
        .filter((t) => t.clinicId === clinic.id && (t.status === 'called' || t.status === 'in_progress'))
        .map((t) => ({
          ticketNumber: t.ticketNumber,
          roomName: roomList.find((r) => r.id === t.assignedRoomId)?.name ?? null,
          status: t.status,
        }));

      return res.status(200).json(
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
    }

    // GET /api/v1/clinic/:clinicSlug/info
    match = pathname.match(/^\/api\/v1\/clinic\/([^/]+)\/info$/);
    if (method === 'GET' && match) {
      const slug = match[1];
      const clinic = clinics.get(slug);

      if (!clinic) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.CLINIC_NOT_FOUND, 'Clinic not found'));
      }

      return res.status(200).json(
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
    }

    // =====================================================================
    // SYSTEM ROUTES — /api/v1/system/*
    // =====================================================================

    // POST /api/v1/system/auth/login — SuperAdmin login
    if (method === 'POST' && pathname === '/api/v1/system/auth/login') {
      await superAdminsReady;

      const body = await parseBody(req);
      const parsed = superAdminLoginSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()));
      }

      const { email, password, totpCode } = parsed.data;
      const admin = superAdmins.find((a) => a.email === email && a.isActive);

      if (!admin) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials'));
      }

      const validPassword = verifyPassword(admin.passwordHash, password);
      if (!validPassword) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials'));
      }

      // Simplified TOTP check — accept any valid 6-digit code for demo
      if (!/^\d{6}$/.test(totpCode)) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid TOTP code'));
      }

      const accessToken = await new SignJWT({
        userId: admin.id,
        role: 'superadmin',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(ACCESS_TOKEN_EXPIRY)
        .sign(JWT_SECRET);

      return res.status(200).json(
        createSuccessResponse({
          accessToken,
          user: {
            id: admin.id,
            email: admin.email,
            role: 'superadmin',
          },
        }),
      );
    }

    // GET /api/v1/system/organizations
    if (method === 'GET' && pathname === '/api/v1/system/organizations') {
      const orgList = Array.from(organizations.values());
      return res.status(200).json(createSuccessResponse(orgList));
    }

    // GET /api/v1/system/health
    if (method === 'GET' && pathname === '/api/v1/system/health') {
      return res.status(200).json(
        createSuccessResponse({
          status: 'ok',
          timestamp: new Date().toISOString(),
          version: '0.0.1',
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
        }),
      );
    }

    // =====================================================================
    // 404 — No route matched
    // =====================================================================
    return res.status(404).json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Not found'));

  } catch (err) {
    return res.status(500).json(createErrorResponse(ERROR_CODES.INTERNAL_ERROR, err.message));
  }
};
