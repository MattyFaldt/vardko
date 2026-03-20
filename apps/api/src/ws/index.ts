import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Server } from 'node:http';
import { jwtVerify, type JWTVerifyResult } from 'jose';
import type { WSMessage, JWTPayload } from '@vardko/shared';
import { connectionManager } from './connection-manager.js';

// ── helpers ────────────────────────────────────────────────────────────

function parsePath(url: string | undefined): { segments: string[]; query: URLSearchParams } {
  if (!url) return { segments: [], query: new URLSearchParams() };
  const parsed = new URL(url, 'http://localhost');
  const segments = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/');
  return { segments, query: parsed.searchParams };
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-secret-change-me');

async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET) as JWTVerifyResult & { payload: JWTPayload };
    return payload;
  } catch {
    return null;
  }
}

// ── route handlers ─────────────────────────────────────────────────────

async function handlePatientConnection(ws: WebSocket, sessionToken: string): Promise<void> {
  // For patient connections the sessionToken itself is the identifier.
  // In a full implementation we would look up the queue ticket in the DB to
  // find the associated clinicId; for now we store a placeholder and rely on
  // the caller providing clinicId when sending messages.
  //
  // TODO: resolve clinicId from sessionToken via DB lookup
  const clinicId = 'pending';
  connectionManager.addPatient(sessionToken, ws, clinicId);

  ws.on('pong', () => connectionManager.recordPong(ws));
  ws.on('close', () => connectionManager.removePatient(sessionToken));
  ws.on('error', () => {
    try { ws.terminate(); } catch { /* noop */ }
    connectionManager.removePatient(sessionToken);
  });

  // Send an initial heartbeat so the client knows the connection is live
  const heartbeat: WSMessage = { type: 'HEARTBEAT', data: {} };
  ws.send(JSON.stringify(heartbeat));
}

async function handleStaffConnection(ws: WebSocket, query: URLSearchParams): Promise<void> {
  const token = query.get('token');
  if (!token) {
    ws.close(4001, 'Missing auth token');
    return;
  }

  const payload = await verifyToken(token);
  if (!payload) {
    ws.close(4003, 'Invalid auth token');
    return;
  }

  const clinicId = payload.clinicId ?? payload.organizationId;
  connectionManager.addStaff(payload.userId, ws, clinicId);

  ws.on('pong', () => connectionManager.recordPong(ws));
  ws.on('close', () => connectionManager.removeStaff(payload.userId));
  ws.on('error', () => {
    try { ws.terminate(); } catch { /* noop */ }
    connectionManager.removeStaff(payload.userId);
  });

  const heartbeat: WSMessage = { type: 'HEARTBEAT', data: {} };
  ws.send(JSON.stringify(heartbeat));
}

async function handleDisplayConnection(ws: WebSocket, clinicSlug: string): Promise<void> {
  connectionManager.addDisplay(clinicSlug, ws);

  ws.on('pong', () => connectionManager.recordPong(ws));
  ws.on('close', () => connectionManager.removeDisplay(clinicSlug, ws));
  ws.on('error', () => {
    try { ws.terminate(); } catch { /* noop */ }
    connectionManager.removeDisplay(clinicSlug, ws);
  });

  const heartbeat: WSMessage = { type: 'HEARTBEAT', data: {} };
  ws.send(JSON.stringify(heartbeat));
}

// ── setup ──────────────────────────────────────────────────────────────

/**
 * Attach a WebSocket server to the existing HTTP server returned by
 * `@hono/node-server`'s `serve()`.
 *
 * Accepted paths:
 *   /api/v1/ws/patient/:sessionToken
 *   /api/v1/ws/staff?token=<jwt>
 *   /api/v1/ws/display/:clinicSlug
 */
export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const { segments, query } = parsePath(request.url);

    // Expected segments: ['api', 'v1', 'ws', <role>, ...<params>]
    if (
      segments.length < 4 ||
      segments[0] !== 'api' ||
      segments[1] !== 'v1' ||
      segments[2] !== 'ws'
    ) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const role = segments[3];

    const param = segments[4];

    if (role === 'patient' && param) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
        handlePatientConnection(ws, param);
      });
      return;
    }

    if (role === 'staff') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
        handleStaffConnection(ws, query);
      });
      return;
    }

    if (role === 'display' && param) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
        handleDisplayConnection(ws, param);
      });
      return;
    }

    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  });

  connectionManager.start();
  console.log('[ws] WebSocket server attached');
}

// ── public broadcast / send helpers ────────────────────────────────────

export function broadcastToClinic(clinicId: string, clinicSlug: string, message: WSMessage): void {
  connectionManager.broadcastToClinic(clinicId, clinicSlug, message);
}

export function sendToPatient(sessionToken: string, message: WSMessage): boolean {
  return connectionManager.sendToPatient(sessionToken, message);
}

export function sendToStaff(userId: string, message: WSMessage): boolean {
  return connectionManager.sendToStaff(userId, message);
}

export { connectionManager };
