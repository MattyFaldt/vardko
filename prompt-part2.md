# VårdKö - Part 2 of 4: Data Model, Multi-Tenancy & Queue Engine

> **IMPORTANT: This is Part 2 of 4. Respond with "Ready for Part 3" after receiving this. Do NOT start coding until all parts are received.**

---

## 4. MULTI-TENANCY MODEL

### 4.1 Two-Tier Tenant Hierarchy

```
SuperAdmin (hidden, system-level)
  │
  ├── Organization A (tenant level 1)
  │     ├── Clinic A1 (tenant level 2)
  │     │     ├── Admin users
  │     │     ├── Staff users
  │     │     ├── Rooms
  │     │     └── Queue data
  │     └── Clinic A2
  │           └── ...
  │
  └── Organization B
        └── Clinic B1
              └── ...
```

### 4.2 Data Isolation Strategy (ROW-LEVEL SECURITY)

Every table that contains tenant-scoped data MUST have:
```sql
organization_id UUID NOT NULL REFERENCES organizations(id),
clinic_id UUID NOT NULL REFERENCES clinics(id)
```

**PostgreSQL Row-Level Security (RLS) policies** enforce isolation at the database level:
```sql
-- Example RLS policy (applied to every tenant-scoped table)
CREATE POLICY tenant_isolation ON queue_tickets
  USING (
    organization_id = current_setting('app.current_organization_id')::uuid
    AND clinic_id = current_setting('app.current_clinic_id')::uuid
  );
```

**Every database request** sets these session variables via the middleware before any query executes:
```sql
SET LOCAL app.current_organization_id = '<org_id>';
SET LOCAL app.current_clinic_id = '<clinic_id>';
```

**Additional safeguards:**
- Application-level middleware validates tenant context on every request
- Foreign key constraints prevent orphaned cross-tenant references
- Drizzle queries always include `.where(eq(table.clinicId, ctx.clinicId))` as defense-in-depth
- Integration tests verify cross-tenant data cannot be accessed
- Unique constraints scoped to tenant where appropriate

### 4.3 User Roles & Permissions

| Role | Scope | Capabilities |
|------|-------|-------------|
| **SuperAdmin** | System-wide | Manage organizations, view system health. Hidden from all other users. Cannot see patient data. |
| **Org Admin** | Organization | Manage clinics within org, manage org-level settings. Cannot see other orgs. |
| **Clinic Admin** | Single clinic | Manage rooms, staff, view analytics, configure clinic settings. |
| **Staff** | Single clinic | Manage own room, call patients, mark done/no-show, take breaks. |
| **Patient** | Session-only | Join queue, view position, postpone position. No account needed. |

**SuperAdmin is invisible:**
- Not listed in any user query
- Has a separate authentication flow (e.g., `/system/login` — not discoverable)
- SuperAdmin actions are logged in a separate audit table
- No API endpoint reveals superadmin existence

---

## 5. DATABASE SCHEMA (Drizzle ORM)

### 5.1 Core Tables

```typescript
// organizations table
organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  settings: jsonb('settings').default({}),  // org-level config
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// clinics table
clinics = pgTable('clinics', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  address: text('address'),
  timezone: varchar('timezone', { length: 50 }).notNull().default('Europe/Stockholm'),
  defaultLanguage: varchar('default_language', { length: 10 }).notNull().default('sv'),
  settings: jsonb('settings').default({}),  // clinic-specific config
  qrCodeSecret: varchar('qr_code_secret', { length: 64 }).notNull(), // rotatable
  dailySalt: varchar('daily_salt', { length: 64 }).notNull(), // rotated daily
  dailySaltDate: date('daily_salt_date').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  orgSlugUnique: unique().on(table.organizationId, table.slug),
}));

// users table (staff & admins only — patients are NOT users)
users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  clinicId: uuid('clinic_id').references(() => clinics.id), // null for org admins
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  role: varchar('role', { length: 20 }).notNull(), // 'org_admin' | 'clinic_admin' | 'staff'
  preferredLanguage: varchar('preferred_language', { length: 10 }).notNull().default('sv'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  emailOrgUnique: unique().on(table.organizationId, table.email),
}));

// superadmins table (SEPARATE table — never joined with users)
superadmins = pgTable('superadmins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  totpSecret: varchar('totp_secret', { length: 255 }), // 2FA required
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// rooms table
rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id),
  name: varchar('name', { length: 100 }).notNull(), // "Rum 1", "Lab 3"
  displayOrder: integer('display_order').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull().default('closed'),
  // 'open' | 'occupied' | 'paused' | 'closed'
  currentStaffId: uuid('current_staff_id').references(() => users.id),
  currentTicketId: uuid('current_ticket_id'), // FK added after tickets table
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// queue_tickets table (active queue — cleaned up after completion)
queueTickets = pgTable('queue_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id),
  ticketNumber: integer('ticket_number').notNull(), // sequential per clinic per day
  anonymousHash: varchar('anonymous_hash', { length: 64 }).notNull(), // HMAC of personnummer
  status: varchar('status', { length: 20 }).notNull().default('waiting'),
  // 'waiting' | 'called' | 'in_progress' | 'completed' | 'no_show' | 'cancelled'
  priority: integer('priority').notNull().default(0), // 0 = normal, higher = deprioritized (postponed)
  position: integer('position').notNull(), // current position in queue
  assignedRoomId: uuid('assigned_room_id').references(() => rooms.id),
  sessionToken: varchar('session_token', { length: 128 }).notNull().unique(), // for patient auth
  estimatedWaitMinutes: integer('estimated_wait_minutes'),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
  calledAt: timestamp('called_at'),
  completedAt: timestamp('completed_at'),
  language: varchar('language', { length: 10 }).notNull().default('sv'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  clinicDayTicket: unique().on(table.clinicId, table.ticketNumber,
    /* partition by date — handled in application logic */),
}));

// queue_statistics table (aggregated, anonymized — for prediction engine)
queueStatistics = pgTable('queue_statistics', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id),
  date: date('date').notNull(),
  hourSlot: integer('hour_slot').notNull(), // 0-23
  dayOfWeek: integer('day_of_week').notNull(), // 0=Monday
  totalPatients: integer('total_patients').notNull().default(0),
  avgServiceTimeSeconds: integer('avg_service_time_seconds'),
  medianServiceTimeSeconds: integer('median_service_time_seconds'),
  p90ServiceTimeSeconds: integer('p90_service_time_seconds'),
  avgWaitTimeSeconds: integer('avg_wait_time_seconds'),
  maxWaitTimeSeconds: integer('max_wait_time_seconds'),
  roomsAvailable: integer('rooms_available'),
  noShowCount: integer('no_show_count').notNull().default(0),
  postponeCount: integer('postpone_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  clinicDateHour: unique().on(table.clinicId, table.date, table.hourSlot),
}));

// audit_log table
auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id'),
  clinicId: uuid('clinic_id'),
  actorType: varchar('actor_type', { length: 20 }).notNull(),
  actorId: varchar('actor_id', { length: 64 }).notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 50 }).notNull(),
  resourceId: varchar('resource_id', { length: 64 }),
  metadata: jsonb('metadata').default({}),
  ipHash: varchar('ip_hash', { length: 64 }),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
}, (table) => ({
  timestampIdx: index().on(table.timestamp),
  clinicActionIdx: index().on(table.clinicId, table.action),
}));

// superadmin_audit_log (separate — invisible to regular users)
superadminAuditLog = pgTable('superadmin_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').notNull().references(() => superadmins.id),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 50 }).notNull(),
  resourceId: varchar('resource_id', { length: 64 }),
  metadata: jsonb('metadata').default({}),
  ipHash: varchar('ip_hash', { length: 64 }),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
});
```

---

## 6. QUEUE ENGINE & PREDICTION MODEL

### 6.1 Queue Manager

The queue manager is the core of the system. It handles:
- Adding patients to the queue
- Tracking positions in real-time
- Assigning patients to available rooms
- Handling no-shows, postponements, and cancellations
- Broadcasting state changes via Redis pub/sub → WebSocket

**Queue state lives in Redis** for performance, with PostgreSQL as the source of truth:
```
Redis keys:
  queue:{clinic_id}:tickets     → Sorted set (score = position)
  queue:{clinic_id}:rooms       → Hash (room_id → status)
  queue:{clinic_id}:stats:today → Hash (running statistics for today)
  queue:{clinic_id}:lock        → Distributed lock for queue mutations
```

All queue mutations use a Redis distributed lock (Redlock pattern) to prevent race conditions.

### 6.2 Wait Time Prediction Engine

The prediction engine uses a weighted moving average model that learns from historical data:

```
EstimatedWait = PositionInQueue × PredictedServiceTime / ActiveRooms

Where PredictedServiceTime is calculated as:

PredictedServiceTime = w1 × TodayAvg + w2 × SameHourHistorical + w3 × SameDayOfWeekHistorical

Weights (adaptive):
  w1 = 0.5  (today's running average — highest weight, most recent)
  w2 = 0.3  (same hour slot from past 4 weeks)
  w3 = 0.2  (same day-of-week from past 4 weeks)

Adjustments:
  - If today's queue is moving faster than predicted: increase w1
  - If today's queue is slower: increase w1 (recent data dominates)
  - New clinic (< 2 weeks data): use conservative defaults (8 min/patient)
  - Factor in room availability changes (if room added → recalculate all)
  - Factor in no-show probability (reduces effective wait)
  - Factor in current queue depth (longer queues → slightly longer per-patient due to fatigue)
```

**Continuous learning:**
- After each completed patient visit, update today's running statistics
- Every hour, aggregate and persist to `queue_statistics` table
- At end of day, compute final daily statistics
- Prediction model recalibrates weights weekly based on actual vs predicted accuracy

**Edge cases:**
- First day of a new clinic: use 8-minute default, wide confidence interval
- Holiday or unusual day: fall back to overall clinic averages
- All rooms pause simultaneously: show "Queue paused" instead of infinite wait
- Single room: simpler prediction, no parallelism factor

### 6.3 Patient Assignment Algorithm

When a room becomes available:
1. Lock the queue (Redis distributed lock)
2. Find the next patient in queue (lowest position with status='waiting')
3. Assign patient to room, update statuses
4. Broadcast via WebSocket: patient gets "Your turn! Go to Room X", staff sees patient info
5. Start a configurable timer (e.g., 3 minutes) for patient to arrive
6. If timer expires → staff can mark no-show
7. Release lock

### 6.4 Postponement Logic

When a patient postpones:
1. Patient requests postponement with desired number of positions back (e.g., "move me 5 positions back")
2. System validates: can't postpone beyond end of queue
3. Patient's position is updated, all affected patients' positions shift
4. Estimated wait times recalculated for all affected patients
5. WebSocket broadcast updates all patient views
6. Audit log entry created

Maximum postponements per ticket: 3 (configurable per clinic)
