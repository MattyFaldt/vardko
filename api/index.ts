import { Hono } from 'hono';
import { handle } from 'hono/vercel';

const app = new Hono().basePath('/api/v1');

app.get('/health', (c) => {
  return c.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

export default handle(app);
