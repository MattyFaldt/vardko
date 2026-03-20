import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import {
  joinQueueSchema,
  postponeSchema,
  createSuccessResponse,
  createErrorResponse,
  ERROR_CODES,
  DEFAULT_SERVICE_TIME_SECONDS,
  MAX_QUEUE_SIZE,
} from '@vardko/shared';
import type { QueueTicket } from '@vardko/shared';

// ---------------------------------------------------------------------------
// In-memory queue state
// ---------------------------------------------------------------------------

const tickets = new Map<string, QueueTicket>();
let nextTicketNumber = 1;

const DEMO_ORG_ID = '00000000-0000-0000-0000-000000000001';

function generateSessionToken(): string {
  return randomBytes(64).toString('hex');
}

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

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// POST /queue/join
app.post('/join', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = joinQueueSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()), 400);
  }

  const { clinicId, anonymousHash, language } = parsed.data;

  // Check for duplicate hash (already in queue)
  const existing = Array.from(tickets.values()).find(
    (t) => t.clinicId === clinicId && t.anonymousHash === anonymousHash && t.status === 'waiting',
  );
  if (existing) {
    return c.json(createErrorResponse(ERROR_CODES.ALREADY_IN_QUEUE, 'Already in queue'), 409);
  }

  // Check queue capacity
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
    organizationId: DEMO_ORG_ID,
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
    createSuccessResponse({
      sessionToken,
      ticketNumber,
      position,
      estimatedWaitMinutes,
    }),
    201,
  );
});

// GET /queue/status/:sessionToken
app.get('/status/:sessionToken', (c) => {
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
app.post('/postpone/:sessionToken', async (c) => {
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

  // Move ticket in the array
  waiting.splice(currentIdx, 1);
  waiting.splice(newIdx, 0, ticket);

  // Recalculate all positions
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
app.delete('/leave/:sessionToken', (c) => {
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

export default app;
export { tickets, getWaitingTickets, recalcPositions };
