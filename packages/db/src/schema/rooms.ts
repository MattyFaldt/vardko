import { pgTable, uuid, varchar, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { clinics } from './clinics.js';
import { users } from './users.js';

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  clinicId: uuid('clinic_id')
    .notNull()
    .references(() => clinics.id),
  name: varchar('name', { length: 100 }).notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull().default('closed'),
  currentStaffId: uuid('current_staff_id').references(() => users.id),
  currentTicketId: uuid('current_ticket_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
