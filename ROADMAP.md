# VårdKö — Development Roadmap

## Phase 1: Foundation (Week 1-2)
- [x] Monorepo setup (Turborepo, pnpm, TypeScript config)
- [x] Docker Compose for local dev (Postgres + Redis)
- [x] packages/shared: types, Zod schemas, constants
- [x] packages/db: Drizzle schema, migrations, seed data
- [x] Basic Hono API server with health check
- [x] Environment config management
- [x] Linting & formatting setup

## Phase 2: Auth & Multi-Tenancy (Week 2-3)
- [x] Custom JWT auth with Argon2
- [x] User CRUD (org admin, clinic admin, staff)
- [x] SuperAdmin separate auth flow (with TOTP 2FA)
- [x] PostgreSQL RLS policies for tenant isolation
- [x] Middleware: auth, tenant context, rate limiting
- [x] Audit logging middleware

## Phase 3: Core Queue Engine (Week 3-5)
- [x] packages/queue-engine: queue manager
- [x] Redis queue state management
- [x] Patient join/leave/postpone flow
- [x] Room management (open, pause, close)
- [x] Patient-to-room assignment algorithm
- [x] No-show handling
- [x] Basic wait time prediction (default values)
- [x] WebSocket server setup
- [x] Real-time queue updates via Redis pub/sub

## Phase 4: Patient & Staff Frontend (Week 5-7)
- [x] React + Vite setup with i18n
- [x] Patient mobile view (join → wait → called → room)
- [x] QR code generation & scanning flow
- [x] Staff view (room management, patient handling)
- [x] WebSocket client integration
- [x] Responsive design (mobile-first for patients)
- [x] E2E encrypted personnummer relay to staff

## Phase 5: Admin Dashboard (Week 7-9)
- [x] Clinic admin dashboard (live metrics)
- [x] Room management UI
- [x] Staff management UI
- [x] Analytics charts (Recharts)
- [x] Smart alerts
- [x] Audit log viewer
- [x] Clinic settings
- [x] Display board (public TV screen)

## Phase 6: Smart Prediction Engine (Week 9-10)
- [x] Historical statistics aggregation
- [x] Weighted prediction model implementation
- [x] Adaptive weight calibration
- [x] Prediction accuracy tracking
- [x] Edge case handling (new clinic, holidays, etc.)

## Phase 7: Org Admin & SuperAdmin (Week 10-11)
- [x] Org admin: clinic management, cross-clinic analytics
- [x] SuperAdmin: organization management, system health
- [x] SuperAdmin 2FA enrollment

## Phase 8: Hardening & Testing (Week 11-13)
- [x] Comprehensive unit test suite (90%+ coverage)
- [x] Integration test suite
- [x] E2E test suite (Playwright)
- [x] Load testing (k6)
- [x] Security audit & penetration testing
- [x] OWASP Top 10 verification
- [x] GDPR compliance documentation
- [x] API documentation (OpenAPI auto-generated)

## Phase 9: Deployment & Operations (Week 13-14)
- [x] CI/CD pipeline (GitHub Actions)
- [x] Docker production build
- [x] Vercel deployment (initial)
- [x] Monitoring & alerting setup
- [x] Backup strategy
- [x] Incident response documentation

## Future Phases
- [ ] SMS/push notifications for queue updates
- [ ] Appointment scheduling (pre-booked slots)
- [ ] Multiple queue types per clinic (different services)
- [ ] AI-powered optimal room allocation
- [ ] Patient feedback collection post-visit
- [ ] Integration API for third-party EMR systems
- [ ] Native mobile app (React Native)
