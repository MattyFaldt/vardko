# VårdKö - Part 4 of 4: Testing, CI/CD, Project Files & Implementation Plan

> **This is the final part. You now have all 4 parts. Read through everything carefully before proceeding.**

---

## 12. TESTING STRATEGY

### 12.1 Test Pyramid
```
         ╱  E2E Tests (Playwright)  ╲        ← few, critical flows
        ╱  Integration Tests (Vitest) ╲       ← API routes, DB queries
       ╱    Unit Tests (Vitest)        ╲      ← business logic, prediction engine
      ╱      Load Tests (k6)            ╲     ← scalability verification
```

### 12.2 Unit Tests
- **Every function in `queue-engine`** must have comprehensive unit tests
- **Prediction engine** must be tested with known datasets and expected outputs
- **All Zod schemas** must be tested with valid and invalid inputs
- **All utility functions** in `packages/shared` must be tested
- Use Vitest with coverage target: 90%+ for packages/, 80%+ for apps/

### 12.3 Integration Tests
- **Every API endpoint** must have at least one happy path and one error path test
- **Multi-tenancy isolation** must be tested: create data in Org A, verify Org B cannot access it
- **Auth flows**: login, token refresh, permission checks, rate limiting
- **Queue lifecycle**: join → wait → called → complete (full flow)
- **WebSocket**: connection, message delivery, disconnection handling
- Use testcontainers for Postgres + Redis in CI

### 12.4 E2E Tests (Playwright)
- Patient flow: scan QR → enter personnummer → see queue → get called → see room
- Staff flow: login → open room → receive patient → mark complete → receive next
- Admin flow: login → view dashboard → add room → see updated queue estimates
- Display board: verify ticket numbers and room assignments update in real-time
- Multi-language: verify language switching works on patient view

### 12.5 Load Tests (k6)
- Simulate 500 concurrent patients joining queue
- Simulate 50 staff members operating simultaneously
- WebSocket connection storm: 1000 concurrent connections
- Measure P95 response times under load

### 12.6 Security Tests
- OWASP top 10 verification
- SQL injection attempts on all inputs
- XSS attempts on patient input (personnummer field)
- CSRF verification
- JWT manipulation tests
- Rate limit verification
- Cross-tenant access attempts

---

## 13. CI/CD PIPELINE

### 13.1 GitHub Actions Workflow
```yaml
# On every push/PR:
- Lint (ESLint + Prettier)
- Type check (tsc --noEmit)
- Unit tests (Vitest)
- Integration tests (with testcontainers)
- Security audit (npm audit, Snyk)
- Build all packages and apps

# On merge to main:
- All above +
- E2E tests (Playwright)
- Deploy to staging
- Smoke tests on staging

# On release tag:
- Deploy to production
- Post-deploy health check
```

### 13.2 Environment Configuration
```
.env.development    # Local dev (docker-compose)
.env.test           # Test environment
.env.staging        # Staging
.env.production     # Production (secrets via hosting provider)
```

All secrets managed via environment variables. Never committed to git.

---

## 14. CLAUDE.md FILE

Create this as `CLAUDE.md` in the project root:

```markdown
# CLAUDE.md — VårdKö Project Conventions

## Project
VårdKö is a multi-tenant healthcare queue management system for Swedish clinics.

## Tech Stack
- Monorepo: Turborepo + pnpm
- Language: TypeScript (strict mode)
- API: Hono on Node.js
- Database: PostgreSQL via Drizzle ORM (currently hosted on Supabase, but abstracted)
- Cache/Pub-Sub: Redis
- Frontend: React + Vite
- Testing: Vitest (unit/integration), Playwright (E2E)
- i18n: i18next

## Critical Rules
1. **NEVER store personnummer** — not in DB, logs, cache, or any storage. Only HMAC hashes.
2. **NEVER import Supabase client** in business logic. All DB goes through Drizzle ORM in `packages/db`.
3. **NEVER use Supabase Realtime, Auth, or Storage** — use Redis, custom JWT auth, and abstract interfaces.
4. **ALL tenant-scoped queries** must include organization_id AND clinic_id filters.
5. **ALL mutations** must create an audit log entry.
6. **ALL user-facing strings** must go through i18n — no hardcoded text.
7. **ALL API inputs** must be validated with Zod schemas.
8. **SuperAdmin is invisible** — no regular API endpoint reveals its existence.
9. **ALL sensitive config** via environment variables — never in code.

## Code Style
- Use `const` by default, `let` only when reassignment is needed
- Prefer early returns over nested if/else
- Use named exports (not default exports)
- Error handling: use Result pattern (success/error) for business logic, throw only for unexpected errors
- Naming: camelCase for variables/functions, PascalCase for types/classes, UPPER_SNAKE for constants
- Files: kebab-case (e.g., `queue-manager.ts`)
- Each file should have a single responsibility

## Git
- Branch naming: `feat/`, `fix/`, `refactor/`, `test/`, `docs/`
- Commit messages: conventional commits (feat:, fix:, refactor:, test:, docs:, chore:)
- PR required for main branch
- Squash merge

## Testing
- Every new function needs tests
- Test files: `*.test.ts` adjacent to source
- Integration tests in `tests/integration/`
- E2E tests in `tests/e2e/`
- Minimum coverage: 80% for apps, 90% for packages

## Architecture
- packages/shared → types, schemas, constants, i18n
- packages/db → Drizzle schema, migrations, connection
- packages/queue-engine → core queue logic, prediction, assignment
- apps/api → Hono routes, middleware, WebSocket
- apps/web → React frontend
```

---

## 15. ROADMAP.md

Create this as `ROADMAP.md`:

```markdown
# VårdKö — Development Roadmap

## Phase 1: Foundation (Week 1-2)
- [ ] Monorepo setup (Turborepo, pnpm, TypeScript config)
- [ ] Docker Compose for local dev (Postgres + Redis)
- [ ] packages/shared: types, Zod schemas, constants
- [ ] packages/db: Drizzle schema, migrations, seed data
- [ ] Basic Hono API server with health check
- [ ] Environment config management
- [ ] Linting & formatting setup

## Phase 2: Auth & Multi-Tenancy (Week 2-3)
- [ ] Custom JWT auth with Argon2
- [ ] User CRUD (org admin, clinic admin, staff)
- [ ] SuperAdmin separate auth flow (with TOTP 2FA)
- [ ] PostgreSQL RLS policies for tenant isolation
- [ ] Middleware: auth, tenant context, rate limiting
- [ ] Audit logging middleware

## Phase 3: Core Queue Engine (Week 3-5)
- [ ] packages/queue-engine: queue manager
- [ ] Redis queue state management
- [ ] Patient join/leave/postpone flow
- [ ] Room management (open, pause, close)
- [ ] Patient-to-room assignment algorithm
- [ ] No-show handling
- [ ] Basic wait time prediction (default values)
- [ ] WebSocket server setup
- [ ] Real-time queue updates via Redis pub/sub

## Phase 4: Patient & Staff Frontend (Week 5-7)
- [ ] React + Vite setup with i18n
- [ ] Patient mobile view (join → wait → called → room)
- [ ] QR code generation & scanning flow
- [ ] Staff view (room management, patient handling)
- [ ] WebSocket client integration
- [ ] Responsive design (mobile-first for patients)
- [ ] E2E encrypted personnummer relay to staff

## Phase 5: Admin Dashboard (Week 7-9)
- [ ] Clinic admin dashboard (live metrics)
- [ ] Room management UI
- [ ] Staff management UI
- [ ] Analytics charts (Recharts)
- [ ] Smart alerts
- [ ] Audit log viewer
- [ ] Clinic settings
- [ ] Display board (public TV screen)

## Phase 6: Smart Prediction Engine (Week 9-10)
- [ ] Historical statistics aggregation
- [ ] Weighted prediction model implementation
- [ ] Adaptive weight calibration
- [ ] Prediction accuracy tracking
- [ ] Edge case handling (new clinic, holidays, etc.)

## Phase 7: Org Admin & SuperAdmin (Week 10-11)
- [ ] Org admin: clinic management, cross-clinic analytics
- [ ] SuperAdmin: organization management, system health
- [ ] SuperAdmin 2FA enrollment

## Phase 8: Hardening & Testing (Week 11-13)
- [ ] Comprehensive unit test suite (90%+ coverage)
- [ ] Integration test suite
- [ ] E2E test suite (Playwright)
- [ ] Load testing (k6)
- [ ] Security audit & penetration testing
- [ ] OWASP Top 10 verification
- [ ] GDPR compliance documentation
- [ ] API documentation (OpenAPI auto-generated)

## Phase 9: Deployment & Operations (Week 13-14)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Docker production build
- [ ] Vercel deployment (initial)
- [ ] Monitoring & alerting setup
- [ ] Backup strategy
- [ ] Incident response documentation

## Future Phases
- [ ] SMS/push notifications for queue updates
- [ ] Appointment scheduling (pre-booked slots)
- [ ] Multiple queue types per clinic (different services)
- [ ] AI-powered optimal room allocation
- [ ] Patient feedback collection post-visit
- [ ] Integration API for third-party EMR systems
- [ ] Native mobile app (React Native)
```

---

## 16. IMPLEMENTATION ORDER

Now that you have the full specification, here is what I want you to do:

### Step 1: Project Initialization
Set up the complete monorepo structure as defined in Section 2.2. Initialize all packages with proper TypeScript configs, set up Turborepo, create the Docker Compose file for local development (Postgres + Redis), and create the CLAUDE.md and ROADMAP.md files.

### Step 2: Shared Package
Create `packages/shared` with all TypeScript types, Zod schemas, constants, and i18n translation files (at minimum Swedish and English to start).

### Step 3: Database Package
Create `packages/db` with the full Drizzle schema as defined in Section 5, migration files, and a connection factory.

### Step 4: Queue Engine Package
Create `packages/queue-engine` with the queue manager, prediction engine, and assignment algorithm as specified in Section 6. Write comprehensive unit tests.

**Start with Steps 1-2 now. After completing them, tell me and we'll proceed with Steps 3-4.**

---

## CRITICAL REMINDERS
- This is a HEALTHCARE system — security and data privacy are paramount
- Personnummer NEVER stored — not even temporarily in a database
- Multi-tenancy isolation must be airtight
- Every mutation needs an audit trail
- All strings through i18n
- All inputs validated with Zod
- Build for portability — no vendor lock-in
- Test everything
