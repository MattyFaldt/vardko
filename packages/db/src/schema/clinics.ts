import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const clinics = pgTable(
  'clinics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    address: text('address'),
    timezone: varchar('timezone', { length: 50 }).notNull().default('Europe/Stockholm'),
    defaultLanguage: varchar('default_language', { length: 10 }).notNull().default('sv'),
    settings: jsonb('settings').default({}).notNull(),
    qrCodeSecret: varchar('qr_code_secret', { length: 64 }).notNull(),
    dailySalt: varchar('daily_salt', { length: 64 }).notNull(),
    dailySaltDate: date('daily_salt_date').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('clinics_org_slug_unique').on(table.organizationId, table.slug)],
);
