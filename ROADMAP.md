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
