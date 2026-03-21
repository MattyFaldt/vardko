// ==========================================================================
// VardKo Queue API — Single-file Vercel Serverless Function (CommonJS)
// Plain Node.js handler with manual routing (no frameworks).
// Uses Supabase PostgreSQL for persistence.
// ==========================================================================

const { SignJWT, jwtVerify } = require('jose');
const { z } = require('zod');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const randomBytes = crypto.randomBytes;

// ==========================================================================
// SUPABASE CLIENT
// ==========================================================================

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://etykcnatammfevtdyqob.supabase.co',
  process.env.SUPABASE_ANON_KEY || ''
);

// ==========================================================================
// SEED PASSWORD HASHES — update placeholder hashes on startup
// ==========================================================================

(async () => {
  try {
    const { data: users } = await supabase.from('users').select('id, password_hash');
    for (const u of users || []) {
      if (u.password_hash && u.password_hash.startsWith('$argon2id$placeholder')) {
        const plainPw = u.id === 's1' ? 'Admin123456!' : 'Staff123456!';
        const hash = await bcrypt.hash(plainPw, 10);
        await supabase.from('users').update({ password_hash: hash }).eq('id', u.id);
      }
    }
  } catch (err) {
    console.error('Seed password hash update failed:', err.message);
  }
})();

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
// SUPABASE HELPERS — audit log
// ==========================================================================

async function addAuditEntry(action, resourceType, resourceId, actorId, orgId, clinicId) {
  actorId = actorId || 'system';
  try {
    await supabase.from('audit_log').insert({
      organization_id: orgId || null,
      clinic_id: clinicId || null,
      actor_type: 'admin',
      actor_id: actorId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      metadata: {},
      ip_hash: null,
    });
  } catch (err) {
    console.error('Audit log insert failed:', err.message);
  }
}

// ==========================================================================
// SUPABASE HELPERS — queue
// ==========================================================================

async function getWaitingTickets(clinicId) {
  const { data, error } = await supabase
    .from('queue_tickets')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('status', 'waiting')
    .order('position', { ascending: true });

  if (error) {
    console.error('getWaitingTickets error:', error.message);
    return [];
  }
  return data || [];
}

async function recalcPositions(clinicId) {
  const waiting = await getWaitingTickets(clinicId);
  for (let idx = 0; idx < waiting.length; idx++) {
    const t = waiting[idx];
    const newPosition = idx + 1;
    const newWait = Math.ceil((idx * DEFAULT_SERVICE_TIME_SECONDS) / 60);
    await supabase
      .from('queue_tickets')
      .update({
        position: newPosition,
        estimated_wait_minutes: newWait,
      })
      .eq('id', t.id);
  }
}

// ==========================================================================
// SUPABASE HELPERS — staff / rooms
// ==========================================================================

function getStaffContext(req) {
  const staffId = req.headers['x-staff-id'] || 's2';
  // We'll look up the user's clinic from the DB in the route handler
  return { staffId };
}

async function getStaffClinicId(staffId) {
  const { data } = await supabase
    .from('users')
    .select('clinic_id')
    .eq('id', staffId)
    .single();
  return data ? data.clinic_id : null;
}

async function findRoomForStaff(staffId) {
  const { data } = await supabase
    .from('rooms')
    .select('*')
    .eq('current_staff_id', staffId)
    .limit(1)
    .single();
  return data || null;
}

async function assignStaffToRoom(staffId) {
  let room = await findRoomForStaff(staffId);
  if (room) return room;

  // Find an open room with no staff assigned
  const { data: openRoom } = await supabase
    .from('rooms')
    .select('*')
    .eq('status', 'open')
    .is('current_staff_id', null)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .limit(1)
    .single();

  if (openRoom) {
    await supabase
      .from('rooms')
      .update({ current_staff_id: staffId })
      .eq('id', openRoom.id);
    openRoom.current_staff_id = staffId;
    return openRoom;
  }
  return null;
}

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
    organizationId: user.organization_id,
    clinicId: user.clinic_id,
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

// ==========================================================================
// REQUEST HELPERS
// ==========================================================================

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

  console.log('API handler called:', method, url, pathname);

  // CORS headers
  const corsOrigin = (process.env.CORS_ORIGIN || '*').trim();
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
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
      const body = await parseBody(req);
      const parsed = loginSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()));
      }

      const { email, password } = parsed.data;

      // Try users table first
      let user = null;
      let isSuperAdmin = false;

      const { data: normalUser } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.trim().toLowerCase())
        .eq('is_active', true)
        .single();

      if (normalUser) {
        user = normalUser;
      } else {
        // Fallback: check superadmins table
        const { data: superUser } = await supabase
          .from('superadmins')
          .select('*')
          .eq('email', email.trim().toLowerCase())
          .eq('is_active', true)
          .single();
        if (superUser) {
          user = { ...superUser, role: 'superadmin', organization_id: null, clinic_id: null, display_name: 'Mattias Faldt' };
          isSuperAdmin = true;
        }
      }

      if (!user) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password'));
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password'));
      }

      // Update last_login_at for regular users
      if (!isSuperAdmin) {
        await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);
      }

      const accessToken = await createAccessToken(user);
      const refreshToken = await createRefreshTokenJWT(user);

      return res.status(200).json(
        createSuccessResponse({
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            role: user.role,
            clinicId: user.clinic_id,
            organizationId: user.organization_id,
            displayName: user.display_name,
          },
        }),
      );
    }

    // POST /api/v1/auth/refresh
    if (method === 'POST' && pathname === '/api/v1/auth/refresh') {
      const body = await parseBody(req);
      const parsed = refreshTokenSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()));
      }

      const { refreshToken } = parsed.data;

      try {
        const { payload } = await jwtVerify(refreshToken, JWT_SECRET);
        const userId = payload.userId;

        const { data: user, error: userErr } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .eq('is_active', true)
          .single();

        if (userErr || !user) {
          return res.status(401).json(createErrorResponse(ERROR_CODES.INVALID_TOKEN, 'User not found'));
        }

        const newAccessToken = await createAccessToken(user);
        const newRefreshToken = await createRefreshTokenJWT(user);

        return res.status(200).json(
          createSuccessResponse({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
          }),
        );
      } catch (_err) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.TOKEN_EXPIRED, 'Refresh token expired'));
      }
    }

    // POST /api/v1/auth/logout
    if (method === 'POST' && pathname === '/api/v1/auth/logout') {
      // With DB-backed tokens we could invalidate here; for now just acknowledge
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
      const { data: existing } = await supabase
        .from('queue_tickets')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('anonymous_hash', anonymousHash)
        .eq('status', 'waiting')
        .limit(1);

      if (existing && existing.length > 0) {
        return res.status(409).json(createErrorResponse(ERROR_CODES.ALREADY_IN_QUEUE, 'Already in queue'));
      }

      // Check queue capacity
      const waiting = await getWaitingTickets(clinicId);
      const currentSize = waiting.length;
      if (currentSize >= MAX_QUEUE_SIZE) {
        return res.status(503).json(createErrorResponse(ERROR_CODES.QUEUE_FULL, 'Queue is full'));
      }

      // Get next ticket number
      const { data: maxResult } = await supabase.rpc('get_next_ticket_number', { p_clinic_id: clinicId });
      let ticketNumber;
      if (maxResult !== null && maxResult !== undefined) {
        ticketNumber = maxResult;
      } else {
        // Fallback: query manually
        const { data: maxRow } = await supabase
          .from('queue_tickets')
          .select('ticket_number')
          .eq('clinic_id', clinicId)
          .order('ticket_number', { ascending: false })
          .limit(1);
        ticketNumber = (maxRow && maxRow.length > 0) ? maxRow[0].ticket_number + 1 : 1;
      }

      // Get clinic's organization_id
      const { data: clinic } = await supabase
        .from('clinics')
        .select('organization_id')
        .eq('id', clinicId)
        .single();

      const sessionToken = generateSessionToken();
      const position = currentSize + 1;
      const estimatedWaitMinutes = Math.ceil((currentSize * DEFAULT_SERVICE_TIME_SECONDS) / 60);
      const now = new Date().toISOString();

      const { data: ticket, error: insertErr } = await supabase
        .from('queue_tickets')
        .insert({
          organization_id: clinic ? clinic.organization_id : null,
          clinic_id: clinicId,
          ticket_number: ticketNumber,
          anonymous_hash: anonymousHash,
          status: 'waiting',
          priority: 0,
          position,
          assigned_room_id: null,
          session_token: sessionToken,
          estimated_wait_minutes: estimatedWaitMinutes,
          joined_at: now,
          called_at: null,
          completed_at: null,
          language,
        })
        .select()
        .single();

      if (insertErr) {
        console.error('Queue join insert error:', insertErr.message);
        return res.status(500).json(createErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Failed to join queue'));
      }

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

      const { data: ticket, error: ticketErr } = await supabase
        .from('queue_tickets')
        .select('*')
        .eq('session_token', sessionToken)
        .single();

      if (ticketErr || !ticket) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.TICKET_NOT_FOUND, 'Ticket not found'));
      }

      const waiting = await getWaitingTickets(ticket.clinic_id);
      const queueLength = waiting.length;

      return res.status(200).json(
        createSuccessResponse({
          ticketNumber: ticket.ticket_number,
          position: ticket.position,
          estimatedWaitMinutes: ticket.estimated_wait_minutes ?? 0,
          status: ticket.status,
          queueLength,
        }),
      );
    }

    // POST /api/v1/queue/postpone/:sessionToken
    match = pathname.match(/^\/api\/v1\/queue\/postpone\/([^/]+)$/);
    if (method === 'POST' && match) {
      const sessionToken = match[1];

      const { data: ticket, error: ticketErr } = await supabase
        .from('queue_tickets')
        .select('*')
        .eq('session_token', sessionToken)
        .single();

      if (ticketErr || !ticket) {
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
      const waiting = await getWaitingTickets(ticket.clinic_id);
      const currentIdx = waiting.findIndex((t) => t.session_token === sessionToken);

      if (currentIdx === -1) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.TICKET_NOT_FOUND, 'Ticket not in waiting list'));
      }

      const newIdx = Math.min(currentIdx + positionsBack, waiting.length - 1);

      // Move ticket in the array
      waiting.splice(currentIdx, 1);
      waiting.splice(newIdx, 0, ticket);

      // Update positions in DB
      for (let idx = 0; idx < waiting.length; idx++) {
        const t = waiting[idx];
        const newPosition = idx + 1;
        const newWait = Math.ceil((idx * DEFAULT_SERVICE_TIME_SECONDS) / 60);
        await supabase
          .from('queue_tickets')
          .update({ position: newPosition, estimated_wait_minutes: newWait })
          .eq('id', t.id);
      }

      // Re-fetch the ticket to get updated position
      const { data: updated } = await supabase
        .from('queue_tickets')
        .select('*')
        .eq('session_token', sessionToken)
        .single();

      return res.status(200).json(
        createSuccessResponse({
          ticketNumber: updated.ticket_number,
          position: updated.position,
          estimatedWaitMinutes: updated.estimated_wait_minutes ?? 0,
          status: updated.status,
        }),
      );
    }

    // DELETE /api/v1/queue/leave/:sessionToken
    match = pathname.match(/^\/api\/v1\/queue\/leave\/([^/]+)$/);
    if (method === 'DELETE' && match) {
      const sessionToken = match[1];

      const { data: ticket, error: ticketErr } = await supabase
        .from('queue_tickets')
        .select('*')
        .eq('session_token', sessionToken)
        .single();

      if (ticketErr || !ticket) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.TICKET_NOT_FOUND, 'Ticket not found'));
      }

      const now = new Date().toISOString();
      await supabase
        .from('queue_tickets')
        .update({ status: 'cancelled', completed_at: now })
        .eq('session_token', sessionToken);

      await recalcPositions(ticket.clinic_id);

      return res.status(200).json(createSuccessResponse({ message: 'Left queue', ticketNumber: ticket.ticket_number }));
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

      const clinicId = await getStaffClinicId(ctx.staffId);
      if (!clinicId) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Staff clinic not found'));
      }

      const room = await assignStaffToRoom(ctx.staffId);
      if (!room) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No available room'));
      }

      if (room.current_ticket_id) {
        return res.status(409).json(createErrorResponse(ERROR_CODES.ROOM_NOT_AVAILABLE, 'Room already has a patient'));
      }

      const waiting = await getWaitingTickets(clinicId);
      if (waiting.length === 0) {
        return res.status(200).json(createSuccessResponse({ message: 'No patients waiting', roomName: room.name }));
      }

      const nextTicket = waiting[0];
      const now = new Date().toISOString();

      await supabase
        .from('queue_tickets')
        .update({
          status: 'called',
          assigned_room_id: room.id,
          called_at: now,
        })
        .eq('id', nextTicket.id);

      await supabase
        .from('rooms')
        .update({
          current_ticket_id: nextTicket.id,
          status: 'occupied',
        })
        .eq('id', room.id);

      await recalcPositions(clinicId);

      return res.status(200).json(
        createSuccessResponse({
          ticketNumber: nextTicket.ticket_number,
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

      const clinicId = await getStaffClinicId(ctx.staffId);
      const room = await findRoomForStaff(ctx.staffId);
      if (!room || !room.current_ticket_id) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No active patient in room'));
      }

      const now = new Date().toISOString();
      await supabase
        .from('queue_tickets')
        .update({ status: 'completed', completed_at: now })
        .eq('id', room.current_ticket_id);

      await supabase
        .from('rooms')
        .update({ current_ticket_id: null, status: 'open' })
        .eq('id', room.id);

      if (clinicId) {
        await recalcPositions(clinicId);
      }

      return res.status(200).json(createSuccessResponse({ message: 'Patient completed', roomName: room.name }));
    }

    // POST /api/v1/staff/no-show
    if (method === 'POST' && pathname === '/api/v1/staff/no-show') {
      const ctx = getStaffContext(req);
      if (!ctx) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Unauthorized'));
      }

      const clinicId = await getStaffClinicId(ctx.staffId);
      const room = await findRoomForStaff(ctx.staffId);
      if (!room || !room.current_ticket_id) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No active patient in room'));
      }

      const now = new Date().toISOString();
      await supabase
        .from('queue_tickets')
        .update({ status: 'no_show', completed_at: now })
        .eq('id', room.current_ticket_id);

      await supabase
        .from('rooms')
        .update({ current_ticket_id: null, status: 'open' })
        .eq('id', room.id);

      if (clinicId) {
        await recalcPositions(clinicId);
      }

      return res.status(200).json(createSuccessResponse({ message: 'Patient marked no-show', roomName: room.name }));
    }

    // POST /api/v1/staff/pause
    if (method === 'POST' && pathname === '/api/v1/staff/pause') {
      const ctx = getStaffContext(req);
      if (!ctx) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Unauthorized'));
      }

      const room = await findRoomForStaff(ctx.staffId);
      if (!room) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No room assigned'));
      }

      await supabase
        .from('rooms')
        .update({ status: 'paused' })
        .eq('id', room.id);

      return res.status(200).json(createSuccessResponse({ message: 'Room paused', roomName: room.name, status: 'paused' }));
    }

    // POST /api/v1/staff/resume
    if (method === 'POST' && pathname === '/api/v1/staff/resume') {
      const ctx = getStaffContext(req);
      if (!ctx) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Unauthorized'));
      }

      const room = await findRoomForStaff(ctx.staffId);
      if (!room) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No room assigned'));
      }

      const newStatus = room.current_ticket_id ? 'occupied' : 'open';
      await supabase
        .from('rooms')
        .update({ status: newStatus })
        .eq('id', room.id);

      return res.status(200).json(createSuccessResponse({ message: 'Room resumed', roomName: room.name, status: newStatus }));
    }

    // GET /api/v1/staff/room/status
    if (method === 'GET' && pathname === '/api/v1/staff/room/status') {
      const ctx = getStaffContext(req);
      if (!ctx) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Unauthorized'));
      }

      const clinicId = await getStaffClinicId(ctx.staffId);
      const room = await findRoomForStaff(ctx.staffId);
      if (!room) {
        return res.status(200).json(createSuccessResponse({ assigned: false, room: null, currentTicket: null }));
      }

      let currentTicket = null;
      if (room.current_ticket_id) {
        const { data: ticket } = await supabase
          .from('queue_tickets')
          .select('ticket_number, status, called_at')
          .eq('id', room.current_ticket_id)
          .single();

        if (ticket) {
          currentTicket = {
            ticketNumber: ticket.ticket_number,
            status: ticket.status,
            calledAt: ticket.called_at,
          };
        }
      }

      const waiting = clinicId ? await getWaitingTickets(clinicId) : [];
      const waitingCount = waiting.length;

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
      // Get clinic ID from query or use first clinic
      const queryParams = getQueryParams(url);
      let clinicId = queryParams.clinicId;

      if (!clinicId) {
        const { data: firstClinic } = await supabase
          .from('clinics')
          .select('id')
          .eq('is_active', true)
          .limit(1)
          .single();
        clinicId = firstClinic ? firstClinic.id : null;
      }

      if (!clinicId) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.CLINIC_NOT_FOUND, 'No clinic found'));
      }

      const waiting = await getWaitingTickets(clinicId);

      const { data: allTickets } = await supabase
        .from('queue_tickets')
        .select('status')
        .eq('clinic_id', clinicId);

      const { data: roomList } = await supabase
        .from('rooms')
        .select('*')
        .eq('clinic_id', clinicId);

      const tickets = allTickets || [];
      const roomArr = roomList || [];

      const completed = tickets.filter((t) => t.status === 'completed').length;
      const noShows = tickets.filter((t) => t.status === 'no_show').length;
      const activeRooms = roomArr.filter((r) => r.is_active && r.status !== 'closed').length;
      const occupiedRooms = roomArr.filter((r) => r.status === 'occupied').length;

      return res.status(200).json(
        createSuccessResponse({
          clinicId,
          queueLength: waiting.length,
          completedToday: completed,
          noShowsToday: noShows,
          totalRooms: roomArr.length,
          activeRooms,
          occupiedRooms,
          averageWaitMinutes: waiting.length > 0 ? Math.round(waiting.reduce((sum, t) => sum + (t.estimated_wait_minutes ?? 0), 0) / waiting.length) : 0,
        }),
      );
    }

    // GET /api/v1/admin/queue
    if (method === 'GET' && pathname === '/api/v1/admin/queue') {
      const queryParams = getQueryParams(url);
      let clinicId = queryParams.clinicId;

      if (!clinicId) {
        const { data: firstClinic } = await supabase
          .from('clinics')
          .select('id')
          .eq('is_active', true)
          .limit(1)
          .single();
        clinicId = firstClinic ? firstClinic.id : null;
      }

      const { data: allTickets } = await supabase
        .from('queue_tickets')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('position', { ascending: true });

      return res.status(200).json(
        createSuccessResponse(
          (allTickets || []).map((t) => ({
            id: t.id,
            ticketNumber: t.ticket_number,
            status: t.status,
            position: t.position,
            estimatedWaitMinutes: t.estimated_wait_minutes,
            assignedRoomId: t.assigned_room_id,
            joinedAt: t.joined_at,
            calledAt: t.called_at,
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

      // Get organization_id from clinic
      const { data: clinic } = await supabase
        .from('clinics')
        .select('organization_id')
        .eq('id', clinicId)
        .single();

      const { data: room, error: insertErr } = await supabase
        .from('rooms')
        .insert({
          organization_id: clinic ? clinic.organization_id : null,
          clinic_id: clinicId,
          name,
          display_order: displayOrder,
          status: 'open',
          current_staff_id: null,
          current_ticket_id: null,
          is_active: true,
        })
        .select()
        .single();

      if (insertErr) {
        console.error('Room insert error:', insertErr.message);
        return res.status(500).json(createErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Failed to create room'));
      }

      await addAuditEntry('room.created', 'room', room.id, null, room.organization_id, clinicId);

      return res.status(201).json(createSuccessResponse(room));
    }

    // GET /api/v1/admin/rooms
    if (method === 'GET' && pathname === '/api/v1/admin/rooms') {
      const queryParams = getQueryParams(url);
      let clinicId = queryParams.clinicId;

      if (!clinicId) {
        const { data: firstClinic } = await supabase
          .from('clinics')
          .select('id')
          .eq('is_active', true)
          .limit(1)
          .single();
        clinicId = firstClinic ? firstClinic.id : null;
      }

      const { data: roomList } = await supabase
        .from('rooms')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('display_order', { ascending: true });

      return res.status(200).json(createSuccessResponse(roomList || []));
    }

    // PUT /api/v1/admin/rooms/:roomId
    match = pathname.match(/^\/api\/v1\/admin\/rooms\/([^/]+)$/);
    if (method === 'PUT' && match) {
      const roomId = match[1];

      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (roomErr || !room) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Room not found'));
      }

      const body = await parseBody(req);
      const parsed = updateRoomSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()));
      }

      const updates = parsed.data;
      const dbUpdates = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.displayOrder !== undefined) dbUpdates.display_order = updates.displayOrder;
      if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

      const { data: updated, error: updateErr } = await supabase
        .from('rooms')
        .update(dbUpdates)
        .eq('id', roomId)
        .select()
        .single();

      if (updateErr) {
        return res.status(500).json(createErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Failed to update room'));
      }

      await addAuditEntry('room.updated', 'room', roomId, null, room.organization_id, room.clinic_id);

      return res.status(200).json(createSuccessResponse(updated));
    }

    // DELETE /api/v1/admin/rooms/:roomId
    match = pathname.match(/^\/api\/v1\/admin\/rooms\/([^/]+)$/);
    if (method === 'DELETE' && match) {
      const roomId = match[1];

      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (roomErr || !room) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Room not found'));
      }

      await supabase.from('rooms').delete().eq('id', roomId);
      await addAuditEntry('room.deleted', 'room', roomId, null, room.organization_id, room.clinic_id);

      return res.status(200).json(createSuccessResponse({ message: 'Room deleted' }));
    }

    // GET /api/v1/admin/staff
    if (method === 'GET' && pathname === '/api/v1/admin/staff') {
      const queryParams = getQueryParams(url);
      let clinicId = queryParams.clinicId;

      if (!clinicId) {
        const { data: firstClinic } = await supabase
          .from('clinics')
          .select('id')
          .eq('is_active', true)
          .limit(1)
          .single();
        clinicId = firstClinic ? firstClinic.id : null;
      }

      const { data: staffList } = await supabase
        .from('users')
        .select('id, organization_id, clinic_id, email, display_name, role, preferred_language, is_active, last_login_at')
        .eq('clinic_id', clinicId);

      return res.status(200).json(createSuccessResponse(staffList || []));
    }

    // POST /api/v1/admin/staff
    if (method === 'POST' && pathname === '/api/v1/admin/staff') {
      const body = await parseBody(req);
      const parsed = createUserSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()));
      }

      const { organizationId, clinicId, email, password, displayName, role, preferredLanguage } = parsed.data;
      const passwordHash = await bcrypt.hash(password, 10);

      const { data: staff, error: insertErr } = await supabase
        .from('users')
        .insert({
          organization_id: organizationId,
          clinic_id: clinicId ?? null,
          email,
          password_hash: passwordHash,
          display_name: displayName,
          role,
          preferred_language: preferredLanguage,
          is_active: true,
        })
        .select('id, organization_id, clinic_id, email, display_name, role, preferred_language, is_active')
        .single();

      if (insertErr) {
        console.error('Staff insert error:', insertErr.message);
        return res.status(500).json(createErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Failed to create staff member'));
      }

      await addAuditEntry('staff.created', 'user', staff.id, null, organizationId, clinicId);

      return res.status(201).json(createSuccessResponse(staff));
    }

    // PUT /api/v1/admin/staff/:userId
    match = pathname.match(/^\/api\/v1\/admin\/staff\/([^/]+)$/);
    if (method === 'PUT' && match) {
      const userId = match[1];

      const { data: staff, error: staffErr } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (staffErr || !staff) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Staff member not found'));
      }

      const body = await parseBody(req);
      const parsed = updateUserSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()));
      }

      const updates = parsed.data;
      const dbUpdates = {};
      if (updates.email !== undefined) dbUpdates.email = updates.email;
      if (updates.displayName !== undefined) dbUpdates.display_name = updates.displayName;
      if (updates.role !== undefined) dbUpdates.role = updates.role;
      if (updates.preferredLanguage !== undefined) dbUpdates.preferred_language = updates.preferredLanguage;
      if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

      const { data: updated, error: updateErr } = await supabase
        .from('users')
        .update(dbUpdates)
        .eq('id', userId)
        .select('id, organization_id, clinic_id, email, display_name, role, preferred_language, is_active')
        .single();

      if (updateErr) {
        return res.status(500).json(createErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Failed to update staff member'));
      }

      await addAuditEntry('staff.updated', 'user', userId, null, staff.organization_id, staff.clinic_id);

      return res.status(200).json(createSuccessResponse(updated));
    }

    // DELETE /api/v1/admin/staff/:userId
    match = pathname.match(/^\/api\/v1\/admin\/staff\/([^/]+)$/);
    if (method === 'DELETE' && match) {
      const userId = match[1];

      const { data: staff, error: staffErr } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (staffErr || !staff) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Staff member not found'));
      }

      await supabase
        .from('users')
        .update({ is_active: false })
        .eq('id', userId);

      await addAuditEntry('staff.deactivated', 'user', userId, null, staff.organization_id, staff.clinic_id);

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

      let clinicId = queryParams.clinicId;
      if (!clinicId) {
        const { data: firstClinic } = await supabase
          .from('clinics')
          .select('id')
          .eq('is_active', true)
          .limit(1)
          .single();
        clinicId = firstClinic ? firstClinic.id : null;
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      // Get total count
      const { count: total } = await supabase
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId);

      const { data: paginated } = await supabase
        .from('audit_log')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('timestamp', { ascending: false })
        .range(from, to);

      const totalCount = total || 0;
      const totalPages = Math.ceil(totalCount / pageSize);

      return res.status(200).json(
        createSuccessResponse(paginated || [], {
          pagination: { page, pageSize, total: totalCount, totalPages },
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

      const { data: clinic, error: clinicErr } = await supabase
        .from('clinics')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (clinicErr || !clinic) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.CLINIC_NOT_FOUND, 'Clinic not found'));
      }

      const waiting = await getWaitingTickets(clinic.id);

      const { data: roomList } = await supabase
        .from('rooms')
        .select('*')
        .eq('clinic_id', clinic.id)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      const roomArr = roomList || [];

      // Get called/in_progress tickets
      const { data: calledTicketsRaw } = await supabase
        .from('queue_tickets')
        .select('ticket_number, assigned_room_id, status')
        .eq('clinic_id', clinic.id)
        .in('status', ['called', 'in_progress']);

      const calledTickets = (calledTicketsRaw || []).map((t) => ({
        ticketNumber: t.ticket_number,
        roomName: roomArr.find((r) => r.id === t.assigned_room_id)?.name ?? null,
        status: t.status,
      }));

      return res.status(200).json(
        createSuccessResponse({
          clinicName: clinic.name,
          clinicSlug: clinic.slug,
          queueLength: waiting.length,
          rooms: roomArr.map((r) => ({
            name: r.name,
            status: r.status,
            displayOrder: r.display_order,
          })),
          calledTickets,
          nextTicketNumbers: waiting.slice(0, 5).map((t) => t.ticket_number),
        }),
      );
    }

    // GET /api/v1/clinic/:clinicSlug/info
    match = pathname.match(/^\/api\/v1\/clinic\/([^/]+)\/info$/);
    if (method === 'GET' && match) {
      const slug = match[1];

      const { data: clinic, error: clinicErr } = await supabase
        .from('clinics')
        .select('*')
        .eq('slug', slug)
        .single();

      if (clinicErr || !clinic) {
        return res.status(404).json(createErrorResponse(ERROR_CODES.CLINIC_NOT_FOUND, 'Clinic not found'));
      }

      return res.status(200).json(
        createSuccessResponse({
          id: clinic.id,
          name: clinic.name,
          slug: clinic.slug,
          address: clinic.address,
          timezone: clinic.timezone,
          defaultLanguage: clinic.default_language,
          isActive: clinic.is_active,
        }),
      );
    }

    // =====================================================================
    // SYSTEM ROUTES — /api/v1/system/*
    // =====================================================================

    // POST /api/v1/system/auth/login — SuperAdmin login
    if (method === 'POST' && pathname === '/api/v1/system/auth/login') {
      const body = await parseBody(req);
      const parsed = superAdminLoginSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()));
      }

      const { email, password, totpCode } = parsed.data;

      const { data: admin, error: adminErr } = await supabase
        .from('superadmins')
        .select('*')
        .eq('email', email)
        .eq('is_active', true)
        .single();

      if (adminErr || !admin) {
        return res.status(401).json(createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials'));
      }

      const validPassword = await bcrypt.compare(password, admin.password_hash);
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
      const { data: orgList } = await supabase
        .from('organizations')
        .select('*');

      return res.status(200).json(createSuccessResponse(orgList || []));
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
    console.error('Handler error:', err);
    return res.status(500).json(createErrorResponse(ERROR_CODES.INTERNAL_ERROR, err.message));
  }
};
