import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { setupWebSocket } from './ws/index.js';

import authRoutes from './routes/auth/index.js';
import queueRoutes from './routes/queue/index.js';
import staffRoutes from './routes/staff/index.js';
import adminRoutes from './routes/admin/index.js';
import publicRoutes from './routes/public/index.js';
import systemRoutes from './routes/system/index.js';

const app = new Hono();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(
  '*',
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Staff-Id'],
    credentials: true,
  }),
);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/api/v1/health', (c) => {
  return c.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
    },
  });
});

// ---------------------------------------------------------------------------
// Route groups
// ---------------------------------------------------------------------------

app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/queue', queueRoutes);
app.route('/api/v1/staff', staffRoutes);
app.route('/api/v1/admin', adminRoutes);
app.route('/api/v1', publicRoutes);
app.route('/api/v1/system', systemRoutes);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const port = Number(process.env.PORT) || 3000;

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`VårdKö API server running on http://localhost:${info.port}`);
});

// The @hono/node-server serve() returns a ServerType union; in practice it
// is always an http.Server when not using createSecureServer.
setupWebSocket(server as unknown as Server);

export { app };
