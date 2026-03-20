import type { MiddlewareHandler } from 'hono';
import type { AuthContext } from '@vardko/shared';
import { ERROR_CODES, createErrorResponse } from '@vardko/shared';

// ── Types ─────────────────────────────────────────────────────────────

export interface RateLimitOptions {
  /** Maximum requests allowed within the window. */
  max: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /**
   * Custom key resolver. Defaults to authenticated userId or client IP.
   */
  keyResolver?: (c: Parameters<MiddlewareHandler>[0]) => string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  get(key: string): RateLimitEntry | undefined;
  set(key: string, entry: RateLimitEntry): void;
  delete(key: string): void;
}

// ── In-memory store (Redis-ready interface) ───────────────────────────

class InMemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, RateLimitEntry>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(cleanupIntervalMs: number = 60_000) {
    // Periodically purge expired entries to prevent unbounded growth
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    // Allow the process to exit without waiting for the timer
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  get(key: string): RateLimitEntry | undefined {
    return this.store.get(key);
  }

  set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.resetAt <= now) {
        this.store.delete(key);
      }
    }
  }

  /** Exposed for testing. */
  get size(): number {
    return this.store.size;
  }
}

// ── Default key resolver ──────────────────────────────────────────────

function defaultKeyResolver(c: Parameters<MiddlewareHandler>[0]): string {
  const auth = c.get('auth') as AuthContext | undefined;
  if (auth?.userId) {
    return `user:${auth.userId}`;
  }
  // Fallback to IP — support common proxy headers
  const forwarded = c.req.header('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown';
  return `ip:${ip}`;
}

// ── Factory ───────────────────────────────────────────────────────────

/**
 * Creates a rate-limiting middleware with a sliding window counter.
 *
 * ```ts
 * app.use('/api/v1/auth/login', createRateLimiter({ max: 5, windowMs: 60_000 }));
 * ```
 */
export function createRateLimiter(
  options: RateLimitOptions,
  store: RateLimitStore = new InMemoryRateLimitStore(),
): MiddlewareHandler {
  const { max, windowMs, keyResolver = defaultKeyResolver } = options;

  return async (c, next) => {
    const key = keyResolver(c);
    const now = Date.now();

    let entry = store.get(key);

    // If the window has expired, start a fresh one
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
    }

    entry.count += 1;
    store.set(key, entry);

    // Set standard rate-limit headers
    const remaining = Math.max(0, max - entry.count);
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(resetSeconds));

    if (entry.count > max) {
      c.header('Retry-After', String(resetSeconds));
      return c.json(
        createErrorResponse(
          ERROR_CODES.RATE_LIMITED,
          `Rate limit exceeded. Try again in ${resetSeconds} seconds.`,
        ),
        429,
      );
    }

    await next();
  };
}
