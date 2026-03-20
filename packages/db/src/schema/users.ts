import { pgTable, uuid, varchar, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { clinics } from './clinics.js';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    clinicId: uuid('clinic_id').references(() => clinics.id),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    role: varchar('role', { length: 20 }).notNull(),
    preferredLanguage: varchar('preferred_language', { length: 10 }).notNull().default('sv'),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('users_email_org_unique').on(table.organizationId, table.email)],
);
