import { Hono } from 'hono';
import * as argon2 from 'argon2';
import { SignJWT } from 'jose';
import {
  superAdminLoginSchema,
  createSuccessResponse,
  createErrorResponse,
  ERROR_CODES,
  ACCESS_TOKEN_EXPIRY,
} from '@vardko/shared';
import type { Organization } from '@vardko/shared';

// ---------------------------------------------------------------------------
// In-memory superadmin & org stores
// ---------------------------------------------------------------------------

interface SuperAdminRecord {
  id: string;
  email: string;
  passwordHash: string;
  totpSecret: string; // simplified — in production use proper TOTP
  isActive: boolean;
}

const superAdmins: SuperAdminRecord[] = [];

const superAdminsReady = (async () => {
  const hash = await argon2.hash('SuperAdmin123456!');
  superAdmins.push({
    id: 'sa-1',
    email: 'superadmin@vardko.se',
    passwordHash: hash,
    totpSecret: 'demo-totp-secret',
    isActive: true,
  });
})();

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-change-in-production-minimum-32-chars!',
);

const organizations = new Map<string, Organization>();

const now = new Date().toISOString();
organizations.set('00000000-0000-0000-0000-000000000001', {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Kungsholmen Vård AB',
  slug: 'kungsholmen-vard',
  settings: { maxClinics: 5 },
  isActive: true,
  createdAt: now,
  updatedAt: now,
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// POST /system/auth/login — SuperAdmin login
app.post('/auth/login', async (c) => {
  await superAdminsReady;

  const body = await c.req.json().catch(() => null);
  const parsed = superAdminLoginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()), 400);
  }

  const { email, password, totpCode } = parsed.data;
  const admin = superAdmins.find((a) => a.email === email && a.isActive);

  if (!admin) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials'), 401);
  }

  const validPassword = await argon2.verify(admin.passwordHash, password);
  if (!validPassword) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials'), 401);
  }

  // Simplified TOTP check — in production, use a proper TOTP library
  // For demo purposes, accept any valid 6-digit code
  if (!/^\d{6}$/.test(totpCode)) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid TOTP code'), 401);
  }

  const accessToken = await new SignJWT({
    userId: admin.id,
    role: 'superadmin',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET);

  return c.json(
    createSuccessResponse({
      accessToken,
      user: {
        id: admin.id,
        email: admin.email,
        role: 'superadmin',
      },
    }),
  );
});

// GET /system/organizations — list orgs
app.get('/organizations', (c) => {
  const orgList = Array.from(organizations.values());
  return c.json(createSuccessResponse(orgList));
});

// GET /system/health — system health
app.get('/health', (c) => {
  return c.json(
    createSuccessResponse({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    }),
  );
});

export default app;
