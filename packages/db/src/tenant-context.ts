import type { Database } from './client.js';
import { sql } from 'drizzle-orm';

/**
 * Sets the tenant context for Row-Level Security (RLS) policies.
 * Must be called within a transaction before any tenant-scoped query.
 */
export async function setTenantContext(
  db: Database,
  organizationId: string,
  clinicId: string,
): Promise<void> {
  await db.execute(
    sql`SELECT set_config('app.current_organization_id', ${organizationId}, true)`,
  );
  await db.execute(
    sql`SELECT set_config('app.current_clinic_id', ${clinicId}, true)`,
  );
}

/**
 * Wraps a database operation with tenant context.
 * Uses SET LOCAL so the context is automatically cleared when the transaction ends.
 */
export async function withTenantContext<T>(
  db: Database,
  organizationId: string,
  clinicId: string,
  operation: (db: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_organization_id', ${organizationId}, true)`,
    );
    await tx.execute(
      sql`SELECT set_config('app.current_clinic_id', ${clinicId}, true)`,
    );
    return operation(tx as unknown as Database);
  });
}
