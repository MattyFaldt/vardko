export default function handler(req: Request): Response {
  const url = new URL(req.url);

  if (url.pathname === '/api/v1/health' || url.pathname.endsWith('/health')) {
    return Response.json({
      success: true,
      data: { status: 'ok', timestamp: new Date().toISOString(), path: url.pathname }
    });
  }

  return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
}
