# VårdKö - Healthcare Queue Management System
## Claude Code Project Setup Prompt - Part 1 of 4

> **IMPORTANT: This prompt is split into 4 parts. After receiving this part, respond with "Ready for Part 2" and wait for the next part before taking any action. Do NOT start coding until you have received all 4 parts.**

---

## 1. PROJECT OVERVIEW

You are going to help me build **VårdKö** — a multi-tenant queue management system for healthcare clinics (vårdcentraler), specifically designed for lab/blood sampling (provtagning) queues.

### Core User Flow
1. A patient arrives at the clinic and scans a QR code (unique per clinic) at reception
2. The patient enters their personal identity number (personnummer) on their phone
3. The system assigns a queue position and shows estimated wait time
4. The patient monitors their position in real-time on their phone
5. When it's their turn, they receive a clear notification with the room number
6. The staff member in that room sees the patient assignment and proceeds with sampling
7. After completion, staff marks "done" and the next patient is called

### Key Differentiators
- **Zero PII storage** — personnummer is NEVER stored, only a one-way hash used transiently
- **Smart queue prediction** — ML-inspired estimation engine that learns from historical patterns
- **Multi-tenant with two-tier isolation** — Organization → Clinic hierarchy with strict data separation
- **Healthcare-grade security** — encryption at rest and in transit, full audit trail
- **Real-time updates** — WebSocket-driven live queue status for all participants

---

## 2. ARCHITECTURE PRINCIPLES

### 2.1 Tech Stack
- **Runtime**: Node.js with TypeScript (strict mode)
- **API Framework**: Hono (lightweight, edge-compatible)
- **Database**: PostgreSQL via Supabase (but abstracted — no direct Supabase client dependency in business logic)
- **Real-time**: WebSocket server (ws library or Hono WebSocket) — NOT Supabase Realtime (to stay portable)
- **Cache/Pub-Sub**: Redis (for queue state, real-time pub/sub, rate limiting)
- **Auth**: JWT-based with refresh tokens. Passwords hashed with Argon2
- **ORM/Query**: Drizzle ORM (SQL-like, type-safe, portable across Postgres providers)
- **Hosting**: Vercel (initially) but architected for portability (Docker-ready)
- **Monorepo**: Turborepo with pnpm workspaces

### 2.2 Repository Structure
```
vardko/
├── CLAUDE.md                    # Claude Code conventions & rules
├── ROADMAP.md                   # Feature roadmap with phases
├── turbo.json                   # Turborepo config
├── pnpm-workspace.yaml
├── docker-compose.yml           # Local dev (Postgres + Redis)
├── docker-compose.prod.yml      # Production deployment option
├── Dockerfile                   # Multi-stage production build
│
├── packages/
│   ├── shared/                  # Shared types, constants, validation schemas
│   │   ├── src/
│   │   │   ├── types/           # TypeScript interfaces & types
│   │   │   ├── schemas/         # Zod validation schemas
│   │   │   ├── constants/       # Enums, config constants
│   │   │   ├── i18n/            # Translation strings (all supported languages)
│   │   │   └── utils/           # Pure utility functions
│   │   └── package.json
│   │
│   ├── db/                      # Database layer (Drizzle ORM)
│   │   ├── src/
│   │   │   ├── schema/          # Drizzle table definitions
│   │   │   ├── migrations/      # SQL migrations
│   │   │   ├── seeds/           # Test/dev seed data
│   │   │   └── client.ts        # DB connection factory
│   │   └── package.json
│   │
│   └── queue-engine/            # Core queue logic & prediction engine
│       ├── src/
│       │   ├── queue-manager.ts
│       │   ├── prediction/      # Wait time prediction engine
│       │   ├── assignment/      # Patient-to-room assignment logic
│       │   └── events.ts        # Domain events
│       └── package.json
│
├── apps/
│   ├── api/                     # Hono API server
│   │   ├── src/
│   │   │   ├── index.ts         # Entry point
│   │   │   ├── middleware/       # Auth, tenant isolation, rate limiting, audit
│   │   │   ├── routes/          # Route handlers grouped by domain
│   │   │   │   ├── auth/
│   │   │   │   ├── queue/       # Patient-facing queue endpoints
│   │   │   │   ├── staff/       # Staff room management
│   │   │   │   ├── admin/       # Clinic admin endpoints
│   │   │   │   ├── superadmin/  # System admin (hidden)
│   │   │   │   └── public/      # QR code, display board
│   │   │   ├── ws/              # WebSocket handlers
│   │   │   └── services/        # Business logic services
│   │   └── package.json
│   │
│   ├── web/                     # Frontend (React + Vite or Next.js)
│   │   ├── src/
│   │   │   ├── features/
│   │   │   │   ├── patient/     # Patient mobile queue view
│   │   │   │   ├── staff/       # Staff room management view
│   │   │   │   ├── admin/       # Clinic admin dashboard
│   │   │   │   ├── display/     # Public display board (TV screen)
│   │   │   │   ├── superadmin/  # System admin (hidden route)
│   │   │   │   └── auth/        # Login/registration
│   │   │   ├── components/      # Shared UI components
│   │   │   ├── hooks/           # Custom React hooks
│   │   │   ├── i18n/            # i18next setup
│   │   │   └── lib/             # API client, WebSocket client, utils
│   │   └── package.json
│   │
│   └── docs/                    # API documentation (auto-generated OpenAPI)
│       └── package.json
│
├── tests/
│   ├── unit/                    # Unit tests (Vitest)
│   ├── integration/             # API integration tests
│   ├── e2e/                     # Playwright E2E tests
│   └── load/                    # k6 load tests
│
└── scripts/
    ├── setup.sh                 # Dev environment setup
    ├── generate-qr.ts           # QR code generation utility
    └── migrate.ts               # Database migration runner
```

### 2.3 Abstraction & Portability Rules
- **NEVER import Supabase client directly in business logic or routes.** All DB access goes through the `packages/db` layer using Drizzle ORM.
- **NEVER use Supabase Realtime.** Use Redis pub/sub + WebSocket for real-time features.
- **NEVER use Supabase Auth.** Implement custom JWT auth with Argon2 password hashing.
- **NEVER use Supabase Storage.** If file storage is needed later, abstract behind an interface.
- Supabase is ONLY a managed Postgres database. The connection string is the only Supabase-specific configuration.
- All infrastructure dependencies must be behind interfaces/adapters for future portability.

---

## 3. SECURITY & GDPR — CRITICAL REQUIREMENTS

### 3.1 Personnummer Handling (ZERO STORAGE POLICY)

**The personnummer (Swedish personal identity number) must NEVER be stored in the database, logs, cache, or any persistent storage.**

Here is the privacy-preserving flow:

```
Patient enters personnummer on phone
         │
         ▼
┌─────────────────────────────────────┐
│  CLIENT-SIDE (patient's browser)    │
│                                     │
│  1. Validate format (YYYYMMDD-XXXX) │
│  2. Generate: hash = HMAC-SHA256(   │
│       personnummer,                 │
│       clinic_daily_salt             │
│     )                               │
│  3. Send ONLY the hash to server    │
│  4. Personnummer stays in browser   │
│     memory only (never localStorage)│
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  SERVER                             │
│                                     │
│  - Receives ONLY the HMAC hash      │
│  - Uses hash as anonymous patient   │
│    identifier for this session      │
│  - Hash is NOT reversible           │
│  - Daily salt rotation = hash is    │
│    only valid today                 │
│  - Hash is deleted when patient     │
│    leaves queue                     │
└─────────────────────────────────────┘
```

**Staff display**: When staff needs to identify the patient (to call them by name or verify identity), the personnummer is transmitted via an **ephemeral encrypted WebSocket message** directly from the patient's browser to the staff browser. The server relays only the encrypted blob — it cannot decrypt it. This uses client-side encryption with a key derived from the queue token.

**Compliance proof points:**
- Server logs never contain personnummer
- Database has no personnummer column anywhere
- The HMAC hash is a one-way function — cannot be reversed
- Daily salt rotation means yesterday's hashes are useless
- The hash is deleted when the queue ticket expires
- Staff sees personnummer only via E2E encrypted channel
- Full audit trail of all system actions (without PII)

### 3.2 Encryption
- **In transit**: TLS 1.3 enforced for all connections
- **At rest**: PostgreSQL with encryption at rest (AES-256), managed by hosting provider
- **Application-level**: Sensitive fields encrypted with AES-256-GCM before storage
- **WebSocket**: WSS only (encrypted WebSocket)

### 3.3 Security Hardening
- All API inputs validated with Zod schemas
- Rate limiting on all endpoints (stricter on auth endpoints)
- CORS restricted to known origins
- CSP headers configured
- SQL injection prevented by Drizzle ORM parameterized queries
- XSS prevention via React's default escaping + CSP
- CSRF protection with SameSite cookies + CSRF tokens
- Helmet.js equivalent headers
- Dependency vulnerability scanning in CI/CD
- No secrets in code — all via environment variables
- JWT tokens: short-lived access (15min) + refresh tokens (7 days, rotated)
- Brute force protection on login (progressive delays + lockout)
- WebSocket authentication on connection
- API versioning from day one (v1)

### 3.4 Audit Trail
Every mutation in the system creates an audit log entry:
```typescript
{
  id: uuid,
  timestamp: ISO8601,
  tenant_id: uuid,        // organization
  clinic_id: uuid,        // clinic
  actor_type: 'staff' | 'patient' | 'system' | 'admin' | 'superadmin',
  actor_id: string,       // user ID (never personnummer)
  action: string,         // e.g., 'queue.join', 'room.pause', 'patient.called'
  resource_type: string,  // e.g., 'queue_ticket', 'room'
  resource_id: string,
  metadata: jsonb,        // additional context (no PII)
  ip_hash: string         // hashed IP for security analysis
}
```
