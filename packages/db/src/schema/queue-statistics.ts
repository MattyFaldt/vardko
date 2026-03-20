import { pgTable, uuid, integer, date, timestamp, unique } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { clinics } from './clinics.js';

export const queueStatistics = pgTable(
  'queue_statistics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id),
    date: date('date').notNull(),
    hourSlot: integer('hour_slot').notNull(),
    dayOfWeek: integer('day_of_week').notNull(),
    totalPatients: integer('total_patients').notNull().default(0),
    avgServiceTimeSeconds: integer('avg_service_time_seconds'),
    medianServiceTimeSeconds: integer('median_service_time_seconds'),
    p90ServiceTimeSeconds: integer('p90_service_time_seconds'),
    avgWaitTimeSeconds: integer('avg_wait_time_seconds'),
    maxWaitTimeSeconds: integer('max_wait_time_seconds'),
    roomsAvailable: integer('rooms_available'),
    noShowCount: integer('no_show_count').notNull().default(0),
    postponeCount: integer('postpone_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('queue_statistics_clinic_date_hour').on(table.clinicId, table.date, table.hourSlot)],
);
