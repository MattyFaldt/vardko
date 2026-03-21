// ==========================================================================
// VardKo Queue API — Single-file Vercel Serverless Function (CommonJS)
// Plain Node.js handler with manual routing (no frameworks).
// Uses Supabase PostgreSQL for persistence.
// ==========================================================================

// ===== SECTION 1: IMPORTS & CONFIG =====

const { SignJWT, jwtVerify } = require('jose');
const { z } = require('zod');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const randomBytes = crypto.randomBytes;

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://etykcnatammfevtdyqob.supabase.co',
  process.env.SUPABASE_ANON_KEY || ''
);

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
  CONFLICT: 'CONFLICT',
};

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

const TICKET_STATUSES = ['waiting', 'called', 'in_progress', 'completed', 'no_show', 'cancelled'];
const ROOM_STATUSES = ['open', 'occupied', 'paused', 'closed'];

const DEFAULT_MAX_POSTPONEMENTS = 3;
const DEFAULT_SERVICE_TIME_SECONDS = 480;
const MAX_QUEUE_SIZE = 200;

const SUPPORTED_LANGUAGES = ['sv', 'no', 'da', 'fi', 'en', 'de', 'es', 'fr', 'it'];
const USER_ROLES = ['org_admin', 'clinic_admin', 'staff'];

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-change-in-production-minimum-32-chars!',
);

// ===== SECTION 2: VALIDATORS (Zod schemas) =====

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
  status: z.enum(['open', 'closed', 'paused', 'occupied']).optional(),
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

const setupSchema = z.object({
  organizationName: z.string().min(1).max(255),
  clinicName: z.string().min(1).max(255),
  clinicSlug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  adminEmail: z.string().email().max(255),
  adminPassword: passwordSchema,
  adminDisplayName: z.string().min(1).max(255),
});

// ===== SECTION 3: HELPERS =====

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

function mapRoom(r, staffLookup) {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    staffName: staffLookup?.[r.current_staff_id] || null,
    currentTicketNumber: r.current_ticket_number || null,
    isActive: r.is_active,
    displayOrder: r.display_order,
  };
}

function mapStaff(s, roomLookup) {
  return {
    id: s.id,
    displayName: s.display_name,
    email: s.email,
    role: s.role,
    isActive: s.is_active,
    assignedRoomId: roomLookup?.[s.id] || null,
  };
}

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

function generateSessionToken() {
  return randomBytes(64).toString('hex');
}

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

async function resolveClinicId(queryClinicId, authClinicId) {
  if (queryClinicId) return queryClinicId;
  if (authClinicId) return authClinicId;
  const { data: firstClinic } = await supabase
    .from('clinics')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single();
  return firstClinic ? firstClinic.id : null;
}

// ===== SECTION 4: AUTH MIDDLEWARE =====

async function verifyJwt(req) {
  const auth = req.headers['authorization'] || req.headers['Authorization'] || '';
  if (!auth.startsWith('Bearer ')) return null;
  try {
    const { payload } = await jwtVerify(auth.slice(7), JWT_SECRET);
    return payload;
  } catch (_e) { return null; }
}

function requireAuth(authPayload, allowedRoles) {
  if (!authPayload) return { statusCode: 401, response: createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Authentication required') };
  if (allowedRoles && !allowedRoles.includes(authPayload.role)) return { statusCode: 403, response: createErrorResponse(ERROR_CODES.FORBIDDEN, 'Insufficient permissions') };
  return null;
}

// ===== SECTION 5: SERVICES =====

// ----- 5a: Auth services -----

async function serviceLogin(body) {
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return { statusCode: 400, response: createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()) };
  }

  const { email, password } = parsed.data;

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
    const { data: superUser } = await supabase
      .from('superadmins')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .eq('is_active', true)
      .single();
    if (superUser) {
      user = { ...superUser, role: 'superadmin', organization_id: null, clinic_id: null, display_name: superUser.display_name || superUser.email };
      isSuperAdmin = true;
    }
  }

  if (!user) {
    return { statusCode: 401, response: createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password') };
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return { statusCode: 401, response: createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password') };
  }

  if (!isSuperAdmin) {
    await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);
  }

  const accessToken = await createAccessToken(user);
  const refreshToken = await createRefreshTokenJWT(user);

  return {
    statusCode: 200,
    response: createSuccessResponse({
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
  };
}

async function serviceRefresh(body) {
  const parsed = refreshTokenSchema.safeParse(body);
  if (!parsed.success) {
    return { statusCode: 400, response: createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()) };
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
      return { statusCode: 401, response: createErrorResponse(ERROR_CODES.INVALID_TOKEN, 'User not found') };
    }

    const newAccessToken = await createAccessToken(user);
    const newRefreshToken = await createRefreshTokenJWT(user);

    return {
      statusCode: 200,
      response: createSuccessResponse({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      }),
    };
  } catch (_err) {
    return { statusCode: 401, response: createErrorResponse(ERROR_CODES.TOKEN_EXPIRED, 'Refresh token expired') };
  }
}

function serviceLogout() {
  return { statusCode: 200, response: createSuccessResponse({ message: 'Logged out' }) };
}

// ----- 5b: Queue services -----

async function serviceJoinQueue(body) {
  const parsed = joinQueueSchema.safeParse(body);
  if (!parsed.success) {
    return { statusCode: 400, response: createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()) };
  }

  const { clinicId, anonymousHash, language } = parsed.data;

  const { data: existing } = await supabase
    .from('queue_tickets')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('anonymous_hash', anonymousHash)
    .eq('status', 'waiting')
    .limit(1);

  if (existing && existing.length > 0) {
    return { statusCode: 409, response: createErrorResponse(ERROR_CODES.ALREADY_IN_QUEUE, 'Already in queue') };
  }

  const waiting = await getWaitingTickets(clinicId);
  const currentSize = waiting.length;
  if (currentSize >= MAX_QUEUE_SIZE) {
    return { statusCode: 503, response: createErrorResponse(ERROR_CODES.QUEUE_FULL, 'Queue is full') };
  }

  const { data: maxResult } = await supabase.rpc('get_next_ticket_number', { p_clinic_id: clinicId });
  let ticketNumber;
  if (maxResult !== null && maxResult !== undefined) {
    ticketNumber = maxResult;
  } else {
    const { data: maxRow } = await supabase
      .from('queue_tickets')
      .select('ticket_number')
      .eq('clinic_id', clinicId)
      .order('ticket_number', { ascending: false })
      .limit(1);
    ticketNumber = (maxRow && maxRow.length > 0) ? maxRow[0].ticket_number + 1 : 1;
  }

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
    return { statusCode: 500, response: createErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Failed to join queue') };
  }

  return {
    statusCode: 201,
    response: createSuccessResponse({
      sessionToken,
      ticketNumber,
      position,
      estimatedWaitMinutes,
    }),
  };
}

async function serviceGetQueueStatus(sessionToken) {
  const { data: ticket, error: ticketErr } = await supabase
    .from('queue_tickets')
    .select('*')
    .eq('session_token', sessionToken)
    .single();

  if (ticketErr || !ticket) {
    return { statusCode: 404, response: createErrorResponse(ERROR_CODES.TICKET_NOT_FOUND, 'Ticket not found') };
  }

  const waiting = await getWaitingTickets(ticket.clinic_id);
  const queueLength = waiting.length;

  return {
    statusCode: 200,
    response: createSuccessResponse({
      ticketNumber: ticket.ticket_number,
      position: ticket.position,
      estimatedWaitMinutes: ticket.estimated_wait_minutes ?? 0,
      status: ticket.status,
      queueLength,
    }),
  };
}

async function servicePostpone(sessionToken, body) {
  const { data: ticket, error: ticketErr } = await supabase
    .from('queue_tickets')
    .select('*')
    .eq('session_token', sessionToken)
    .single();

  if (ticketErr || !ticket) {
    return { statusCode: 404, response: createErrorResponse(ERROR_CODES.TICKET_NOT_FOUND, 'Ticket not found') };
  }

  if (ticket.status !== 'waiting') {
    return { statusCode: 400, response: createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Ticket is not in waiting state') };
  }

  const parsed = postponeSchema.safeParse(body);
  if (!parsed.success) {
    return { statusCode: 400, response: createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()) };
  }

  const { positionsBack } = parsed.data;
  const waiting = await getWaitingTickets(ticket.clinic_id);
  const currentIdx = waiting.findIndex((t) => t.session_token === sessionToken);

  if (currentIdx === -1) {
    return { statusCode: 404, response: createErrorResponse(ERROR_CODES.TICKET_NOT_FOUND, 'Ticket not in waiting list') };
  }

  const newIdx = Math.min(currentIdx + positionsBack, waiting.length - 1);

  waiting.splice(currentIdx, 1);
  waiting.splice(newIdx, 0, ticket);

  for (let idx = 0; idx < waiting.length; idx++) {
    const t = waiting[idx];
    const newPosition = idx + 1;
    const newWait = Math.ceil((idx * DEFAULT_SERVICE_TIME_SECONDS) / 60);
    await supabase
      .from('queue_tickets')
      .update({ position: newPosition, estimated_wait_minutes: newWait })
      .eq('id', t.id);
  }

  const { data: updated } = await supabase
    .from('queue_tickets')
    .select('*')
    .eq('session_token', sessionToken)
    .single();

  return {
    statusCode: 200,
    response: createSuccessResponse({
      ticketNumber: updated.ticket_number,
      position: updated.position,
      estimatedWaitMinutes: updated.estimated_wait_minutes ?? 0,
      status: updated.status,
    }),
  };
}

async function serviceLeaveQueue(sessionToken) {
  const { data: ticket, error: ticketErr } = await supabase
    .from('queue_tickets')
    .select('*')
    .eq('session_token', sessionToken)
    .single();

  if (ticketErr || !ticket) {
    return { statusCode: 404, response: createErrorResponse(ERROR_CODES.TICKET_NOT_FOUND, 'Ticket not found') };
  }

  const now = new Date().toISOString();
  await supabase
    .from('queue_tickets')
    .update({ status: 'cancelled', completed_at: now })
    .eq('session_token', sessionToken);

  await recalcPositions(ticket.clinic_id);

  return { statusCode: 200, response: createSuccessResponse({ message: 'Left queue', ticketNumber: ticket.ticket_number }) };
}

// ----- 5c: Room services -----

async function serviceListRooms(clinicId) {
  clinicId = await resolveClinicId(clinicId);

  const { data: roomList } = await supabase
    .from('rooms')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('display_order', { ascending: true });

  const rooms = roomList || [];

  const staffIds = rooms.map((r) => r.current_staff_id).filter(Boolean);
  const staffLookup = {};
  if (staffIds.length > 0) {
    const { data: staffUsers } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', staffIds);
    for (const u of staffUsers || []) {
      staffLookup[u.id] = u.display_name;
    }
  }

  const ticketIds = rooms.map((r) => r.current_ticket_id).filter(Boolean);
  const ticketLookup = {};
  if (ticketIds.length > 0) {
    const { data: tickets } = await supabase
      .from('queue_tickets')
      .select('id, ticket_number')
      .in('id', ticketIds);
    for (const t of tickets || []) {
      ticketLookup[t.id] = t.ticket_number;
    }
  }

  const mappedRooms = rooms.map((r) => ({
    ...mapRoom(r, staffLookup),
    currentTicketNumber: ticketLookup[r.current_ticket_id] || null,
  }));

  return { statusCode: 200, response: createSuccessResponse(mappedRooms) };
}

async function serviceAddRoom(body) {
  const parsed = createRoomSchema.safeParse(body);
  if (!parsed.success) {
    return { statusCode: 400, response: createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()) };
  }

  const { clinicId, name, displayOrder } = parsed.data;

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
    return { statusCode: 500, response: createErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Failed to create room') };
  }

  await serviceAudit('room.created', 'room', room.id, null, room.organization_id, clinicId);

  return { statusCode: 201, response: createSuccessResponse(mapRoom(room, {})) };
}

async function serviceUpdateRoom(roomId, body) {
  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (roomErr || !room) {
    return { statusCode: 404, response: createErrorResponse(ERROR_CODES.NOT_FOUND, 'Room not found') };
  }

  const parsed = updateRoomSchema.safeParse(body);
  if (!parsed.success) {
    return { statusCode: 400, response: createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()) };
  }

  const updates = parsed.data;
  const dbUpdates = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.displayOrder !== undefined) dbUpdates.display_order = updates.displayOrder;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
  if (updates.status !== undefined) dbUpdates.status = updates.status;

  const { data: updated, error: updateErr } = await supabase
    .from('rooms')
    .update(dbUpdates)
    .eq('id', roomId)
    .select()
    .single();

  if (updateErr) {
    return { statusCode: 500, response: createErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Failed to update room') };
  }

  await serviceAudit('room.updated', 'room', roomId, null, room.organization_id, room.clinic_id);

  let staffName = null;
  if (updated.current_staff_id) {
    const { data: staffUser } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', updated.current_staff_id)
      .single();
    staffName = staffUser ? staffUser.display_name : null;
  }

  return { statusCode: 200, response: createSuccessResponse(mapRoom(updated, { [updated.current_staff_id]: staffName })) };
}

async function serviceDeleteRoom(roomId) {
  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (roomErr || !room) {
    return { statusCode: 404, response: createErrorResponse(ERROR_CODES.NOT_FOUND, 'Room not found') };
  }

  await supabase.from('rooms').delete().eq('id', roomId);
  await serviceAudit('room.deleted', 'room', roomId, null, room.organization_id, room.clinic_id);

  return { statusCode: 200, response: createSuccessResponse({ message: 'Room deleted' }) };
}

async function serviceAssignStaffToRoom(roomId, body) {
  const staffId = body.staffId || null;

  await supabase.from('rooms').update({ current_staff_id: null }).eq('current_staff_id', staffId);
  await supabase.from('rooms').update({ current_staff_id: staffId }).eq('id', roomId);
  await serviceAudit('room.staff_assigned', 'room', roomId);

  return { statusCode: 200, response: createSuccessResponse({ roomId, staffId }) };
}

// ----- 5d: Staff services -----

async function serviceListStaff(clinicId) {
  clinicId = await resolveClinicId(clinicId);

  const { data: staffList } = await supabase
    .from('users')
    .select('id, organization_id, clinic_id, email, display_name, role, preferred_language, is_active, last_login_at')
    .eq('is_active', true)
    .or(clinicId ? `clinic_id.eq.${clinicId},clinic_id.is.null` : 'clinic_id.is.null');

  const staffArr = staffList || [];

  const staffIdsForRoomLookup = staffArr.map((s) => s.id);
  const roomLookup = {};
  if (staffIdsForRoomLookup.length > 0) {
    const { data: roomsWithStaff } = await supabase
      .from('rooms')
      .select('id, current_staff_id')
      .in('current_staff_id', staffIdsForRoomLookup);
    for (const r of roomsWithStaff || []) {
      roomLookup[r.current_staff_id] = r.id;
    }
  }

  return { statusCode: 200, response: createSuccessResponse(staffArr.map((s) => mapStaff(s, roomLookup))) };
}

async function serviceAddStaff(body) {
  const email = (body.email || '').trim().toLowerCase();
  const displayName = body.displayName || body.display_name || '';
  const role = body.role || 'staff';

  if (!email || !displayName) {
    return { statusCode: 400, response: createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Email and name are required') };
  }

  let organizationId = body.organizationId;
  let clinicId = body.clinicId;

  if (!organizationId || !clinicId) {
    const { data: firstClinic } = await supabase
      .from('clinics')
      .select('id, organization_id')
      .eq('is_active', true)
      .limit(1)
      .single();
    if (firstClinic) {
      organizationId = organizationId || firstClinic.organization_id;
      clinicId = clinicId || firstClinic.id;
    }
  }

  if (role === 'org_admin') clinicId = null;

  if (!organizationId) {
    return { statusCode: 400, response: createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Organization not found') };
  }

  const tempPassword = 'Temp' + Math.random().toString(36).slice(2, 10) + '1!';
  const passwordHash = await bcrypt.hash(body.password || tempPassword, 10);
  const preferredLanguage = body.preferredLanguage || 'sv';

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
    return { statusCode: 500, response: createErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Failed to create staff member') };
  }

  await serviceAudit('staff.created', 'user', staff.id, null, organizationId, clinicId);

  return { statusCode: 201, response: createSuccessResponse(mapStaff(staff, {})) };
}

async function serviceUpdateStaff(userId, body) {
  const { data: staff, error: staffErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (staffErr || !staff) {
    return { statusCode: 404, response: createErrorResponse(ERROR_CODES.NOT_FOUND, 'Staff member not found') };
  }

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return { statusCode: 400, response: createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()) };
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
    return { statusCode: 500, response: createErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Failed to update staff member') };
  }

  await serviceAudit('staff.updated', 'user', userId, null, staff.organization_id, staff.clinic_id);

  const { data: assignedRoom } = await supabase
    .from('rooms')
    .select('id')
    .eq('current_staff_id', userId)
    .limit(1)
    .maybeSingle();

  return { statusCode: 200, response: createSuccessResponse(mapStaff(updated, { [userId]: assignedRoom ? assignedRoom.id : null })) };
}

async function serviceDeleteStaff(userId) {
  const { data: staff, error: staffErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (staffErr || !staff) {
    return { statusCode: 404, response: createErrorResponse(ERROR_CODES.NOT_FOUND, 'Staff member not found') };
  }

  await supabase
    .from('users')
    .update({ is_active: false })
    .eq('id', userId);

  await serviceAudit('staff.deactivated', 'user', userId, null, staff.organization_id, staff.clinic_id);

  return { statusCode: 200, response: createSuccessResponse({ message: 'Staff member deactivated' }) };
}

async function serviceStaffReady(staffId) {
  const clinicId = await getStaffClinicId(staffId);
  if (!clinicId) {
    return { statusCode: 401, response: createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Staff clinic not found') };
  }

  const room = await assignStaffToRoom(staffId);
  if (!room) {
    return { statusCode: 404, response: createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No available room') };
  }

  if (room.current_ticket_id) {
    return { statusCode: 409, response: createErrorResponse(ERROR_CODES.ROOM_NOT_AVAILABLE, 'Room already has a patient') };
  }

  const waiting = await getWaitingTickets(clinicId);
  if (waiting.length === 0) {
    return { statusCode: 200, response: createSuccessResponse({ message: 'No patients waiting', roomName: room.name }) };
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

  return {
    statusCode: 200,
    response: createSuccessResponse({
      ticketNumber: nextTicket.ticket_number,
      roomName: room.name,
      roomId: room.id,
      status: 'called',
    }),
  };
}

async function serviceStaffComplete(staffId) {
  const clinicId = await getStaffClinicId(staffId);
  const room = await findRoomForStaff(staffId);
  if (!room || !room.current_ticket_id) {
    return { statusCode: 404, response: createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No active patient in room') };
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

  return { statusCode: 200, response: createSuccessResponse({ message: 'Patient completed', roomName: room.name }) };
}

async function serviceStaffNoShow(staffId) {
  const clinicId = await getStaffClinicId(staffId);
  const room = await findRoomForStaff(staffId);
  if (!room || !room.current_ticket_id) {
    return { statusCode: 404, response: createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No active patient in room') };
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

  return { statusCode: 200, response: createSuccessResponse({ message: 'Patient marked no-show', roomName: room.name }) };
}

async function serviceStaffPause(staffId) {
  const room = await findRoomForStaff(staffId);
  if (!room) {
    return { statusCode: 404, response: createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No room assigned') };
  }

  await supabase
    .from('rooms')
    .update({ status: 'paused' })
    .eq('id', room.id);

  return { statusCode: 200, response: createSuccessResponse({ message: 'Room paused', roomName: room.name, status: 'paused' }) };
}

async function serviceStaffResume(staffId) {
  const room = await findRoomForStaff(staffId);
  if (!room) {
    return { statusCode: 404, response: createErrorResponse(ERROR_CODES.NO_ACTIVE_ROOM, 'No room assigned') };
  }

  const newStatus = room.current_ticket_id ? 'occupied' : 'open';
  await supabase
    .from('rooms')
    .update({ status: newStatus })
    .eq('id', room.id);

  return { statusCode: 200, response: createSuccessResponse({ message: 'Room resumed', roomName: room.name, status: newStatus }) };
}

async function serviceStaffRoomStatus(staffId) {
  const clinicId = await getStaffClinicId(staffId);
  const room = await findRoomForStaff(staffId);
  if (!room) {
    return { statusCode: 200, response: createSuccessResponse({ assigned: false, room: null, currentTicket: null }) };
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

  return {
    statusCode: 200,
    response: createSuccessResponse({
      assigned: true,
      room: {
        id: room.id,
        name: room.name,
        status: room.status,
      },
      currentTicket,
      waitingCount,
    }),
  };
}

// ----- 5e: Dashboard services -----

async function serviceGetDashboard(clinicId) {
  clinicId = await resolveClinicId(clinicId);

  if (!clinicId) {
    return { statusCode: 404, response: createErrorResponse(ERROR_CODES.CLINIC_NOT_FOUND, 'No clinic found') };
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

  const avgWait = waiting.length > 0 ? Math.round(waiting.reduce((sum, t) => sum + (t.estimated_wait_minutes ?? 0), 0) / waiting.length) : 0;

  return {
    statusCode: 200,
    response: createSuccessResponse({
      clinicId,
      waitingCount: waiting.length,
      activeRooms,
      avgWaitMinutes: avgWait,
      patientsToday: tickets.length,
      completedToday: completed,
      noShowsToday: noShows,
      avgServiceTimeMinutes: Math.round(DEFAULT_SERVICE_TIME_SECONDS / 60),
      queueLength: waiting.length,
      totalRooms: roomArr.length,
      occupiedRooms,
      averageWaitMinutes: avgWait,
    }),
  };
}

async function serviceGetAdminQueue(clinicId) {
  clinicId = await resolveClinicId(clinicId);

  const { data: allTickets } = await supabase
    .from('queue_tickets')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('position', { ascending: true });

  return {
    statusCode: 200,
    response: createSuccessResponse(
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
  };
}

// ----- 5f: Settings & Branding services -----

async function serviceGetSettings(clinicId) {
  const query = clinicId
    ? supabase.from('clinics').select('id, settings, default_language, timezone, qr_code_secret').eq('id', clinicId).single()
    : supabase.from('clinics').select('id, settings, default_language, timezone, qr_code_secret').eq('is_active', true).limit(1).single();

  const { data: clinic } = await query;
  if (!clinic) return { statusCode: 404, response: createErrorResponse(ERROR_CODES.NOT_FOUND, 'Clinic not found') };

  const settings = clinic.settings || {};
  return {
    statusCode: 200,
    response: createSuccessResponse({
      maxPostponements: settings.maxPostponements || 3,
      maxQueueSize: settings.maxQueueSize || 200,
      noShowTimeoutSeconds: settings.noShowTimeoutSeconds || 180,
      openHour: settings.openHour || 7,
      closeHour: settings.closeHour || 17,
      language: clinic.default_language || 'sv',
      qrToken: settings.qrToken || clinic.id,
    }),
  };
}

async function serviceUpdateSettings(body, clinicId) {
  const query = clinicId
    ? supabase.from('clinics').select('id, settings').eq('id', clinicId).single()
    : supabase.from('clinics').select('id, settings').eq('is_active', true).limit(1).single();

  const { data: clinic } = await query;
  if (!clinic) return { statusCode: 404, response: createErrorResponse(ERROR_CODES.NOT_FOUND, 'Clinic not found') };

  const currentSettings = clinic.settings || {};
  const newSettings = { ...currentSettings, ...body };

  await supabase.from('clinics').update({ settings: newSettings }).eq('id', clinic.id);
  await serviceAudit('settings.updated', 'clinic', clinic.id);

  return { statusCode: 200, response: createSuccessResponse(newSettings) };
}

async function serviceGetBranding(clinicId) {
  const query = clinicId
    ? supabase.from('clinics').select('id, settings, name').eq('id', clinicId).single()
    : supabase.from('clinics').select('id, settings, name').eq('is_active', true).limit(1).single();

  const { data: clinic } = await query;
  if (!clinic) return { statusCode: 404, response: createErrorResponse(ERROR_CODES.NOT_FOUND, 'Clinic not found') };

  const branding = (clinic.settings || {}).branding || {};
  return {
    statusCode: 200,
    response: createSuccessResponse({
      primaryColor: branding.primaryColor || '#2563eb',
      secondaryColor: branding.secondaryColor || '#16a34a',
      accentColor: branding.accentColor || '#f59e0b',
      logoUrl: branding.logoUrl || null,
      clinicName: branding.clinicName || clinic.name,
      backgroundColor: branding.backgroundColor || '#eff6ff',
      textColor: branding.textColor || '#1e293b',
      fontFamily: branding.fontFamily || 'system-ui, sans-serif',
    }),
  };
}

async function serviceUpdateBranding(body, clinicId) {
  const query = clinicId
    ? supabase.from('clinics').select('id, settings').eq('id', clinicId).single()
    : supabase.from('clinics').select('id, settings').eq('is_active', true).limit(1).single();

  const { data: clinic } = await query;
  if (!clinic) return { statusCode: 404, response: createErrorResponse(ERROR_CODES.NOT_FOUND, 'Clinic not found') };

  const currentSettings = clinic.settings || {};
  const newSettings = { ...currentSettings, branding: body };
  await supabase.from('clinics').update({ settings: newSettings }).eq('id', clinic.id);
  await serviceAudit('branding.updated', 'clinic', clinic.id);

  return { statusCode: 200, response: createSuccessResponse(body) };
}

// ----- 5g: Clinic services (org admin) -----

async function serviceListClinics() {
  const { data: clinicList } = await supabase.from('clinics').select('id, name, slug, is_active').eq('is_active', true);

  const result = [];
  for (const c of clinicList || []) {
    const { count: roomCount } = await supabase.from('rooms').select('*', { count: 'exact', head: true }).eq('clinic_id', c.id).eq('is_active', true);
    const { count: staffCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('clinic_id', c.id).eq('is_active', true);
    result.push({ id: c.id, name: c.name, slug: c.slug, status: c.is_active ? 'active' : 'inactive', rooms: roomCount || 0, staff: staffCount || 0, patientsToday: 0 });
  }

  return { statusCode: 200, response: createSuccessResponse(result) };
}

async function serviceCreateClinic(body) {
  const name = body.name;
  const slug = body.slug;
  if (!name || !slug) return { statusCode: 400, response: createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Name and slug required') };

  const { data: org } = await supabase.from('organizations').select('id').limit(1).single();
  if (!org) return { statusCode: 404, response: createErrorResponse(ERROR_CODES.NOT_FOUND, 'Organization not found') };

  const { data: clinic, error } = await supabase.from('clinics').insert({
    organization_id: org.id,
    name,
    slug,
    qr_code_secret: crypto.randomBytes(32).toString('hex'),
    daily_salt: crypto.randomBytes(32).toString('hex'),
    daily_salt_date: new Date().toISOString().split('T')[0],
    is_active: true,
  }).select().single();

  if (error) return { statusCode: 500, response: createErrorResponse(ERROR_CODES.INTERNAL_ERROR, error.message) };
  await serviceAudit('clinic.created', 'clinic', clinic.id);

  return { statusCode: 201, response: createSuccessResponse({ id: clinic.id, name: clinic.name, slug: clinic.slug, status: 'active', rooms: 0, staff: 0, patientsToday: 0 }) };
}

async function serviceDeleteClinic(clinicId) {
  await supabase.from('clinics').update({ is_active: false }).eq('id', clinicId);
  await serviceAudit('clinic.deactivated', 'clinic', clinicId);
  return { statusCode: 200, response: createSuccessResponse({ message: 'Clinic deactivated' }) };
}

// ----- 5h: System services (superadmin) -----

async function serviceSystemLogin(body) {
  const parsed = superAdminLoginSchema.safeParse(body);
  if (!parsed.success) {
    return { statusCode: 400, response: createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()) };
  }

  const { email, password, totpCode } = parsed.data;

  const { data: admin, error: adminErr } = await supabase
    .from('superadmins')
    .select('*')
    .eq('email', email)
    .eq('is_active', true)
    .single();

  if (adminErr || !admin) {
    return { statusCode: 401, response: createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials') };
  }

  const validPassword = await bcrypt.compare(password, admin.password_hash);
  if (!validPassword) {
    return { statusCode: 401, response: createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials') };
  }

  if (!/^\d{6}$/.test(totpCode)) {
    return { statusCode: 401, response: createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid TOTP code') };
  }

  const accessToken = await new SignJWT({
    userId: admin.id,
    role: 'superadmin',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET);

  return {
    statusCode: 200,
    response: createSuccessResponse({
      accessToken,
      user: {
        id: admin.id,
        email: admin.email,
        role: 'superadmin',
      },
    }),
  };
}

async function serviceListOrganizations() {
  const { data: orgList } = await supabase
    .from('organizations')
    .select('*');

  return { statusCode: 200, response: createSuccessResponse(orgList || []) };
}

function serviceSystemHealth() {
  return {
    statusCode: 200,
    response: createSuccessResponse({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    }),
  };
}

// ----- 5i: Audit service -----

async function serviceAudit(action, resourceType, resourceId, actorId, orgId, clinicId) {
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

async function serviceGetAuditLog(clinicId, queryParams) {
  clinicId = await resolveClinicId(clinicId);

  const query = paginationSchema.safeParse({
    page: queryParams.page,
    pageSize: queryParams.pageSize,
  });

  const page = query.success ? query.data.page : 1;
  const pageSize = query.success ? query.data.pageSize : 20;

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

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

  return {
    statusCode: 200,
    response: createSuccessResponse(paginated || [], {
      pagination: { page, pageSize, total: totalCount, totalPages },
    }),
  };
}

// ----- 5j: Setup service (bootstrap empty system) -----

async function serviceSetupInitialize(body) {
  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return { statusCode: 400, response: createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()) };
  }

  const { organizationName, clinicName, clinicSlug, adminEmail, adminPassword, adminDisplayName } = parsed.data;

  const { data: existingOrgs } = await supabase.from('organizations').select('id').limit(1);
  if (existingOrgs && existingOrgs.length > 0) {
    return { statusCode: 409, response: createErrorResponse(ERROR_CODES.CONFLICT, 'System already initialized') };
  }

  // Generate org slug from name
  const orgSlug = organizationName.toLowerCase().replace(/[åä]/g, 'a').replace(/[ö]/g, 'o').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({
      name: organizationName,
      slug: orgSlug,
      is_active: true,
    })
    .select()
    .single();

  if (orgErr) {
    console.error('Setup org insert error:', orgErr.message);
    return { statusCode: 500, response: createErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Failed to create organization') };
  }

  const { data: clinic, error: clinicErr } = await supabase
    .from('clinics')
    .insert({
      organization_id: org.id,
      name: clinicName,
      slug: clinicSlug,
      qr_code_secret: crypto.randomBytes(32).toString('hex'),
      daily_salt: crypto.randomBytes(32).toString('hex'),
      daily_salt_date: new Date().toISOString().split('T')[0],
      is_active: true,
    })
    .select()
    .single();

  if (clinicErr) {
    console.error('Setup clinic insert error:', clinicErr.message);
    return { statusCode: 500, response: createErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Failed to create clinic') };
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const { data: adminUser, error: userErr } = await supabase
    .from('users')
    .insert({
      organization_id: org.id,
      clinic_id: null,
      email: adminEmail.trim().toLowerCase(),
      password_hash: passwordHash,
      display_name: adminDisplayName,
      role: 'org_admin',
      preferred_language: 'sv',
      is_active: true,
    })
    .select()
    .single();

  if (userErr) {
    console.error('Setup user insert error:', userErr.message);
    return { statusCode: 500, response: createErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Failed to create admin user') };
  }

  const user = { ...adminUser, organization_id: org.id, clinic_id: null };
  const accessToken = await createAccessToken(user);
  const refreshToken = await createRefreshTokenJWT(user);

  await serviceAudit('system.initialized', 'organization', org.id, adminUser.id, org.id, clinic.id);

  return {
    statusCode: 201,
    response: createSuccessResponse({
      accessToken,
      refreshToken,
      user: {
        id: adminUser.id,
        role: adminUser.role,
        clinicId: null,
        organizationId: org.id,
        displayName: adminUser.display_name,
      },
      organization: { id: org.id, name: org.name },
      clinic: { id: clinic.id, name: clinic.name, slug: clinic.slug },
    }),
  };
}

// ----- Public display services -----

async function serviceGetDisplay(slug) {
  const { data: clinic, error: clinicErr } = await supabase
    .from('clinics')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (clinicErr || !clinic) {
    return { statusCode: 404, response: createErrorResponse(ERROR_CODES.CLINIC_NOT_FOUND, 'Clinic not found') };
  }

  const waiting = await getWaitingTickets(clinic.id);

  const { data: roomList } = await supabase
    .from('rooms')
    .select('*')
    .eq('clinic_id', clinic.id)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  const roomArr = roomList || [];

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

  return {
    statusCode: 200,
    response: createSuccessResponse({
      clinicName: clinic.name,
      clinicSlug: clinic.slug,
      queueLength: waiting.length,
      rooms: roomArr.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        isActive: r.is_active,
        displayOrder: r.display_order,
      })),
      calledTickets,
      nextTicketNumbers: waiting.slice(0, 5).map((t) => t.ticket_number),
    }),
  };
}

async function serviceGetClinicInfo(slug) {
  const { data: clinic, error: clinicErr } = await supabase
    .from('clinics')
    .select('*')
    .eq('slug', slug)
    .single();

  if (clinicErr || !clinic) {
    return { statusCode: 404, response: createErrorResponse(ERROR_CODES.CLINIC_NOT_FOUND, 'Clinic not found') };
  }

  return {
    statusCode: 200,
    response: createSuccessResponse({
      id: clinic.id,
      name: clinic.name,
      slug: clinic.slug,
      address: clinic.address,
      timezone: clinic.timezone,
      defaultLanguage: clinic.default_language,
      isActive: clinic.is_active,
    }),
  };
}

function serviceHealth() {
  return {
    statusCode: 200,
    response: createSuccessResponse({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
    }),
  };
}

// ===== SECTION 6: THIN ROUTE HANDLER =====

module.exports = async function handler(req, res) {
  const url = req.url || '/';
  const method = req.method || 'GET';
  const pathname = getPathname(url);

  console.log('API handler called:', method, url, pathname);

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

    // Health check
    if (method === 'GET' && pathname === '/api/v1/health') {
      const result = serviceHealth();
      return res.status(result.statusCode).json(result.response);
    }

    // =================================================================
    // SETUP (no auth required)
    // =================================================================
    if (method === 'POST' && pathname === '/api/v1/setup/initialize') {
      const body = await parseBody(req);
      const result = await serviceSetupInitialize(body);
      return res.status(result.statusCode).json(result.response);
    }

    // =================================================================
    // AUTH ROUTES — /api/v1/auth/*
    // =================================================================
    if (method === 'POST' && pathname === '/api/v1/auth/login') {
      const body = await parseBody(req);
      const result = await serviceLogin(body);
      return res.status(result.statusCode).json(result.response);
    }

    if (method === 'POST' && pathname === '/api/v1/auth/refresh') {
      const body = await parseBody(req);
      const result = await serviceRefresh(body);
      return res.status(result.statusCode).json(result.response);
    }

    if (method === 'POST' && pathname === '/api/v1/auth/logout') {
      const result = serviceLogout();
      return res.status(result.statusCode).json(result.response);
    }

    // =================================================================
    // QUEUE ROUTES — /api/v1/queue/* (public)
    // =================================================================
    if (method === 'POST' && pathname === '/api/v1/queue/join') {
      const body = await parseBody(req);
      const result = await serviceJoinQueue(body);
      return res.status(result.statusCode).json(result.response);
    }

    match = pathname.match(/^\/api\/v1\/queue\/status\/([^/]+)$/);
    if (method === 'GET' && match) {
      const result = await serviceGetQueueStatus(match[1]);
      return res.status(result.statusCode).json(result.response);
    }

    match = pathname.match(/^\/api\/v1\/queue\/postpone\/([^/]+)$/);
    if (method === 'POST' && match) {
      const body = await parseBody(req);
      const result = await servicePostpone(match[1], body);
      return res.status(result.statusCode).json(result.response);
    }

    match = pathname.match(/^\/api\/v1\/queue\/leave\/([^/]+)$/);
    if (method === 'DELETE' && match) {
      const result = await serviceLeaveQueue(match[1]);
      return res.status(result.statusCode).json(result.response);
    }

    // =================================================================
    // PUBLIC DISPLAY ROUTES
    // =================================================================
    match = pathname.match(/^\/api\/v1\/display\/([^/]+)$/);
    if (method === 'GET' && match) {
      const result = await serviceGetDisplay(match[1]);
      return res.status(result.statusCode).json(result.response);
    }

    match = pathname.match(/^\/api\/v1\/clinic\/([^/]+)\/info$/);
    if (method === 'GET' && match) {
      const result = await serviceGetClinicInfo(match[1]);
      return res.status(result.statusCode).json(result.response);
    }

    // =================================================================
    // STAFF ROUTES — /api/v1/staff/* (requires auth: staff+)
    // =================================================================
    if (pathname.startsWith('/api/v1/staff/')) {
      const auth = await verifyJwt(req);
      const denied = requireAuth(auth, ['staff', 'clinic_admin', 'org_admin', 'superadmin']);
      if (denied) return res.status(denied.statusCode).json(denied.response);

      const staffId = auth.userId;

      if (method === 'POST' && pathname === '/api/v1/staff/ready') {
        const result = await serviceStaffReady(staffId);
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'POST' && pathname === '/api/v1/staff/complete') {
        const result = await serviceStaffComplete(staffId);
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'POST' && pathname === '/api/v1/staff/no-show') {
        const result = await serviceStaffNoShow(staffId);
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'POST' && pathname === '/api/v1/staff/pause') {
        const result = await serviceStaffPause(staffId);
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'POST' && pathname === '/api/v1/staff/resume') {
        const result = await serviceStaffResume(staffId);
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'GET' && pathname === '/api/v1/staff/room/status') {
        const result = await serviceStaffRoomStatus(staffId);
        return res.status(result.statusCode).json(result.response);
      }
    }

    // =================================================================
    // ADMIN ROUTES — /api/v1/admin/* (requires auth: clinic_admin+)
    // =================================================================
    if (pathname.startsWith('/api/v1/admin/')) {
      const auth = await verifyJwt(req);
      const denied = requireAuth(auth, ['clinic_admin', 'org_admin', 'superadmin']);
      if (denied) return res.status(denied.statusCode).json(denied.response);

      const queryParams = getQueryParams(url);
      const clinicId = queryParams.clinicId || auth.clinicId;

      if (method === 'GET' && pathname === '/api/v1/admin/dashboard') {
        const result = await serviceGetDashboard(clinicId);
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'GET' && pathname === '/api/v1/admin/queue') {
        const result = await serviceGetAdminQueue(clinicId);
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'POST' && pathname === '/api/v1/admin/rooms') {
        const body = await parseBody(req);
        const result = await serviceAddRoom(body);
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'GET' && pathname === '/api/v1/admin/rooms') {
        const result = await serviceListRooms(clinicId);
        return res.status(result.statusCode).json(result.response);
      }

      match = pathname.match(/^\/api\/v1\/admin\/rooms\/([^/]+)\/assign$/);
      if (method === 'PUT' && match) {
        const body = await parseBody(req);
        const result = await serviceAssignStaffToRoom(match[1], body);
        return res.status(result.statusCode).json(result.response);
      }

      match = pathname.match(/^\/api\/v1\/admin\/rooms\/([^/]+)$/);
      if (method === 'PUT' && match) {
        const body = await parseBody(req);
        const result = await serviceUpdateRoom(match[1], body);
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'DELETE' && match) {
        const result = await serviceDeleteRoom(match[1]);
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'GET' && pathname === '/api/v1/admin/staff') {
        const result = await serviceListStaff(clinicId);
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'POST' && pathname === '/api/v1/admin/staff') {
        const body = await parseBody(req);
        const result = await serviceAddStaff(body);
        return res.status(result.statusCode).json(result.response);
      }

      match = pathname.match(/^\/api\/v1\/admin\/staff\/([^/]+)$/);
      if (method === 'PUT' && match) {
        const body = await parseBody(req);
        const result = await serviceUpdateStaff(match[1], body);
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'DELETE' && match) {
        const result = await serviceDeleteStaff(match[1]);
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'GET' && pathname === '/api/v1/admin/audit-log') {
        const result = await serviceGetAuditLog(clinicId, queryParams);
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'GET' && pathname === '/api/v1/admin/settings') {
        const result = await serviceGetSettings(clinicId);
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'PUT' && pathname === '/api/v1/admin/settings') {
        const body = await parseBody(req);
        const result = await serviceUpdateSettings(body, clinicId);
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'GET' && pathname === '/api/v1/admin/branding') {
        const result = await serviceGetBranding(clinicId);
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'PUT' && pathname === '/api/v1/admin/branding') {
        const body = await parseBody(req);
        const result = await serviceUpdateBranding(body, clinicId);
        return res.status(result.statusCode).json(result.response);
      }
    }

    // =================================================================
    // ORG ROUTES — /api/v1/org/* (requires auth: org_admin+)
    // =================================================================
    if (pathname.startsWith('/api/v1/org/')) {
      const auth = await verifyJwt(req);
      const denied = requireAuth(auth, ['org_admin', 'superadmin']);
      if (denied) return res.status(denied.statusCode).json(denied.response);

      if (method === 'GET' && pathname === '/api/v1/org/clinics') {
        const result = await serviceListClinics();
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'POST' && pathname === '/api/v1/org/clinics') {
        const body = await parseBody(req);
        const result = await serviceCreateClinic(body);
        return res.status(result.statusCode).json(result.response);
      }

      match = pathname.match(/^\/api\/v1\/org\/clinics\/([^/]+)$/);
      if (method === 'DELETE' && match) {
        const result = await serviceDeleteClinic(match[1]);
        return res.status(result.statusCode).json(result.response);
      }
    }

    // =================================================================
    // SYSTEM ROUTES — /api/v1/system/* (superadmin)
    // =================================================================
    if (method === 'POST' && pathname === '/api/v1/system/auth/login') {
      const body = await parseBody(req);
      const result = await serviceSystemLogin(body);
      return res.status(result.statusCode).json(result.response);
    }

    if (pathname.startsWith('/api/v1/system/') && pathname !== '/api/v1/system/auth/login') {
      const auth = await verifyJwt(req);
      const denied = requireAuth(auth, ['superadmin']);
      if (denied) return res.status(denied.statusCode).json(denied.response);

      if (method === 'GET' && pathname === '/api/v1/system/organizations') {
        const result = await serviceListOrganizations();
        return res.status(result.statusCode).json(result.response);
      }

      if (method === 'GET' && pathname === '/api/v1/system/health') {
        const result = serviceSystemHealth();
        return res.status(result.statusCode).json(result.response);
      }
    }

    // =================================================================
    // 404
    // =================================================================
    return res.status(404).json(createErrorResponse(ERROR_CODES.NOT_FOUND, 'Not found'));

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json(createErrorResponse(ERROR_CODES.INTERNAL_ERROR, err.message));
  }
};
