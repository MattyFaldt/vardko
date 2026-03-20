import { Hono } from 'hono';
import * as argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import {
  loginSchema,
  refreshTokenSchema,
  createSuccessResponse,
  createErrorResponse,
  ERROR_CODES,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
} from '@vardko/shared';
import type { UserRole } from '@vardko/shared';

// ---------------------------------------------------------------------------
// In-memory user store (matches frontend demo accounts)
// Passwords are Argon2-hashed at startup.
// ---------------------------------------------------------------------------

interface DemoUser {
  id: string;
  organizationId: string;
  clinicId: string | null;
  email: string;
  displayName: string;
  role: UserRole;
  passwordHash: string;
}

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const CLINIC_ID = '00000000-0000-0000-0000-000000000010';

const demoUsers: DemoUser[] = [];

// Hash passwords once at startup
const usersReady = (async () => {
  const entries: Array<Omit<DemoUser, 'passwordHash'> & { plainPassword: string }> = [
    { id: 's1', organizationId: ORG_ID, clinicId: CLINIC_ID, email: 'anna@kungsholmen.se', displayName: 'Anna Adminsson', role: 'clinic_admin', plainPassword: 'Admin123456!' },
    { id: 's2', organizationId: ORG_ID, clinicId: CLINIC_ID, email: 'erik@kungsholmen.se', displayName: 'Erik Eriksson', role: 'staff', plainPassword: 'Staff123456!' },
    { id: 's3', organizationId: ORG_ID, clinicId: CLINIC_ID, email: 'maria@kungsholmen.se', displayName: 'Maria Johansson', role: 'staff', plainPassword: 'Staff123456!' },
    { id: 's4', organizationId: ORG_ID, clinicId: CLINIC_ID, email: 'anna.l@kungsholmen.se', displayName: 'Anna Lindberg', role: 'staff', plainPassword: 'Staff123456!' },
    { id: 's5', organizationId: ORG_ID, clinicId: CLINIC_ID, email: 'karl@kungsholmen.se', displayName: 'Karl Svensson', role: 'staff', plainPassword: 'Staff123456!' },
  ];
  for (const entry of entries) {
    const { plainPassword, ...rest } = entry;
    const passwordHash = await argon2.hash(plainPassword);
    demoUsers.push({ ...rest, passwordHash });
  }
})();

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-change-in-production-minimum-32-chars!',
);

async function createAccessToken(user: DemoUser): Promise<string> {
  return new SignJWT({
    userId: user.id,
    role: user.role,
    organizationId: user.organizationId,
    clinicId: user.clinicId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

async function createRefreshTokenJWT(user: DemoUser): Promise<string> {
  return new SignJWT({ userId: user.id, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

// ---------------------------------------------------------------------------
// Refresh token store (in-memory)
// ---------------------------------------------------------------------------

const activeRefreshTokens = new Set<string>();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// POST /auth/login
app.post('/login', async (c) => {
  await usersReady;

  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()), 400);
  }

  const { email, password } = parsed.data;
  const user = demoUsers.find((u) => u.email === email.trim().toLowerCase());

  if (!user) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password'), 401);
  }

  const valid = await argon2.verify(user.passwordHash, password);
  if (!valid) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password'), 401);
  }

  const accessToken = await createAccessToken(user);
  const refreshToken = await createRefreshTokenJWT(user);
  activeRefreshTokens.add(refreshToken);

  return c.json(
    createSuccessResponse({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        role: user.role,
        clinicId: user.clinicId,
        organizationId: user.organizationId,
        displayName: user.displayName,
      },
    }),
  );
});

// POST /auth/refresh
app.post('/refresh', async (c) => {
  await usersReady;

  const body = await c.req.json().catch(() => null);
  const parsed = refreshTokenSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_INPUT, 'Invalid input', parsed.error.flatten()), 400);
  }

  const { refreshToken } = parsed.data;

  if (!activeRefreshTokens.has(refreshToken)) {
    return c.json(createErrorResponse(ERROR_CODES.INVALID_TOKEN, 'Invalid or revoked refresh token'), 401);
  }

  try {
    const { payload } = await jwtVerify(refreshToken, JWT_SECRET);
    const userId = payload.userId as string;
    const user = demoUsers.find((u) => u.id === userId);

    if (!user) {
      return c.json(createErrorResponse(ERROR_CODES.INVALID_TOKEN, 'User not found'), 401);
    }

    // Rotate refresh token
    activeRefreshTokens.delete(refreshToken);
    const newAccessToken = await createAccessToken(user);
    const newRefreshToken = await createRefreshTokenJWT(user);
    activeRefreshTokens.add(newRefreshToken);

    return c.json(
      createSuccessResponse({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      }),
    );
  } catch {
    activeRefreshTokens.delete(refreshToken);
    return c.json(createErrorResponse(ERROR_CODES.TOKEN_EXPIRED, 'Refresh token expired'), 401);
  }
});

// POST /auth/logout
app.post('/logout', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = refreshTokenSchema.safeParse(body);

  if (parsed.success) {
    activeRefreshTokens.delete(parsed.data.refreshToken);
  }

  return c.json(createSuccessResponse({ message: 'Logged out' }));
});

export default app;
