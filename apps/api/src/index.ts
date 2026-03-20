import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

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

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`VårdKö API server running on http://localhost:${info.port}`);
});

export { app };
