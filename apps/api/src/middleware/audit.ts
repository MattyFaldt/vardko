import type { Context, MiddlewareHandler } from 'hono';
import { randomUUID } from 'node:crypto';
import type { AuthContext, AuditLogEntry, ActorType } from '@vardko/shared';
import { hashIpAddress } from '@vardko/shared';

// ── Types ─────────────────────────────────────────────────────────────

export interface CreateAuditLogParams {
  actorType: ActorType;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  organizationId?: string | null;
  clinicId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

// ── In-memory store (DB integration later) ────────────────────────────

const auditStore: AuditLogEntry[] = [];

/** Retrieve all collected audit entries (useful for testing / debugging). */
export function getAuditLog(): ReadonlyArray<AuditLogEntry> {
  return auditStore;
}

/** Clear the in-memory audit store (for testing). */
export function clearAuditLog(): void {
  auditStore.length = 0;
}

// ── Core function ─────────────────────────────────────────────────────

/**
 * Creates an audit log entry, persists it in-memory, and logs to console.
 * When database integration is added, this function will INSERT into the
 * `audit_logs` table.
 */
export function createAuditLog(params: CreateAuditLogParams): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: randomUUID(),
    organizationId: params.organizationId ?? null,
    clinicId: params.clinicId ?? null,
    actorType: params.actorType,
    actorId: params.actorId,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId ?? null,
    metadata: params.metadata ?? {},
    ipHash: params.ipAddress ? hashIpAddress(params.ipAddress) : null,
    timestamp: new Date().toISOString(),
  };

  auditStore.push(entry);

  // Structured console output for log aggregation
  console.log(
    JSON.stringify({
      type: 'audit',
      ...entry,
    }),
  );

  return entry;
}

// ── Helpers ───────────────────────────────────────────────────────────

function resolveClientIp(c: Context): string | null {
  const forwarded = c.req.header('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() ?? null;
}

function resolveActorType(auth: AuthContext | undefined): ActorType {
  if (!auth) return 'system';
  if (auth.role === 'org_admin') return 'admin';
  if ((auth.role as string) === 'patient') return 'patient';
  return 'staff';
}

/**
 * Derive a human-readable action string from the HTTP method and path.
 * e.g. POST /api/v1/queues → "create:queues"
 */
function deriveAction(method: string, path: string): string {
  const verbMap: Record<string, string> = {
    POST: 'create',
    PUT: 'update',
    PATCH: 'update',
    DELETE: 'delete',
  };
  const verb = verbMap[method] ?? method.toLowerCase();

  // Extract the last meaningful path segment as the resource type
  const segments = path.replace(/^\/api\/v\d+\/?/, '').split('/').filter(Boolean);
  const resource = segments[0] ?? 'unknown';

  return `${verb}:${resource}`;
}

function deriveResourceType(path: string): string {
  const segments = path.replace(/^\/api\/v\d+\/?/, '').split('/').filter(Boolean);
  return segments[0] ?? 'unknown';
}

function deriveResourceId(path: string): string | null {
  const segments = path.replace(/^\/api\/v\d+\/?/, '').split('/').filter(Boolean);
  // If the second segment looks like a UUID, treat it as the resource ID
  const candidate = segments[1];
  if (candidate && /^[0-9a-f-]{36}$/i.test(candidate)) {
    return candidate;
  }
  return null;
}

// ── Middleware ─────────────────────────────────────────────────────────

/**
 * Audit logging middleware for mutation endpoints.
 *
 * Automatically creates audit entries for POST, PUT, PATCH, and DELETE
 * requests after the downstream handler completes successfully.
 */
export const auditMiddleware: MiddlewareHandler = async (c, next) => {
  const method = c.req.method.toUpperCase();

  // Only audit mutations
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    await next();
    return;
  }

  await next();

  // Only log if the response indicates success (2xx)
  const status = c.res.status;
  if (status < 200 || status >= 300) {
    return;
  }

  const auth = c.get('auth') as AuthContext | undefined;
  const path = c.req.path;

  createAuditLog({
    actorType: resolveActorType(auth),
    actorId: auth?.userId ?? 'anonymous',
    action: deriveAction(method, path),
    resourceType: deriveResourceType(path),
    resourceId: deriveResourceId(path),
    organizationId: auth?.organizationId ?? null,
    clinicId: auth?.clinicId ?? null,
    metadata: {
      method,
      path,
      statusCode: status,
    },
    ipAddress: resolveClientIp(c),
  });
};
