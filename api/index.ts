import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle } from 'hono/vercel';

const app = new Hono().basePath('/api/v1');

app.use('*', cors({ origin: '*' }));

app.get('/health', (c) => {
  return c.json({ success: true, data: { status: 'ok', ts: Date.now() } });
});

app.get('/clinic/:slug/info', (c) => {
  const slug = c.req.param('slug');
  return c.json({
    success: true,
    data: { name: 'Kungsholmens Vårdcentral', slug, isActive: true },
  });
});

app.onError((err, c) => {
  return c.json({ success: false, error: { code: 'ERROR', message: err.message } }, 500);
});

app.notFound((c) => {
  return c.json({ success: false, error: { code: 'NOT_FOUND', path: c.req.path } }, 404);
});

export default handle(app);
