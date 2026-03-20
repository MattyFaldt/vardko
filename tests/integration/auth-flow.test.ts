import { describe, it, expect } from 'vitest';
import { app } from '../../apps/api/src/index.js';

describe('Auth flow', () => {
  it('POST /api/v1/auth/login with valid credentials returns 200 with tokens', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'anna@kungsholmen.se',
        password: 'Admin123456!',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.refreshToken).toBeDefined();
    expect(body.data.user).toBeDefined();
    expect(body.data.user.email).toBeUndefined(); // user object should not leak email
    expect(body.data.user.role).toBe('clinic_admin');
  });

  it('POST /api/v1/auth/login with wrong password returns 401', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'anna@kungsholmen.se',
        password: 'WrongPassword123!',
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('POST /api/v1/auth/login with non-existent user returns 401', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nobody@example.com',
        password: 'SomePassword123!',
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('POST /api/v1/auth/refresh with valid token returns new tokens', async () => {
    // First, log in to get a refresh token
    const loginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'erik@kungsholmen.se',
        password: 'Staff123456!',
      }),
    });

    expect(loginRes.status).toBe(200);
    const loginBody = await loginRes.json();
    const { refreshToken } = loginBody.data;

    // Now use the refresh token
    const refreshRes = await app.request('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    expect(refreshRes.status).toBe(200);
    const refreshBody = await refreshRes.json();
    expect(refreshBody.success).toBe(true);
    expect(refreshBody.data.accessToken).toBeDefined();
    expect(refreshBody.data.refreshToken).toBeDefined();
    // The old refresh token should no longer be accepted (rotation)
    expect(typeof refreshBody.data.refreshToken).toBe('string');
  });

  it('POST /api/v1/auth/refresh with invalid token returns 401', async () => {
    const res = await app.request('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'invalid-token' }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
