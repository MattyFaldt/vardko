export const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_EXPIRY = '7d';
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MINUTES = 15;

export const RATE_LIMITS = {
  AUTH_LOGIN: { max: 5, windowMs: 60_000 },
  QUEUE_JOIN: { max: 10, windowMs: 60_000 },
  QUEUE_STATUS: { max: 60, windowMs: 60_000 },
  STAFF_ACTIONS: { max: 30, windowMs: 60_000 },
  ADMIN_ENDPOINTS: { max: 60, windowMs: 60_000 },
} as const;
