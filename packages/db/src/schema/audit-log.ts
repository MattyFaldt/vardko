import { pgTable, uuid, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { superadmins } from './superadmins.js';

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id'),
    clinicId: uuid('clinic_id'),
    actorType: varchar('actor_type', { length: 20 }).notNull(),
    actorId: varchar('actor_id', { length: 64 }).notNull(),
    action: varchar('action', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 50 }).notNull(),
    resourceId: varchar('resource_id', { length: 64 }),
    metadata: jsonb('metadata').default({}).notNull(),
    ipHash: varchar('ip_hash', { length: 64 }),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_timestamp_idx').on(table.timestamp),
    index('audit_log_clinic_action_idx').on(table.clinicId, table.action),
  ],
);

export const superadminAuditLog = pgTable('superadmin_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => superadmins.id),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 50 }).notNull(),
  resourceId: varchar('resource_id', { length: 64 }),
  metadata: jsonb('metadata').default({}).notNull(),
  ipHash: varchar('ip_hash', { length: 64 }),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
});
