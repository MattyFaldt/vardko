import { pgTable, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';

export const superadmins = pgTable('superadmins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  totpSecret: varchar('totp_secret', { length: 255 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
