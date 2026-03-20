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
