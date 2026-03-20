import { Hono } from 'hono';
import {
  createSuccessResponse,
  createErrorResponse,
  ERROR_CODES,
} from '@vardko/shared';
import type { Clinic } from '@vardko/shared';
import { tickets, getWaitingTickets } from '../queue/index.js';
import { rooms } from '../staff/index.js';

// ---------------------------------------------------------------------------
// In-memory clinic store
// ---------------------------------------------------------------------------

const DEMO_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_CLINIC_ID = '00000000-0000-0000-0000-000000000010';

const clinics = new Map<string, Clinic>();

const now = new Date().toISOString();
clinics.set('kungsholmen', {
  id: DEMO_CLINIC_ID,
  organizationId: DEMO_ORG_ID,
  name: 'Kungsholmens Vårdcentral',
  slug: 'kungsholmen',
  address: 'Hantverkargatan 11, Stockholm',
  timezone: 'Europe/Stockholm',
  defaultLanguage: 'sv',
  settings: {},
  isActive: true,
  createdAt: now,
  updatedAt: now,
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// GET /display/:clinicSlug — display board data
app.get('/display/:clinicSlug', (c) => {
  const slug = c.req.param('clinicSlug');
  const clinic = clinics.get(slug);

  if (!clinic) {
    return c.json(createErrorResponse(ERROR_CODES.CLINIC_NOT_FOUND, 'Clinic not found'), 404);
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

// GET /clinic/:clinicSlug/info — clinic public info
app.get('/clinic/:clinicSlug/info', (c) => {
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

export default app;
