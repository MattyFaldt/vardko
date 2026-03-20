import { pgTable, uuid, varchar, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { clinics } from './clinics.js';
import { rooms } from './rooms.js';

export const queueTickets = pgTable(
  'queue_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id),
    ticketNumber: integer('ticket_number').notNull(),
    anonymousHash: varchar('anonymous_hash', { length: 64 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('waiting'),
    priority: integer('priority').notNull().default(0),
    position: integer('position').notNull(),
    assignedRoomId: uuid('assigned_room_id').references(() => rooms.id),
    sessionToken: varchar('session_token', { length: 128 }).notNull().unique(),
    estimatedWaitMinutes: integer('estimated_wait_minutes'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    calledAt: timestamp('called_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    language: varchar('language', { length: 10 }).notNull().default('sv'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('queue_tickets_clinic_day_ticket').on(table.clinicId, table.ticketNumber)],
);
