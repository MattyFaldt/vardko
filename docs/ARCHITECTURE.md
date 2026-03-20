# VårdKö Architecture Documentation

> Last updated: 2026-03-20
> Version: 1.0

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tech Stack](#2-tech-stack)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Data Flow](#4-data-flow)
5. [Multi-Tenancy Model](#5-multi-tenancy-model)
6. [Queue Engine Design](#6-queue-engine-design)
7. [Prediction Model](#7-prediction-model)
8. [Real-Time Communication](#8-real-time-communication)
9. [Database Schema Overview](#9-database-schema-overview)
10. [Deployment Architecture](#10-deployment-architecture)

---

## 1. System Overview

VårdKö (Swedish: "healthcare queue") is a real-time queue management system designed for Swedish healthcare clinics. It enables patients to join a queue via a kiosk or QR code, view their position in real-time, and receive notifications when called to a room.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Client Applications                        │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────┐ │
│  │   Patient     │  │    Staff     │  │   Admin    │  │ Display  │ │
│  │   Kiosk/QR    │  │   Dashboard  │  │   Panel    │  │  Board   │ │
│  │              │  │              │  │            │  │          │ │
│  │ - Join queue  │  │ - Call next  │  │ - Rooms    │  │ - Called │ │
│  │ - View pos.  │  │ - Complete   │  │ - Staff    │  │   tickets│ │
│  │ - Postpone   │  │ - No-show    │  │ - Stats    │  │ - Queue  │ │
│  │ - Leave      │  │ - Pause      │  │ - Audit    │  │   length │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  └────┬─────┘ │
│         │                 │                │              │       │
└─────────┼─────────────────┼────────────────┼──────────────┼───────┘
          │  HTTPS/WSS      │  HTTPS/WSS     │  HTTPS       │  WSS
          │                 │                │              │
┌─────────▼─────────────────▼────────────────▼──────────────▼───────┐
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Hono API Server                           │   │
│  │                                                             │   │
│  │  ┌──────┐ ┌──────┐ ┌────────┐ ┌───────┐ ┌──────┐ ┌──────┐│   │
│  │  │Public│ │ Auth │ │ Queue  │ │ Staff │ │Admin │ │System││   │
│  │  │Routes│ │Routes│ │ Routes │ │Routes │ │Routes│ │Routes││   │
│  │  └──────┘ └──────┘ └────────┘ └───────┘ └──────┘ └──────┘│   │
│  │                                                             │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │  Middleware: CORS │ Auth │ Tenant │ Rate Limit │ Audit │ │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────┬───────────────────────────────────┘   │
│                            │                                       │
│  ┌─────────────────────────▼───────────────────────────────────┐   │
│  │                    Queue Engine                              │   │
│  │  ┌──────────────┐  ┌────────────────┐  ┌────────────────┐  │   │
│  │  │Queue Manager │  │Wait-Time       │  │Patient         │  │   │
│  │  │(state mgmt)  │  │Predictor       │  │Assigner        │  │   │
│  │  └──────────────┘  └────────────────┘  └────────────────┘  │   │
│  └─────────────────────────┬───────────────────────────────────┘   │
│                            │                                       │
│  ┌─────────────────────────▼───────────────────────────────────┐   │
│  │              WebSocket Connection Manager                    │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │   │
│  │  │ Patient  │  │  Staff   │  │ Display  │                  │   │
│  │  │Sockets   │  │ Sockets  │  │ Sockets  │                  │   │
│  │  └──────────┘  └──────────┘  └──────────┘                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                            │                                       │
│  ┌─────────────────────────▼───────────────────────────────────┐   │
│  │                   PostgreSQL Database                        │   │
│  │            (Row-Level Security + AES-256)                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                        Server Layer                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| **React 19** | UI framework |
| **TypeScript** | Type-safe development |
| **Vite** | Build tool and dev server |
| **Tailwind CSS** | Utility-first styling |

### Backend

| Technology | Purpose |
|------------|---------|
| **Node.js** | Runtime |
| **Hono** | Lightweight HTTP framework |
| **TypeScript** | Type-safe development |
| **jose** | JWT signing and verification |
| **argon2** | Password hashing |
| **ws** | WebSocket server |

### Database

| Technology | Purpose |
|------------|---------|
| **PostgreSQL** | Primary database |
| **Drizzle ORM** | Type-safe query builder and schema management |
| **Row-Level Security** | Tenant data isolation |

### Shared

| Technology | Purpose |
|------------|---------|
| **Zod** | Runtime schema validation (shared between client and server) |
| **pnpm** | Package manager with workspace support |
| **Vitest** | Unit and integration testing |
| **Prettier** | Code formatting |

---

## 3. Monorepo Structure

VårdKö uses a pnpm workspace monorepo with the following structure:

```
queuepos/
├── apps/
│   ├── web/                    # React frontend application
│   │   ├── src/
│   │   │   ├── features/
│   │   │   │   ├── patient/    # Patient queue page (kiosk/QR)
│   │   │   │   ├── staff/      # Staff dashboard
│   │   │   │   ├── admin/      # Admin panel
│   │   │   │   ├── display/    # Public display board
│   │   │   │   ├── auth/       # Login page
│   │   │   │   ├── home/       # Landing page
│   │   │   │   └── superadmin/ # Superadmin panel
│   │   │   ├── lib/            # Auth context, WebSocket client, routing
│   │   │   └── main.tsx        # App entry point
│   │   └── vite.config.ts
│   │
│   └── api/                    # Hono API server
│       └── src/
│           ├── routes/
│           │   ├── auth/       # Login, refresh, logout
│           │   ├── queue/      # Join, status, postpone, leave
│           │   ├── staff/      # Ready, complete, no-show, pause, resume
│           │   ├── admin/      # Dashboard, rooms, staff, audit log
│           │   ├── public/     # Display board, clinic info
│           │   └── system/     # Superadmin auth, orgs, health
│           ├── middleware/
│           │   ├── auth.ts     # JWT + session token middleware
│           │   ├── tenant.ts   # Multi-tenant context
│           │   ├── rate-limit.ts # Rate limiting
│           │   ├── audit.ts    # Audit logging
│           │   └── index.ts
│           ├── ws/
│           │   ├── connection-manager.ts  # WebSocket lifecycle
│           │   └── index.ts               # WebSocket setup
│           └── index.ts        # Server entry point
│
├── packages/
│   ├── shared/                 # Shared types, schemas, constants, utils
│   │   └── src/
│   │       ├── constants/      # Roles, API codes, auth config, queue config, WS types, i18n
│   │       ├── types/          # TypeScript interfaces for all domain objects
│   │       ├── schemas/        # Zod validation schemas
│   │       ├── utils/          # Personnummer validation, HMAC hashing, API responses
│   │       └── i18n/           # Internationalization (sv, en, ar, fa, so)
│   │
│   ├── db/                     # Database schema, client, tenant context
│   │   └── src/
│   │       ├── schema/         # Drizzle table definitions
│   │       │   ├── organizations.ts
│   │       │   ├── clinics.ts
│   │       │   ├── users.ts
│   │       │   ├── superadmins.ts
│   │       │   ├── rooms.ts
│   │       │   ├── queue-tickets.ts
│   │       │   ├── queue-statistics.ts
│   │       │   └── audit-log.ts
│   │       ├── client.ts       # Database connection
│   │       ├── tenant-context.ts # RLS context helpers
│   │       └── seeds/          # Development seed data
│   │
│   └── queue-engine/           # Core queue business logic
│       └── src/
│           ├── queue-manager.ts          # State management, event emission
│           ├── events.ts                 # Event type definitions
│           ├── prediction/
│           │   └── wait-time-predictor.ts # Weighted moving average predictor
│           └── assignment/
│               └── patient-assigner.ts    # Room-patient matching
│
└── docs/                       # Project documentation
```

### Package Dependencies

```
apps/web ──────► packages/shared
apps/api ──────► packages/shared
               ► packages/db
               ► packages/queue-engine

packages/queue-engine ──► packages/shared
packages/db ──────────► (drizzle-orm, PostgreSQL driver)
packages/shared ──────► (zod, node:crypto)
```

---

## 4. Data Flow

### Patient Joins Queue

This is the core flow from when a patient arrives at a clinic to when they are called.

```
Patient at Kiosk/QR
        │
        ▼
┌─────────────────────────────┐
│ 1. Enter personnummer       │  ← Client-side only
│ 2. Validate (Luhn check)    │  ← Client-side only
│ 3. HMAC-SHA256 with         │  ← Client-side only
│    clinic dailySalt          │
│ 4. Discard personnummer     │  ← Client-side only
└────────────┬────────────────┘
             │
             │  POST /api/v1/queue/join
             │  { clinicId, anonymousHash, language }
             │
             ▼
┌─────────────────────────────┐
│ API Server                  │
│ 1. Validate input (Zod)     │
│ 2. Check duplicate hash     │
│ 3. Check queue capacity     │
│    (max 200)                │
│ 4. Generate session token   │
│    (crypto.randomBytes(64)) │
│ 5. Calculate position       │
│ 6. Predict wait time        │
│ 7. Create queue ticket      │
│ 8. Emit PATIENT_JOINED      │
│    event                    │
└────────────┬────────────────┘
             │
             │  Response: { sessionToken, ticketNumber,
             │              position, estimatedWaitMinutes }
             ▼
┌─────────────────────────────┐
│ Patient receives ticket     │
│ - Displays ticket number    │
│ - Shows position & ETA      │
│ - Opens WebSocket for       │
│   real-time updates         │
└─────────────────────────────┘
```

### Patient Gets Called

```
Staff clicks "Ready"
        │
        ▼
┌─────────────────────────────┐
│ POST /api/v1/staff/ready    │
│ 1. Identify staff (JWT)     │
│ 2. Assign room (if needed)  │
│ 3. Get next waiting patient │
│    (position = 1)           │
│ 4. Update ticket status     │
│    → "called"               │
│ 5. Update room status       │
│    → "occupied"             │
│ 6. Recalculate positions    │
│    for remaining patients   │
└────────────┬────────────────┘
             │
             ├──► WebSocket: YOUR_TURN → Patient
             │    { roomName: "Rum 1" }
             │
             ├──► WebSocket: QUEUE_UPDATE → All waiting patients
             │    { updated positions & ETAs }
             │
             ├──► WebSocket: ROOM_STATUS_CHANGED → Staff
             │
             └──► WebSocket: DISPLAY_UPDATE → Display boards
                  { calledTickets: [...] }
```

### Complete Flow Lifecycle

```
waiting ──► called ──► in_progress ──► completed
                  │                         │
                  └──► no_show              │
                                            │
waiting ──► cancelled (patient leaves)     │
                                            │
                              ┌─────────────┘
                              ▼
                    Aggregated to queue_statistics
                    (anonymized, per-hour buckets)
```

---

## 5. Multi-Tenancy Model

VårdKö uses a **shared database, shared schema** multi-tenancy model with Row-Level Security for isolation.

### Hierarchy

```
Organization (e.g., "Kungsholmen Vård AB")
    │
    ├── Clinic (e.g., "Kungsholmens Vårdcentral")
    │       ├── Rooms (Rum 1, Rum 2, Rum 3)
    │       ├── Staff (doctors, nurses)
    │       ├── Queue Tickets (daily)
    │       └── Queue Statistics (historical)
    │
    ├── Clinic (e.g., "Södermalms Vårdcentral")
    │       ├── Rooms
    │       ├── Staff
    │       └── ...
    │
    └── Organization Settings
         └── maxClinics, billing, etc.
```

### Data Isolation

Every tenant-scoped table includes `organization_id` and `clinic_id` columns:

```
organizations (1)
    └── clinics (N)
            └── users (N)
            └── rooms (N)
            └── queue_tickets (N)
            └── queue_statistics (N)
            └── audit_log (N)
```

### RLS Enforcement

```typescript
// Called at the start of every database transaction
export async function withTenantContext<T>(
  db: Database,
  organizationId: string,
  clinicId: string,
  operation: (db: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_organization_id', ${organizationId}, true)`
    );
    await tx.execute(
      sql`SELECT set_config('app.current_clinic_id', ${clinicId}, true)`
    );
    return operation(tx as unknown as Database);
  });
}
```

The `true` parameter in `set_config` makes the setting transaction-local -- it is automatically cleared when the transaction ends, preventing context leakage between requests.

---

## 6. Queue Engine Design

The queue engine (`packages/queue-engine`) is designed as a **pure business logic layer** with no I/O dependencies. All state is passed in and results are returned. Side effects (database writes, WebSocket broadcasts, Redis pub/sub) are handled by the caller.

### Architecture Principles

1. **Pure functions**: The `QueueManager` class receives state and returns new state -- no database calls, no WebSocket sends.
2. **Event-driven**: All state changes emit events via an `EventEmitter` callback. The caller translates these events into WebSocket messages and database writes.
3. **Immutable state updates**: State objects are never mutated -- new copies are returned.
4. **Testable**: The engine can be unit-tested with mock data, no infrastructure required.

### Queue Manager Operations

```
QueueManager
    │
    ├── joinQueue(state, params) → { result, newState } | { error }
    │   - Duplicate hash check
    │   - Capacity check (max 200)
    │   - Active rooms check
    │   - Wait time prediction
    │   - Emits PATIENT_JOINED
    │
    ├── callNextPatient(state) → { result, newState } | null
    │   - Finds best patient-room match
    │   - Updates ticket status → "called"
    │   - Updates room status → "occupied"
    │   - Recalculates positions
    │   - Emits PATIENT_CALLED
    │
    ├── completePatient(state, patientId, roomId) → { newState } | null
    │   - Updates ticket status → "completed"
    │   - Frees room → "open"
    │   - Emits PATIENT_COMPLETED
    │
    ├── markNoShow(state, patientId, roomId) → { newState } | null
    │   - Updates ticket status → "no_show"
    │   - Frees room → "open"
    │   - Emits PATIENT_NO_SHOW
    │
    ├── cancelPatient(state, patientId) → { newState } | null
    │   - Updates ticket status → "cancelled"
    │   - Recalculates positions
    │   - Emits PATIENT_CANCELLED
    │
    ├── postponePatient(state, patientId, positionsBack, ...) → { newState, newPosition } | { error }
    │   - Moves patient back N positions
    │   - Enforces max postponements (default 3)
    │   - Recalculates all positions
    │   - Emits PATIENT_POSTPONED
    │
    ├── openRoom / pauseRoom / resumeRoom / closeRoom
    │   - Updates room status
    │   - Emits ROOM_* events
    │
    └── getQueueStats(state) → { waitingCount, activeRooms, avgWaitMinutes, nextTicketNumber }
```

### Patient Assignment Strategy

The `patient-assigner` module handles matching patients to rooms:

1. Find waiting patients sorted by `position` (ascending).
2. Find rooms with `status === 'open'` and no current patient.
3. Assign the first waiting patient to the first available room.
4. Recalculate positions for all remaining waiting patients.

Priority is respected: patients with higher `priority` values are served before lower-priority patients at the same position.

### Ticket Status Machine

```
                    ┌──────────┐
          ┌────────►│  called  │────────┐
          │         └──────────┘        │
          │              │              │
          │              ▼              ▼
┌─────────┴──┐    ┌────────────┐  ┌──────────┐
│  waiting   │    │in_progress │  │ no_show  │
└─────────┬──┘    └─────┬──────┘  └──────────┘
          │             │
          │             ▼
          │       ┌───────────┐
          │       │ completed │
          │       └───────────┘
          │
          ▼
    ┌───────────┐
    │ cancelled │
    └───────────┘
```

Room statuses: `open` <-> `occupied` <-> `paused`, and `closed`.

---

## 7. Prediction Model

The wait-time predictor uses a **weighted moving average** of historical service times to estimate how long a patient will wait.

### Algorithm

```
PredictedServiceTime = w1 * TodayAvg + w2 * SameHourHistorical + w3 * SameDayOfWeekHistorical

EffectivePosition = PositionInQueue * (1 - NoShowProbability)

FatigueFactor = position > 20 ? 1 + (position - 20) * 0.005 : 1

EstimatedWait = (EffectivePosition * PredictedServiceTime * FatigueFactor) / ActiveRooms
```

### Weights

| Source | Default Weight | Boosted (>= 5 today samples) |
|--------|---------------|-------------------------------|
| Today's average | 0.5 | 0.6 |
| Same hour historical | 0.3 | 0.25 |
| Same day-of-week historical | 0.2 | 0.15 |

Weights are normalized when data sources are missing (e.g., if no same-hour historical data exists, the weight is redistributed to available sources).

### Confidence Levels

| Level | Criteria |
|-------|----------|
| **High** | >= 50 total samples AND >= 2 weeks of same-hour AND same-day-of-week data |
| **Medium** | >= 10 total samples |
| **Low** | < 10 total samples (falls back to default service time: 480 seconds / 8 minutes) |

### Adjustments

- **No-show probability**: Reduces effective position (some patients ahead will not show up).
- **Queue depth fatigue**: For queues > 20 patients, each additional position adds 0.5% to the per-patient time estimate. This accounts for staff fatigue and slower throughput during long shifts.

### Default Values

| Parameter | Default |
|-----------|---------|
| Default service time | 480 seconds (8 minutes) |
| Max queue size | 200 patients |
| Max postponements | 3 |
| No-show timer | 180 seconds (3 minutes) |
| Ticket expiry | 24 hours |

---

## 8. Real-Time Communication

### WebSocket Architecture

VårdKö uses native WebSocket connections managed by a `ConnectionManager` singleton:

```
ConnectionManager
    │
    ├── patients: Map<sessionToken, TrackedSocket>
    │   - One connection per queue ticket
    │   - Keyed by session token
    │
    ├── staff: Map<userId, TrackedSocket>
    │   - One connection per authenticated staff member
    │   - Keyed by user ID
    │
    ├── displays: Map<clinicSlug, Set<TrackedSocket>>
    │   - Multiple displays per clinic
    │   - Keyed by clinic slug
    │
    └── clinicMembers: Map<clinicId, Set<keys>>
        - Enables broadcast to all members of a clinic
```

### Connection Lifecycle

```
Client connects
       │
       ▼
Authenticate (session token / JWT / clinic slug)
       │
       ▼
Register in ConnectionManager
       │
       ▼
Start heartbeat ping/pong cycle (30s interval)
       │
       ├──── Receive messages (QUEUE_UPDATE, YOUR_TURN, etc.)
       │
       ├──── Connection lost → reconnect with exponential backoff
       │     (1s base, 30s max)
       │
       └──── Pong timeout (90s) → terminate connection
```

### Message Routing

| Event | Sent To |
|-------|---------|
| `QUEUE_UPDATE` | Specific patient (via sessionToken) |
| `YOUR_TURN` | Specific patient |
| `POSITION_CHANGED` | Specific patient |
| `NO_SHOW` | Specific patient |
| `PATIENT_ASSIGNED` | Specific staff member |
| `ROOM_STATUS_CHANGED` | All staff + all displays for the clinic |
| `QUEUE_STATS` | All staff + all displays for the clinic |
| `DISPLAY_UPDATE` | All displays for the clinic |
| `HEARTBEAT` | Individual connection |

### Broadcast Strategy

The `broadcastToClinic` method sends a message to every patient and staff member associated with a clinic, plus all display boards:

1. Look up `clinicMembers` set for the given `clinicId`.
2. For each member key, check if it's a patient or staff socket.
3. Send to all open connections.
4. Also send to all display sockets for the clinic slug.

### Redis Pub/Sub (Production)

For horizontal scaling across multiple API server instances, Redis pub/sub is used:

```
API Server 1 ──publish──► Redis Channel ──subscribe──► API Server 2
                              │
                              └──subscribe──► API Server 3
```

Each server subscribes to clinic-specific channels. When a queue event occurs on one server, it is published to Redis, and all servers broadcast to their locally connected clients.

---

## 9. Database Schema Overview

### Entity-Relationship Diagram

```
┌──────────────────┐       ┌──────────────────┐
│  organizations   │       │   superadmins    │
│──────────────────│       │──────────────────│
│ id (PK)          │       │ id (PK)          │
│ name             │       │ email (unique)   │
│ slug (unique)    │       │ password_hash    │
│ settings (JSONB) │       │ totp_secret      │
│ is_active        │       │ is_active        │
│ created_at       │       │ created_at       │
│ updated_at       │       └──────────────────┘
└────────┬─────────┘
         │ 1:N
         ▼
┌──────────────────┐       ┌──────────────────┐
│     clinics      │       │      users       │
│──────────────────│       │──────────────────│
│ id (PK)          │◄──────│ id (PK)          │
│ organization_id  │  1:N  │ organization_id  │
│ name             │       │ clinic_id (FK)   │
│ slug             │       │ email            │
│ address          │       │ password_hash    │
│ timezone         │       │ display_name     │
│ default_language │       │ role             │
│ settings (JSONB) │       │ preferred_lang   │
│ qr_code_secret   │       │ is_active        │
│ daily_salt       │       │ last_login_at    │
│ daily_salt_date  │       │ created_at       │
│ is_active        │       │ updated_at       │
│ created_at       │       └──────────────────┘
│ updated_at       │
└─┬──────────┬─────┘
  │          │
  │ 1:N      │ 1:N
  ▼          ▼
┌────────────────────┐   ┌──────────────────────┐
│      rooms         │   │   queue_tickets      │
│────────────────────│   │──────────────────────│
│ id (PK)            │◄──│ id (PK)              │
│ organization_id    │   │ organization_id      │
│ clinic_id (FK)     │   │ clinic_id (FK)       │
│ name               │   │ ticket_number        │
│ display_order      │   │ anonymous_hash       │
│ status             │   │ status               │
│ current_staff_id   │   │ priority             │
│ current_ticket_id  │   │ position             │
│ is_active          │   │ assigned_room_id (FK)│
│ created_at         │   │ session_token (uniq) │
│ updated_at         │   │ estimated_wait_min   │
└────────────────────┘   │ joined_at            │
                         │ called_at            │
                         │ completed_at         │
                         │ language             │
                         │ created_at           │
                         │ updated_at           │
                         └──────────────────────┘

┌──────────────────────┐   ┌──────────────────────────┐
│  queue_statistics    │   │       audit_log          │
│──────────────────────│   │──────────────────────────│
│ id (PK)              │   │ id (PK)                  │
│ organization_id      │   │ organization_id          │
│ clinic_id (FK)       │   │ clinic_id                │
│ date                 │   │ actor_type               │
│ hour_slot            │   │ actor_id                 │
│ day_of_week          │   │ action                   │
│ total_patients       │   │ resource_type            │
│ avg_service_time_s   │   │ resource_id              │
│ median_service_time_s│   │ metadata (JSONB)         │
│ p90_service_time_s   │   │ ip_hash                  │
│ avg_wait_time_s      │   │ timestamp                │
│ max_wait_time_s      │   └──────────────────────────┘
│ rooms_available      │
│ no_show_count        │   ┌──────────────────────────┐
│ postpone_count       │   │  superadmin_audit_log    │
│ created_at           │   │──────────────────────────│
└──────────────────────┘   │ id (PK)                  │
                           │ actor_id (FK→superadmins)│
                           │ action                   │
                           │ resource_type            │
                           │ resource_id              │
                           │ metadata (JSONB)         │
                           │ ip_hash                  │
                           │ timestamp                │
                           └──────────────────────────┘
```

### Key Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| `queue_tickets` | `(clinic_id, ticket_number)` UNIQUE | Prevent duplicate ticket numbers per clinic per day |
| `queue_tickets` | `session_token` UNIQUE | Fast session token lookups |
| `queue_statistics` | `(clinic_id, date, hour_slot)` UNIQUE | One stat row per clinic per hour |
| `audit_log` | `timestamp` | Time-range queries |
| `audit_log` | `(clinic_id, action)` | Filtered audit queries |
| `users` | `(organization_id, email)` UNIQUE | Prevent duplicate emails per org |
| `clinics` | `(organization_id, slug)` UNIQUE | Unique clinic slugs per org |
| `organizations` | `slug` UNIQUE | Global unique org slugs |

### Key Design Decisions

1. **UUIDs for all primary keys**: Prevents enumeration attacks and supports distributed ID generation.
2. **Timestamps with timezone**: All timestamps use `timestamptz` for correct handling across time zones.
3. **JSONB for settings/metadata**: Flexible schema for organization and clinic configuration.
4. **Soft deletes for staff**: `is_active = false` rather than physical deletion (audit trail preservation).
5. **Composite unique constraints**: Prevent business-logic duplicates at the database level.

---

## 10. Deployment Architecture

### Production Deployment

```
┌─────────────────────────────────────────────────────────┐
│                     Load Balancer                        │
│              (TLS termination, HTTPS/WSS)                │
└───────────┬─────────────────┬───────────────┬───────────┘
            │                 │               │
            ▼                 ▼               ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  API Server   │  │  API Server   │  │  API Server   │
│  Instance 1   │  │  Instance 2   │  │  Instance N   │
│               │  │               │  │               │
│  Hono + WS    │  │  Hono + WS    │  │  Hono + WS    │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                  │                   │
        └──────────┬───────┘───────────────────┘
                   │
        ┌──────────▼──────────┐
        │    Redis Cluster     │
        │  (pub/sub + cache +  │
        │   rate limit store)  │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │  PostgreSQL Primary  │
        │  (RLS + AES-256)     │
        │                      │
        │  ┌────────────────┐  │
        │  │  Read Replica   │  │
        │  │  (stats/audit)  │  │
        │  └────────────────┘  │
        └─────────────────────┘
```

### Environment Configuration

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | API server port | 3000 |
| `JWT_SECRET` | JWT signing secret | (none -- required in production) |
| `DATABASE_URL` | PostgreSQL connection string | (none -- required) |
| `REDIS_URL` | Redis connection string | (optional, in-memory fallback) |
| `CORS_ORIGIN` | Allowed frontend origin | `http://localhost:5173` |

### Scaling Considerations

- **Horizontal API scaling**: Stateless API servers behind a load balancer. WebSocket state is shared via Redis pub/sub.
- **Database read replicas**: Statistics queries and audit log reads can be routed to replicas.
- **Rate limit store**: In-memory for single-instance, Redis for multi-instance deployments.
- **WebSocket affinity**: Sticky sessions at the load balancer ensure WebSocket connections stay on the same server. Redis pub/sub handles cross-server broadcasts.
- **Queue capacity**: Each clinic supports up to 200 concurrent patients. With N clinics across the system, total capacity scales linearly.

### Monitoring

- `/api/v1/health`: Basic health check (public).
- `/api/v1/system/health`: Detailed health with uptime and memory usage (superadmin only).
- WebSocket `ConnectionManager.stats()`: Real-time connection counts (patients, staff, displays).
- Audit logs: Comprehensive trail of all state changes.

---

_This document reflects the current architecture. It is updated when significant architectural changes are made._
