# VårdKö Security Documentation

> Last updated: 2026-03-20
> Version: 1.0
> Classification: Internal

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Authentication](#2-authentication)
3. [Authorization](#3-authorization)
4. [Data Protection](#4-data-protection)
5. [Infrastructure Security](#5-infrastructure-security)
6. [Rate Limiting](#6-rate-limiting)
7. [Audit Trail](#7-audit-trail)
8. [OWASP Top 10 Mitigations](#8-owasp-top-10-mitigations)
9. [Incident Response](#9-incident-response)
10. [Responsible Disclosure](#10-responsible-disclosure)

---

## 1. Architecture Overview

VårdKö is a multi-tenant queue management system for Swedish healthcare clinics. The security architecture follows a defense-in-depth approach with multiple layers of protection:

```
┌─────────────────────────────────────────────────────────┐
│                     Client Layer                        │
│  ┌───────────┐  ┌───────────┐  ┌────────────────────┐  │
│  │  Patient   │  │   Staff   │  │   Display Board    │  │
│  │  Browser   │  │  Browser  │  │     Browser        │  │
│  │           │  │           │  │                    │  │
│  │ PNR hash  │  │   JWT     │  │   Public data      │  │
│  │ client    │  │   auth    │  │   only             │  │
│  │ side only │  │           │  │                    │  │
│  └─────┬─────┘  └─────┬─────┘  └────────┬───────────┘  │
│        │              │                  │              │
└────────┼──────────────┼──────────────────┼──────────────┘
         │ TLS 1.3      │ TLS 1.3         │ TLS 1.3
         │              │                  │
┌────────┼──────────────┼──────────────────┼──────────────┐
│        ▼              ▼                  ▼              │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Rate Limiter (per-key)              │   │
│  └──────────────────────┬──────────────────────────┘   │
│                         │                              │
│  ┌──────────────────────▼──────────────────────────┐   │
│  │           Hono API Server (Node.js)             │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐│   │
│  │  │ JWT Auth │ │  Tenant  │ │  Audit Logging   ││   │
│  │  │Middleware│ │Middleware│ │   Middleware      ││   │
│  │  └──────────┘ └──────────┘ └──────────────────┘│   │
│  └──────────────────────┬──────────────────────────┘   │
│                         │                              │
│  ┌──────────────────────▼──────────────────────────┐   │
│  │          PostgreSQL + Row-Level Security         │   │
│  │          (AES-256 encryption at rest)            │   │
│  └─────────────────────────────────────────────────┘   │
│                    Server Layer                         │
└────────────────────────────────────────────────────────┘
```

Key security boundaries:

- **Client/Server boundary**: TLS 1.3 encryption; personnummer never crosses this boundary.
- **API/Database boundary**: Row-Level Security ensures tenant isolation at the database level.
- **Organization/Clinic isolation**: Multi-tenant architecture with RLS enforced per-transaction.

---

## 2. Authentication

### 2.1 JWT + Argon2

Staff and admin authentication uses a JWT-based flow with Argon2id password hashing:

- **Password storage**: All passwords are hashed with Argon2 (the winner of the 2015 Password Hashing Competition). Argon2's memory-hard design resists GPU and ASIC brute-force attacks.
- **JWT algorithm**: HS256 (HMAC-SHA256) with a server-side secret (minimum 32 characters).
- **Access tokens**: 15-minute expiry. Contain `userId`, `role`, `organizationId`, and `clinicId`.
- **No sensitive data in tokens**: Tokens never contain passwords, personnummer, or other PII.

### 2.2 Session Tokens

Patient authentication uses opaque session tokens:

- Generated from `crypto.randomBytes(64)` -- 128 hex characters.
- Validated via regex: `/^[a-f0-9]{64,128}$/`.
- No information about the patient is encoded in the token.
- Tokens expire after 24 hours.
- One token per queue ticket -- tokens are not reusable.

### 2.3 Refresh Token Rotation

Refresh tokens follow a rotation strategy to mitigate token theft:

1. On login, the server issues an access token + refresh token pair.
2. When the access token expires, the client sends the refresh token to `/auth/refresh`.
3. The server **invalidates the old refresh token** and issues a brand-new pair.
4. If a refresh token is used twice (indicating potential theft), all sessions for that user should be invalidated.

```
Login → accessToken (15m) + refreshToken (7d)
                                    │
                            [after 15 minutes]
                                    │
                                    ▼
Refresh → NEW accessToken (15m) + NEW refreshToken (7d)
          OLD refreshToken → INVALIDATED
```

### 2.4 Superadmin Authentication

Superadmin accounts require multi-factor authentication:

- Standard email/password (Argon2-hashed).
- TOTP (Time-based One-Time Password) -- 6-digit code.
- Superadmin JWT tokens are short-lived (15 minutes) with no refresh mechanism.
- Superadmin actions are logged in a separate `superadmin_audit_log` table.

### 2.5 Account Lockout

- After **5 failed login attempts**, the account is locked for **15 minutes**.
- Failed attempts are tracked per email address.
- Lockout state is logged in the audit trail.

---

## 3. Authorization

### 3.1 RBAC with 5 Roles

VårdKö implements Role-Based Access Control with a strict hierarchy:

| Role | Level | Permissions |
|------|-------|-------------|
| `superadmin` | 5 (highest) | Full system access; manage organizations, clinics, superadmin accounts |
| `org_admin` | 3 | Manage all clinics within an organization; manage staff, rooms, settings |
| `clinic_admin` | 2 | Manage a single clinic; manage local staff, rooms, view audit logs |
| `staff` | 1 | Operate a room; call patients, mark complete/no-show, pause/resume |
| `patient` | 0 (lowest) | Join queue, view position, postpone, leave queue |

### 3.2 Role Hierarchy

Higher roles inherit all permissions of lower roles within their scope:

```
superadmin  ─── full system access (all organizations)
     │
org_admin   ─── all clinics within their organization
     │
clinic_admin ── single clinic management
     │
staff        ── room-level operations
     │
patient      ── queue-level self-service
```

### 3.3 Tenant Isolation

Authorization is enforced at two levels:

1. **Application level**: JWT claims include `organizationId` and `clinicId`. Middleware verifies that the requested resource belongs to the user's organization/clinic.
2. **Database level**: PostgreSQL Row-Level Security policies filter all queries by `organization_id` and `clinic_id`. Even if application logic fails, the database prevents cross-tenant data access.

```sql
-- Example RLS policy (conceptual)
CREATE POLICY tenant_isolation ON queue_tickets
  USING (organization_id = current_setting('app.current_organization_id')::uuid);
```

The tenant context is set at the beginning of each database transaction via `set_config('app.current_organization_id', ...)` and is automatically cleared when the transaction ends.

---

## 4. Data Protection

### 4.1 Zero PII Storage

VårdKö is designed to store **zero patient personally identifiable information**:

- **Personnummer**: Never sent to or stored on the server. HMAC-hashed client-side.
- **Patient names**: Never collected.
- **Phone numbers**: Never collected.
- **IP addresses**: SHA-256 hashed before storage. Original IP is never written to disk.

### 4.2 HMAC Hashing

Patient identification uses HMAC-SHA256 with clinic-specific daily salts:

```
HMAC-SHA256(personnummer, clinic.dailySalt) → anonymous_hash
```

- **Algorithm**: HMAC-SHA256 (keyed hash -- not reversible without the key).
- **Salt**: Per-clinic `dailySalt` stored in the clinics table.
- **Hash output**: 64-character hexadecimal string.
- **Purpose**: Duplicate detection only (prevent same patient from joining twice).

### 4.3 Daily Salt Rotation

Each clinic's HMAC salt is rotated every 24 hours:

1. A cron job generates a new `dailySalt` using `crypto.randomBytes(32)`.
2. The `dailySaltDate` field is updated to the current date.
3. Yesterday's hashes become **cryptographically useless** -- they cannot be correlated with today's hashes.

This means that even if the database is breached:
- Hash values cannot be reversed to personnummer (HMAC is one-way with key).
- Hash values from different days cannot be correlated to the same patient.
- The window of potential exposure is limited to a single day.

### 4.4 IP Address Hashing

```typescript
function hashIpAddress(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}
```

IP addresses are SHA-256 hashed before being written to audit logs. The original IP is used transiently for rate limiting (in memory) but is never persisted.

---

## 5. Infrastructure Security

### 5.1 TLS

- **Protocol**: TLS 1.3 (minimum). TLS 1.2 and below are rejected.
- **Coverage**: All HTTP and WebSocket traffic.
- **HSTS**: Strict-Transport-Security header enabled with long max-age.
- **Certificate management**: Automated via Let's Encrypt or cloud provider.

### 5.2 Encryption at Rest

- **Database**: PostgreSQL with AES-256 transparent data encryption.
- **Backups**: Encrypted with AES-256.
- **File system**: Volume-level encryption on the host.

### 5.3 Row-Level Security (RLS)

PostgreSQL RLS is the final line of defense for tenant isolation:

- Every tenant-scoped table has RLS policies enabled.
- Policies reference session variables (`app.current_organization_id`, `app.current_clinic_id`).
- These variables are set via `SET LOCAL` within each transaction -- they cannot leak across requests.
- The application database user does not have `BYPASSRLS` privilege.

### 5.4 Network Security

- Database is not publicly accessible -- only reachable from the application server.
- API server runs behind a reverse proxy / load balancer.
- WebSocket connections are authenticated before receiving any data.
- CORS is configured to allow only the expected frontend origin.

---

## 6. Rate Limiting

### 6.1 Strategy

Rate limiting uses a sliding window counter pattern with per-key granularity:

| Category | Key | Max Requests | Window |
|----------|-----|-------------|--------|
| Login | IP address | 5 | 60s |
| Queue join | IP address | 10 | 60s |
| Queue status | Session token or IP | 60 | 60s |
| Staff actions | User ID | 30 | 60s |
| Admin endpoints | User ID | 60 | 60s |

### 6.2 Implementation

- **In-memory store** with periodic cleanup of expired entries (every 60 seconds).
- **Redis-ready interface** (`RateLimitStore`) for horizontal scaling.
- Authenticated requests are keyed by `userId`; unauthenticated by `x-forwarded-for` IP.
- Standard rate limit headers are returned on every response:
  - `X-RateLimit-Limit`: Maximum requests allowed.
  - `X-RateLimit-Remaining`: Requests remaining in the current window.
  - `X-RateLimit-Reset`: Seconds until the window resets.
  - `Retry-After`: Seconds to wait (only on 429 responses).

### 6.3 Rate Limit Response

When rate limited, the API returns HTTP 429:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Try again in 45 seconds."
  }
}
```

---

## 7. Audit Trail

### 7.1 What Is Logged

Every state-changing action is recorded in the audit log:

| Field | Description |
|-------|-------------|
| `actorType` | `staff`, `patient`, `system`, `admin`, `superadmin` |
| `actorId` | User ID or anonymized identifier |
| `action` | Action performed (e.g., `room.created`, `staff.updated`, `staff.deactivated`) |
| `resourceType` | Type of affected resource (`room`, `user`, `queue_ticket`, etc.) |
| `resourceId` | ID of the affected resource |
| `metadata` | Additional context (JSON) |
| `ipHash` | SHA-256 hash of the actor's IP address |
| `timestamp` | ISO 8601 timestamp with timezone |

### 7.2 Separate Superadmin Audit Log

Superadmin actions are logged in a dedicated `superadmin_audit_log` table, separate from clinic-level audit logs. This ensures superadmin activity is tracked independently and cannot be tampered with by organization administrators.

### 7.3 Audit Log Integrity

- Audit logs are append-only -- no update or delete operations are exposed via the API.
- Logs are indexed by timestamp and clinic/action for efficient querying.
- Retention period: 24 months.

---

## 8. OWASP Top 10 Mitigations

### A01:2021 -- Broken Access Control

- **RBAC** with 5 hierarchical roles enforced at application and database levels.
- **PostgreSQL RLS** prevents cross-tenant data access at the database layer.
- **Tenant middleware** sets organization/clinic context per request.
- **JWT claims** are verified on every authenticated request.
- **CORS** is restricted to the expected frontend origin.

### A02:2021 -- Cryptographic Failures

- **TLS 1.3** for all data in transit.
- **AES-256** encryption at rest for database and backups.
- **Argon2** for password hashing (memory-hard, brute-force resistant).
- **HMAC-SHA256** for personnummer hashing with daily salt rotation.
- **No plaintext secrets** in code -- secrets are loaded from environment variables.
- **JWT secrets** are minimum 32 characters.

### A03:2021 -- Injection

- **Drizzle ORM** with parameterized queries -- no raw SQL concatenation.
- **Zod schema validation** on all request inputs before processing.
- **TypeScript** type system catches many injection vectors at compile time.
- **No `eval()`** or dynamic code execution.

### A04:2021 -- Insecure Design

- **Privacy by Design**: Personnummer never leaves the client browser.
- **Zero PII storage**: Patient identification uses irreversible HMAC hashes.
- **Daily salt rotation**: Limits the window of potential hash correlation.
- **Defense in depth**: Multiple independent security layers (TLS, JWT, RLS, rate limiting).
- **Principle of least privilege**: Each role has only the permissions it needs.

### A05:2021 -- Security Misconfiguration

- **CORS** explicitly configured with allowed origins, methods, and headers.
- **Security headers**: HSTS, Content-Type enforcement.
- **Default-deny**: Unauthenticated requests are rejected unless the endpoint is explicitly public.
- **Environment-based configuration**: Different secrets for development and production.
- **No default credentials**: No demo accounts, seed users, or test data in any environment.

### A06:2021 -- Vulnerable and Outdated Components

- **Automated dependency scanning** via CI/CD pipeline.
- **Lock file** (pnpm-lock.yaml) ensures reproducible builds.
- **Minimal dependencies**: Core security functions use Node.js built-in `crypto` module.
- **Regular updates**: Dependencies are reviewed and updated on a regular cadence.

### A07:2021 -- Identification and Authentication Failures

- **Argon2** password hashing resists brute-force and credential stuffing.
- **Account lockout** after 5 failed attempts (15-minute cooldown).
- **Short-lived tokens** (15-minute access tokens).
- **Refresh token rotation** detects and mitigates token theft.
- **TOTP** for superadmin accounts.
- **Session tokens** are cryptographically random (128 hex characters from 64 bytes).

### A08:2021 -- Software and Data Integrity Failures

- **Signed JWTs** (HS256) -- tokens cannot be tampered with without the server secret.
- **Zod validation** ensures all input conforms to expected schemas.
- **Audit logging** records all state changes for forensic analysis.
- **Immutable audit logs** -- no update/delete API for audit entries.

### A09:2021 -- Security Logging and Monitoring Failures

- **Comprehensive audit trail** for all state-changing operations.
- **IP hashing** in logs enables abuse detection without storing PII.
- **Indexed audit logs** (timestamp + clinic/action) for efficient queries.
- **Separate superadmin audit log** prevents privilege escalation of log access.
- **System health endpoint** provides real-time monitoring data (uptime, memory usage).

### A10:2021 -- Server-Side Request Forgery (SSRF)

- **No user-controlled URLs** are fetched server-side.
- **No proxy or redirect endpoints** that could be abused for SSRF.
- **Database connections** use hardcoded connection strings (not user-provided).
- **WebSocket connections** are outbound-only from the server perspective.

---

## 9. Incident Response

### 9.1 Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| **P1 -- Critical** | Active data breach, system compromise | Immediate (within 1 hour) |
| **P2 -- High** | Vulnerability with active exploit potential | Within 4 hours |
| **P3 -- Medium** | Vulnerability without known exploit | Within 24 hours |
| **P4 -- Low** | Minor security improvement | Within 1 week |

### 9.2 Response Process

1. **Detection**: Via monitoring, audit logs, automated scanning, or external report.
2. **Triage**: Assess severity, scope, and affected data.
3. **Containment**:
   - Rotate affected secrets (JWT secrets, daily salts).
   - Invalidate all active tokens if credential compromise is suspected.
   - Isolate affected systems.
4. **Eradication**: Patch the vulnerability, deploy fix.
5. **Recovery**: Restore normal operations, verify integrity.
6. **Post-mortem**: Document root cause, timeline, and preventive measures.

### 9.3 GDPR Notification

For incidents involving personal data (staff records):

- **Supervisory authority (IMY)**: Notified within 72 hours if risk to data subjects.
- **Affected individuals**: Notified without undue delay if high risk.
- **Documentation**: Full incident report retained for compliance.

For incidents involving patient queue data:

- Since no PII is stored, the risk assessment will typically conclude low risk to individuals.
- The daily salt rotation limits the window of hash correlation.

---

## 10. Responsible Disclosure

### 10.1 Reporting a Vulnerability

If you discover a security vulnerability in VårdKö, please report it responsibly:

- **Email**: security@_[organization]_.se
- **PGP key**: Available at _[URL]_
- **Response time**: We aim to acknowledge reports within 48 hours.

### 10.2 What to Include

- Description of the vulnerability.
- Steps to reproduce.
- Potential impact assessment.
- Suggested fix (if any).

### 10.3 Our Commitment

- We will acknowledge receipt within 48 hours.
- We will provide an initial assessment within 5 business days.
- We will not take legal action against good-faith security researchers.
- We will credit reporters (if desired) in our security advisories.
- We aim to fix critical vulnerabilities within 72 hours and high-severity issues within 1 week.

### 10.4 Scope

In scope:

- VårdKö API server and all endpoints.
- WebSocket server.
- Authentication and authorization logic.
- Patient data handling and anonymization.
- Database security (RLS, encryption).

Out of scope:

- Third-party services and dependencies (report to the respective maintainers).
- Social engineering attacks.
- Denial-of-service attacks (rate limiting is in place).
- Physical security of hosting infrastructure.

---

_This document is reviewed quarterly and updated when significant changes are made to the security architecture._
