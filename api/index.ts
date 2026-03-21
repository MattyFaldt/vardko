import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const path = req.url || '';

  // CORS
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Health check
  if (path.includes('/health')) {
    return res.status(200).json({
      success: true,
      data: { status: 'ok', timestamp: new Date().toISOString(), version: '0.0.1' },
    });
  }

  return res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route not found: ${path}` },
  });
}
