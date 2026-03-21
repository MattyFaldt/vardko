# CLAUDE.md — VårdKö Project Conventions

## Project
VårdKö is a multi-tenant healthcare queue management system for Swedish clinics.
Handles patient health data — regulated under GDPR Art. 9, Patientdatalagen (PDL 2008:355), and HSLF-FS 2016:40.

**Full security architecture: @docs/SECURITY.md** — Read before any security-related change.

## Critical Rules
1. **NEVER store personnummer** — not in DB, logs, cache, or any storage. Only HMAC hashes (client-side).
2. **NEVER import Supabase client** in business logic. All DB goes through Drizzle ORM in `packages/db`.
3. **NEVER use Supabase Realtime, Auth, or Storage** — use Redis, custom JWT auth, and abstract interfaces.
4. **ALL tenant-scoped queries** must include organization_id AND clinic_id filters (enforced by RLS).
5. **ALL mutations** must create an audit log entry.
6. **ALL user-facing strings** must go through i18n — no hardcoded text.
7. **ALL API inputs** must be validated with Zod schemas.
8. **SuperAdmin is invisible** — no regular API endpoint reveals its existence.
9. **ALL sensitive config** via environment variables — never in code.

## Security Rules (NON-NEGOTIABLE)
10. **Zero PII in logs/errors**: No personnummer, names, health data, or tokens in logs or client-facing error messages.
11. **Encryption**: TLS 1.3 in transit, AES-256 at rest. JWT tokens ≤15 min, refresh via rotation.
12. **Auth on everything**: All endpoints require valid JWT unless explicitly marked `@public`.
13. **Tenant isolation at two levels**: Application middleware + PostgreSQL RLS. Both MUST be present.
14. **Parameterized queries only**: NEVER string interpolation/concatenation in SQL. No `eval()`.
15. **Rate limiting**: Required on all public endpoints. Stricter on auth endpoints.
16. **CORS**: Explicit origin whitelist — no wildcards in production.
17. **IDs**: `crypto.randomUUID()` for sensitive resources — never sequential/predictable.
18. **Dependencies**: No new dependency without checking for known vulnerabilities.
19. **GDPR compliance**: Data minimization in all API responses. DPA required for any third-party handling patient data. EU/EES hosting only. Flag immediately if a service lacks compliance.
20. **SECURITY OVERRIDES ALL** — If any rule conflicts with security/GDPR, security wins. When uncertain: ASK before writing code.

## Pre-Code Checklist (mental check before EVERY change)
- Can this function expose patient data? → Auth + tenant filter + audit log
- Am I logging anything? → Verify zero PII in output
- Sending data to third-party? → Requires DPA + EU hosting
- New DB column? → Check if PII → encrypt + retention policy
- New endpoint? → Auth middleware + Zod validation + rate limiting
- Feature needs consent? → Add consent check before storage

## Development Rules (NON-NEGOTIABLE)
21. **FULL IMPLEMENTATION ONLY** — No stubs, placeholders, TODOs, mock data, or demo versions.
22. **ZERO TEST DATA** — Never insert seed data, demo users, or fake records. Schema-only seeds OK.
23. **END-TO-END VERIFICATION** — Trace every UI flow: button → handler → API → DB → response → UI. Playwright E2E test for every flow.
24. **EVERY FUNCTION NEEDS AN API ENDPOINT** — Same endpoint for UI and external consumers.
25. **SHARED SERVICE LAYER** — Business logic in `apps/api/src/services/`. Route handlers and React components are thin wrappers.

## Tech Stack
- Monorepo: Turborepo + pnpm
- Language: TypeScript (strict mode)
- API: Hono on Node.js
- Database: PostgreSQL via Drizzle ORM (Supabase-hosted, but abstracted)
- Cache/Pub-Sub: Redis
- Frontend: React + Vite
- Testing: Vitest (unit/integration), Playwright (E2E)
- i18n: i18next

## Code Style
- `const` by default, `let` only when reassignment is needed
- Early returns over nested if/else
- Named exports (not default)
- Result pattern for business logic errors, throw only for unexpected
- camelCase vars/functions, PascalCase types, UPPER_SNAKE constants
- kebab-case files (e.g., `queue-manager.ts`)
- Single responsibility per file

## Git
- Branches: `feat/`, `fix/`, `refactor/`, `test/`, `docs/`
- Conventional commits (feat:, fix:, refactor:, test:, docs:, chore:)
- PR required for main, squash merge

## Testing
- Every new function needs tests
- Test files: `*.test.ts` adjacent to source
- Integration: `tests/integration/`, E2E: `tests/e2e/`
- Coverage: 80% apps, 90% packages
- Security-critical paths (auth, tenant isolation, PII) require dedicated test cases

## Architecture
- packages/shared → types, schemas, constants, i18n
- packages/db → Drizzle schema, migrations, connection
- packages/queue-engine → core queue logic, prediction, assignment
- apps/api → Hono routes, middleware, WebSocket
- apps/web → React frontend
