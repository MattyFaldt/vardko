import type { MiddlewareHandler } from 'hono';
import type { AuthContext } from '@vardko/shared';
import { ERROR_CODES, createErrorResponse } from '@vardko/shared';

/**
 * Tenant isolation middleware.
 *
 * Reads organizationId and clinicId from the auth context (set by authMiddleware)
 * and configures PostgreSQL session variables via SET LOCAL so that row-level
 * security policies can enforce tenant boundaries automatically.
 *
 * Must run AFTER authMiddleware in the middleware chain.
 */
export const tenantMiddleware: MiddlewareHandler = async (c, next) => {
  const auth = c.get('auth') as AuthContext | undefined;

  if (!auth) {
    return c.json(
      createErrorResponse(
        ERROR_CODES.UNAUTHORIZED,
        'Authentication required for tenant-scoped routes',
      ),
      401,
    );
  }

  const { organizationId, clinicId } = auth;

  if (!organizationId) {
    return c.json(
      createErrorResponse(
        ERROR_CODES.FORBIDDEN,
        'No organization context available',
      ),
      403,
    );
  }

  // Store tenant context for downstream handlers that need it directly
  c.set('organizationId', organizationId);
  c.set('clinicId', clinicId);

  // Build SQL statements for RLS session variables.
  // These will be executed within the request's transaction so that
  // SET LOCAL scopes the values to the current transaction only.
  const rlsStatements = [
    `SET LOCAL app.current_organization_id = '${escapeSqlLiteral(organizationId)}'`,
    clinicId
      ? `SET LOCAL app.current_clinic_id = '${escapeSqlLiteral(clinicId)}'`
      : `SET LOCAL app.current_clinic_id = ''`,
    `SET LOCAL app.current_user_id = '${escapeSqlLiteral(auth.userId)}'`,
    `SET LOCAL app.current_role = '${escapeSqlLiteral(auth.role)}'`,
  ];

  // Attach the statements so the DB layer can execute them at transaction start
  c.set('rlsStatements', rlsStatements);

  await next();
};

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Basic SQL literal escaping to prevent injection via tenant IDs.
 * UUIDs and role strings should never contain quotes, but we defend in
 * depth regardless.
 */
function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
