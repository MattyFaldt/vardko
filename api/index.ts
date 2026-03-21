// Standard Vercel Node.js serverless handler (no Hono)
export default function handler(req: { url?: string; method?: string }, res: { setHeader: Function; status: Function; json: Function; end: Function }) {
  const url = req.url || '/';
  const method = req.method || 'GET';

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Simple router
  if (url.includes('/health')) {
    res.status(200).json({
      success: true,
      data: { status: 'ok', timestamp: new Date().toISOString(), url },
    });
    return;
  }

  if (url.includes('/clinic/') && url.includes('/info')) {
    const match = url.match(/\/clinic\/([^/]+)\/info/);
    const slug = match ? match[1] : 'unknown';
    res.status(200).json({
      success: true,
      data: { name: 'Kungsholmens Vårdcentral', slug, isActive: true },
    });
    return;
  }

  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route not found: ${url}` },
  });
}
