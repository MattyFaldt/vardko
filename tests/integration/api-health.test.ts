import { describe, it, expect } from 'vitest';
import { app } from '../../apps/api/src/index.js';

describe('GET /api/v1/health', () => {
  it('returns 200 with success: true', async () => {
    const res = await app.request('/api/v1/health');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(body.data.timestamp).toBeDefined();
    expect(body.data.version).toBeDefined();
  });
});
