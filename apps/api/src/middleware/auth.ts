import type { MiddlewareHandler } from 'hono';
import { jwtVerify, SignJWT } from 'jose';
import type { AuthContext, JWTPayload } from '@vardko/shared';
import { ERROR_CODES, createErrorResponse } from '@vardko/shared';

// ── Helper: encode secret for jose ────────────────────────────────────
function encodeSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

// ── Token creation helpers ────────────────────────────────────────────

export async function createAccessToken(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  secret: string,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(encodeSecret(secret));
}

export async function createRefreshToken(
  payload: Pick<JWTPayload, 'userId'>,
  secret: string,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodeSecret(secret));
}

// ── Session token format validation (patient kiosk tokens) ────────────
const SESSION_TOKEN_REGEX = /^[a-f0-9]{64,128}$/;

function isValidSessionTokenFormat(token: string): boolean {
  return SESSION_TOKEN_REGEX.test(token);
}

// ── JWT authentication middleware ─────────────────────────────────────

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const jwtSecret = c.env?.JWT_SECRET ?? process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('JWT_SECRET is not configured');
    return c.json(
      createErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Server configuration error'),
      500,
    );
  }

  // Check for patient session token first
  const sessionToken = c.req.header('X-Session-Token');
  if (sessionToken) {
    if (!isValidSessionTokenFormat(sessionToken)) {
      return c.json(
        createErrorResponse(ERROR_CODES.INVALID_TOKEN, 'Invalid session token format'),
        401,
      );
    }
    // TODO: Look up session token in DB and resolve patient context
    // For now, set a minimal auth context indicating a patient session
    c.set('auth', {
      userId: `session:${sessionToken.slice(0, 16)}`,
      role: 'patient' as const,
      organizationId: null,
      clinicId: null,
    });
    await next();
    return;
  }

  // Standard Bearer token flow
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Missing or invalid Authorization header'),
      401,
    );
  }

  const token = authHeader.slice(7);
  if (!token) {
    return c.json(
      createErrorResponse(ERROR_CODES.UNAUTHORIZED, 'Missing token'),
      401,
    );
  }

  try {
    const { payload } = await jwtVerify(token, encodeSecret(jwtSecret), {
      algorithms: ['HS256'],
    });

    const jwtPayload = payload as unknown as JWTPayload;

    const authContext: AuthContext = {
      userId: jwtPayload.userId,
      role: jwtPayload.role,
      organizationId: jwtPayload.organizationId,
      clinicId: jwtPayload.clinicId,
    };

    c.set('auth', authContext);
    await next();
  } catch (err) {
    const isExpired =
      err instanceof Error && err.message.includes('exp');

    if (isExpired) {
      return c.json(
        createErrorResponse(ERROR_CODES.TOKEN_EXPIRED, 'Access token has expired'),
        401,
      );
    }

    return c.json(
      createErrorResponse(ERROR_CODES.INVALID_TOKEN, 'Invalid or malformed token'),
      401,
    );
  }
};

// ── Optional auth – does not reject unauthenticated requests ─────────

export const optionalAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const jwtSecret = c.env?.JWT_SECRET ?? process.env.JWT_SECRET;
  if (!jwtSecret) {
    await next();
    return;
  }

  // Check session token
  const sessionToken = c.req.header('X-Session-Token');
  if (sessionToken && isValidSessionTokenFormat(sessionToken)) {
    c.set('auth', {
      userId: `session:${sessionToken.slice(0, 16)}`,
      role: 'patient' as const,
      organizationId: null,
      clinicId: null,
    });
    await next();
    return;
  }

  // Check Bearer token
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    await next();
    return;
  }

  const token = authHeader.slice(7);
  if (!token) {
    await next();
    return;
  }

  try {
    const { payload } = await jwtVerify(token, encodeSecret(jwtSecret), {
      algorithms: ['HS256'],
    });

    const jwtPayload = payload as unknown as JWTPayload;

    c.set('auth', {
      userId: jwtPayload.userId,
      role: jwtPayload.role,
      organizationId: jwtPayload.organizationId,
      clinicId: jwtPayload.clinicId,
    } satisfies AuthContext);
  } catch {
    // Silently ignore invalid tokens – request continues unauthenticated
  }

  await next();
};
