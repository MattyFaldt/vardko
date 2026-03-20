# VårdKö API Documentation

> Version: 1.0
> Last updated: 2026-03-20
> Base URL: `/api/v1`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Standard Response Format](#standard-response-format)
3. [Public Endpoints](#public-endpoints)
4. [Auth Endpoints](#auth-endpoints)
5. [Queue Endpoints](#queue-endpoints)
6. [Staff Endpoints](#staff-endpoints)
7. [Admin Endpoints](#admin-endpoints)
8. [System Endpoints](#system-endpoints)
9. [Rate Limits](#rate-limits)
10. [WebSocket Endpoints](#websocket-endpoints)
11. [Error Codes](#error-codes)

---

## Authentication

VårdKö uses two authentication mechanisms:

### JWT Bearer Token (Staff/Admin)

Staff and admin users authenticate via JWT tokens passed in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

- **Access tokens** expire after **15 minutes**.
- **Refresh tokens** expire after **7 days** and are rotated on each use.
- Tokens are signed with HS256.

### Session Token (Patients)

Patients receive a cryptographic session token when joining the queue. This token is passed as a URL parameter or in the `X-Session-Token` header:

```
X-Session-Token: <128-char-hex-string>
```

Session tokens are generated from 64 bytes of `crypto.randomBytes`, producing a 128-character hex string. They expire after 24 hours.

---

## Standard Response Format

All API responses follow a consistent envelope format.

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-03-20T10:30:00.000Z",
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

The `meta.pagination` field is only present on paginated endpoints.

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "INVALID_INPUT",
    "message": "Human-readable error description",
    "details": { ... }
  }
}
```

---

## Public Endpoints

These endpoints require no authentication.

### GET `/api/v1/display/:clinicSlug`

Get display board data for a clinic's public-facing screen.

**Parameters:**

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `clinicSlug` | path | string | Yes | Clinic URL slug |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "clinicName": "Kungsholmens Vårdcentral",
    "clinicSlug": "kungsholmen",
    "queueLength": 12,
    "rooms": [
      {
        "name": "Rum 1",
        "status": "occupied",
        "displayOrder": 1
      }
    ],
    "calledTickets": [
      {
        "ticketNumber": 42,
        "roomName": "Rum 1",
        "status": "called"
      }
    ],
    "nextTicketNumbers": [43, 44, 45, 46, 47]
  }
}
```

**Errors:** `CLINIC_NOT_FOUND` (404)

---

### GET `/api/v1/clinic/:clinicSlug/info`

Get public information about a clinic.

**Parameters:**

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `clinicSlug` | path | string | Yes | Clinic URL slug |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "00000000-0000-0000-0000-000000000010",
    "name": "Kungsholmens Vårdcentral",
    "slug": "kungsholmen",
    "address": "Hantverkargatan 11, Stockholm",
    "timezone": "Europe/Stockholm",
    "defaultLanguage": "sv",
    "isActive": true
  }
}
```

**Errors:** `CLINIC_NOT_FOUND` (404)

---

### GET `/api/v1/health`

Basic health check endpoint.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-03-20T10:30:00.000Z",
    "version": "0.0.1"
  }
}
```

---

## Auth Endpoints

### POST `/api/v1/auth/login`

Authenticate a staff/admin user and receive JWT tokens.

**Auth required:** No

**Request body:**

```json
{
  "email": "anna@kungsholmen.se",
  "password": "Admin123456!",
  "clinicSlug": "kungsholmen"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | User email address |
| `password` | string | Yes | User password |
| `clinicSlug` | string | No | Optional clinic slug for context |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "s1",
      "role": "clinic_admin",
      "clinicId": "00000000-0000-0000-0000-000000000010",
      "organizationId": "00000000-0000-0000-0000-000000000001",
      "displayName": "Anna Adminsson"
    }
  }
}
```

**Errors:** `INVALID_INPUT` (400), `INVALID_CREDENTIALS` (401), `ACCOUNT_LOCKED` (401)

---

### POST `/api/v1/auth/refresh`

Refresh an expired access token. Uses refresh token rotation -- the old refresh token is invalidated and a new pair is returned.

**Auth required:** No

**Request body:**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Errors:** `INVALID_INPUT` (400), `INVALID_TOKEN` (401), `TOKEN_EXPIRED` (401)

---

### POST `/api/v1/auth/logout`

Invalidate a refresh token.

**Auth required:** No

**Request body:**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "message": "Logged out"
  }
}
```

---

## Queue Endpoints

### POST `/api/v1/queue/join`

Join the queue at a clinic. Returns a session token for subsequent requests.

**Auth required:** No

**Request body:**

```json
{
  "clinicId": "00000000-0000-0000-0000-000000000010",
  "anonymousHash": "a1b2c3d4e5f6...64-char-hex-hmac-hash",
  "language": "sv"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `clinicId` | string (UUID) | Yes | Target clinic ID |
| `anonymousHash` | string (64 hex) | Yes | HMAC-SHA256 hash of personnummer |
| `language` | string | Yes | Patient language (`sv`, `en`, `ar`, `fa`, `so`) |

**Response (201):**

```json
{
  "success": true,
  "data": {
    "sessionToken": "a1b2c3...128-char-hex",
    "ticketNumber": 42,
    "position": 5,
    "estimatedWaitMinutes": 24
  }
}
```

**Errors:** `INVALID_INPUT` (400), `ALREADY_IN_QUEUE` (409), `QUEUE_FULL` (503), `QUEUE_CLOSED` (503)

---

### GET `/api/v1/queue/status/:sessionToken`

Check current queue position and estimated wait time.

**Auth required:** No (session token in path)

**Parameters:**

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `sessionToken` | path | string | Yes | Session token from join response |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "ticketNumber": 42,
    "position": 3,
    "estimatedWaitMinutes": 14,
    "status": "waiting",
    "queueLength": 12
  }
}
```

**Errors:** `TICKET_NOT_FOUND` (404)

---

### POST `/api/v1/queue/postpone/:sessionToken`

Move back in the queue voluntarily.

**Auth required:** No (session token in path)

**Parameters:**

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `sessionToken` | path | string | Yes | Session token |

**Request body:**

```json
{
  "positionsBack": 3
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `positionsBack` | number | Yes | Number of positions to move back |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "ticketNumber": 42,
    "position": 6,
    "estimatedWaitMinutes": 28,
    "status": "waiting"
  }
}
```

**Errors:** `TICKET_NOT_FOUND` (404), `INVALID_INPUT` (400), `MAX_POSTPONEMENTS_REACHED` (400)

---

### DELETE `/api/v1/queue/leave/:sessionToken`

Voluntarily leave the queue.

**Auth required:** No (session token in path)

**Parameters:**

| Parameter | In | Type | Required | Description |
|-----------|-----|------|----------|-------------|
| `sessionToken` | path | string | Yes | Session token |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "message": "Left queue",
    "ticketNumber": 42
  }
}
```

**Errors:** `TICKET_NOT_FOUND` (404)

---

## Staff Endpoints

All staff endpoints require JWT authentication. The staff member's identity is extracted from the JWT token.

### POST `/api/v1/staff/ready`

Signal readiness for the next patient. Automatically assigns the staff member to an available room (if not already assigned) and calls the next waiting patient.

**Auth required:** Yes (JWT Bearer)

**Response (200) -- patient called:**

```json
{
  "success": true,
  "data": {
    "ticketNumber": 42,
    "roomName": "Rum 1",
    "roomId": "room-1",
    "status": "called"
  }
}
```

**Response (200) -- no patients waiting:**

```json
{
  "success": true,
  "data": {
    "message": "No patients waiting",
    "roomName": "Rum 1"
  }
}
```

**Errors:** `UNAUTHORIZED` (401), `NO_ACTIVE_ROOM` (404), `ROOM_NOT_AVAILABLE` (409)

---

### POST `/api/v1/staff/complete`

Mark the current patient as completed and free the room.

**Auth required:** Yes (JWT Bearer)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "message": "Patient completed",
    "roomName": "Rum 1"
  }
}
```

**Errors:** `UNAUTHORIZED` (401), `NO_ACTIVE_ROOM` (404)

---

### POST `/api/v1/staff/no-show`

Mark the current patient as a no-show and free the room.

**Auth required:** Yes (JWT Bearer)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "message": "Patient marked no-show",
    "roomName": "Rum 1"
  }
}
```

**Errors:** `UNAUTHORIZED` (401), `NO_ACTIVE_ROOM` (404)

---

### POST `/api/v1/staff/pause`

Pause the staff member's room (e.g., for a break).

**Auth required:** Yes (JWT Bearer)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "message": "Room paused",
    "roomName": "Rum 1",
    "status": "paused"
  }
}
```

**Errors:** `UNAUTHORIZED` (401), `NO_ACTIVE_ROOM` (404)

---

### POST `/api/v1/staff/resume`

Resume a paused room.

**Auth required:** Yes (JWT Bearer)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "message": "Room resumed",
    "roomName": "Rum 1",
    "status": "open"
  }
}
```

**Errors:** `UNAUTHORIZED` (401), `NO_ACTIVE_ROOM` (404)

---

### GET `/api/v1/staff/room/status`

Get the current status of the staff member's assigned room.

**Auth required:** Yes (JWT Bearer)

**Response (200) -- room assigned:**

```json
{
  "success": true,
  "data": {
    "assigned": true,
    "room": {
      "id": "room-1",
      "name": "Rum 1",
      "status": "occupied"
    },
    "currentTicket": {
      "ticketNumber": 42,
      "status": "called",
      "calledAt": "2026-03-20T10:30:00.000Z"
    },
    "waitingCount": 8
  }
}
```

**Response (200) -- no room assigned:**

```json
{
  "success": true,
  "data": {
    "assigned": false,
    "room": null,
    "currentTicket": null
  }
}
```

**Errors:** `UNAUTHORIZED` (401)

---

## Admin Endpoints

All admin endpoints require JWT authentication with `clinic_admin` or `org_admin` role.

### GET `/api/v1/admin/dashboard`

Get live dashboard data for the clinic.

**Auth required:** Yes (JWT Bearer, admin role)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "clinicId": "00000000-0000-0000-0000-000000000010",
    "queueLength": 12,
    "completedToday": 45,
    "noShowsToday": 3,
    "totalRooms": 5,
    "activeRooms": 4,
    "occupiedRooms": 2,
    "averageWaitMinutes": 18
  }
}
```

---

### GET `/api/v1/admin/queue`

Get the full queue list with all ticket details.

**Auth required:** Yes (JWT Bearer, admin role)

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "ticketNumber": 42,
      "status": "waiting",
      "position": 1,
      "estimatedWaitMinutes": 8,
      "assignedRoomId": null,
      "joinedAt": "2026-03-20T10:15:00.000Z",
      "calledAt": null,
      "language": "sv"
    }
  ]
}
```

---

### GET `/api/v1/admin/rooms`

List all rooms for the clinic.

**Auth required:** Yes (JWT Bearer, admin role)

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "room-1",
      "organizationId": "uuid",
      "clinicId": "uuid",
      "name": "Rum 1",
      "displayOrder": 1,
      "status": "open",
      "currentStaffId": null,
      "currentTicketId": null,
      "isActive": true,
      "createdAt": "2026-03-20T08:00:00.000Z",
      "updatedAt": "2026-03-20T10:30:00.000Z"
    }
  ]
}
```

---

### POST `/api/v1/admin/rooms`

Create a new room.

**Auth required:** Yes (JWT Bearer, admin role)

**Request body:**

```json
{
  "clinicId": "00000000-0000-0000-0000-000000000010",
  "name": "Rum 4",
  "displayOrder": 4
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `clinicId` | string (UUID) | Yes | Clinic ID |
| `name` | string | Yes | Room display name |
| `displayOrder` | number | Yes | Display order (1-based) |

**Response (201):** Full room object.

**Errors:** `INVALID_INPUT` (400)

---

### PUT `/api/v1/admin/rooms/:roomId`

Update an existing room.

**Auth required:** Yes (JWT Bearer, admin role)

**Request body:**

```json
{
  "name": "Rum 4 (Stor)",
  "displayOrder": 4,
  "isActive": true
}
```

All fields are optional.

**Response (200):** Updated room object.

**Errors:** `NOT_FOUND` (404), `INVALID_INPUT` (400)

---

### DELETE `/api/v1/admin/rooms/:roomId`

Delete a room.

**Auth required:** Yes (JWT Bearer, admin role)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "message": "Room deleted"
  }
}
```

**Errors:** `NOT_FOUND` (404)

---

### GET `/api/v1/admin/staff`

List all staff members for the clinic.

**Auth required:** Yes (JWT Bearer, admin role)

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "s1",
      "organizationId": "uuid",
      "clinicId": "uuid",
      "email": "anna@kungsholmen.se",
      "displayName": "Anna Adminsson",
      "role": "clinic_admin",
      "isActive": true,
      "createdAt": "2026-03-20T08:00:00.000Z",
      "updatedAt": "2026-03-20T08:00:00.000Z"
    }
  ]
}
```

---

### POST `/api/v1/admin/staff`

Create a new staff member.

**Auth required:** Yes (JWT Bearer, admin role)

**Request body:**

```json
{
  "organizationId": "00000000-0000-0000-0000-000000000001",
  "clinicId": "00000000-0000-0000-0000-000000000010",
  "email": "new.staff@kungsholmen.se",
  "displayName": "Ny Medarbetare",
  "role": "staff"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `organizationId` | string (UUID) | Yes | Organization ID |
| `clinicId` | string (UUID) | No | Clinic ID (null for org-level) |
| `email` | string | Yes | Email address |
| `displayName` | string | Yes | Display name |
| `role` | string | Yes | Role: `org_admin`, `clinic_admin`, or `staff` |

**Response (201):** Full staff object.

**Errors:** `INVALID_INPUT` (400)

---

### PUT `/api/v1/admin/staff/:userId`

Update a staff member.

**Auth required:** Yes (JWT Bearer, admin role)

**Request body:**

```json
{
  "email": "updated@kungsholmen.se",
  "displayName": "Uppdaterat Namn",
  "role": "clinic_admin",
  "isActive": true
}
```

All fields are optional.

**Response (200):** Updated staff object.

**Errors:** `NOT_FOUND` (404), `INVALID_INPUT` (400)

---

### DELETE `/api/v1/admin/staff/:userId`

Deactivate a staff member (soft delete).

**Auth required:** Yes (JWT Bearer, admin role)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "message": "Staff member deactivated"
  }
}
```

**Errors:** `NOT_FOUND` (404)

---

### GET `/api/v1/admin/audit-log`

Get paginated audit log entries.

**Auth required:** Yes (JWT Bearer, admin role)

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `pageSize` | number | 20 | Items per page |

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "organizationId": "uuid",
      "clinicId": "uuid",
      "actorType": "admin",
      "actorId": "s1",
      "action": "room.created",
      "resourceType": "room",
      "resourceId": "room-4",
      "metadata": {},
      "ipHash": null,
      "timestamp": "2026-03-20T10:30:00.000Z"
    }
  ],
  "meta": {
    "timestamp": "2026-03-20T10:31:00.000Z",
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

---

## System Endpoints

System endpoints are reserved for superadmin operations.

### POST `/api/v1/system/auth/login`

Authenticate as a superadmin. Requires TOTP two-factor authentication.

**Auth required:** No

**Request body:**

```json
{
  "email": "superadmin@vardko.se",
  "password": "SuperAdmin123456!",
  "totpCode": "123456"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Superadmin email |
| `password` | string | Yes | Superadmin password |
| `totpCode` | string | Yes | 6-digit TOTP code |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "sa-1",
      "email": "superadmin@vardko.se",
      "role": "superadmin"
    }
  }
}
```

**Errors:** `INVALID_INPUT` (400), `INVALID_CREDENTIALS` (401)

---

### GET `/api/v1/system/organizations`

List all organizations in the system.

**Auth required:** Yes (JWT Bearer, superadmin role)

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "00000000-0000-0000-0000-000000000001",
      "name": "Kungsholmen Vård AB",
      "slug": "kungsholmen-vard",
      "settings": { "maxClinics": 5 },
      "isActive": true,
      "createdAt": "2026-03-20T08:00:00.000Z",
      "updatedAt": "2026-03-20T08:00:00.000Z"
    }
  ]
}
```

---

### GET `/api/v1/system/health`

Detailed system health check with memory and uptime information.

**Auth required:** Yes (JWT Bearer, superadmin role)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-03-20T10:30:00.000Z",
    "version": "0.0.1",
    "uptime": 86400,
    "memoryUsage": {
      "rss": 50331648,
      "heapTotal": 20971520,
      "heapUsed": 15728640,
      "external": 1048576
    }
  }
}
```

---

## Rate Limits

All rate-limited endpoints return standard headers:

```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 45
Retry-After: 45          (only when rate limited)
```

| Endpoint Category | Max Requests | Window | Key |
|-------------------|-------------|--------|-----|
| `AUTH_LOGIN` -- `/auth/login` | 5 | 60 seconds | IP address |
| `QUEUE_JOIN` -- `/queue/join` | 10 | 60 seconds | IP address |
| `QUEUE_STATUS` -- `/queue/status/*` | 60 | 60 seconds | Session token / IP |
| `STAFF_ACTIONS` -- `/staff/*` | 30 | 60 seconds | User ID |
| `ADMIN_ENDPOINTS` -- `/admin/*` | 60 | 60 seconds | User ID |

When rate limited, the API returns a `429 Too Many Requests` response:

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

## WebSocket Endpoints

VårdKö uses WebSocket connections for real-time updates. The WebSocket server runs on the same port as the HTTP API server.

### Connection Endpoints

| Endpoint | Description | Auth |
|----------|-------------|------|
| `ws://host/ws/patient?sessionToken=<token>` | Patient queue updates | Session token |
| `ws://host/ws/staff?token=<jwt>` | Staff room/queue updates | JWT token |
| `ws://host/ws/display?clinicSlug=<slug>` | Display board updates | None |

### Heartbeat

- **Ping interval:** 30 seconds (server sends ping frames)
- **Pong timeout:** 90 seconds (connection terminated if no pong)
- **Client reconnect:** Exponential backoff from 1s to 30s max

### Message Types

All messages are JSON-encoded with the format `{ "type": "<TYPE>", "data": { ... } }`.

#### QUEUE_UPDATE

Sent to patients when the queue state changes.

```json
{
  "type": "QUEUE_UPDATE",
  "data": {
    "position": 3,
    "estimatedWait": 14,
    "queueLength": 12
  }
}
```

#### YOUR_TURN

Sent to a patient when they are called to a room.

```json
{
  "type": "YOUR_TURN",
  "data": {
    "roomName": "Rum 1",
    "roomId": "room-1"
  }
}
```

#### POSITION_CHANGED

Sent to a patient when their position changes (e.g., due to postponement or someone leaving).

```json
{
  "type": "POSITION_CHANGED",
  "data": {
    "oldPosition": 5,
    "newPosition": 3,
    "estimatedWait": 14
  }
}
```

#### NO_SHOW

Sent to a patient marked as no-show.

```json
{
  "type": "NO_SHOW",
  "data": {
    "message": "You were marked as no-show"
  }
}
```

#### PATIENT_ASSIGNED

Sent to staff when a patient is assigned to their room.

```json
{
  "type": "PATIENT_ASSIGNED",
  "data": {
    "ticketNumber": 42,
    "encryptedPnr": ""
  }
}
```

#### ROOM_STATUS_CHANGED

Sent to staff and displays when a room's status changes.

```json
{
  "type": "ROOM_STATUS_CHANGED",
  "data": {
    "roomId": "room-1",
    "status": "occupied",
    "roomName": "Rum 1"
  }
}
```

#### QUEUE_STATS

Broadcast to staff and displays with live queue statistics.

```json
{
  "type": "QUEUE_STATS",
  "data": {
    "waiting": 12,
    "avgWait": 18,
    "activeRooms": 4
  }
}
```

#### DISPLAY_UPDATE

Sent to display boards with called ticket information.

```json
{
  "type": "DISPLAY_UPDATE",
  "data": {
    "calledTickets": [
      { "ticketNumber": 42, "roomName": "Rum 1" },
      { "ticketNumber": 43, "roomName": "Rum 3" }
    ]
  }
}
```

#### HEARTBEAT

Server heartbeat message.

```json
{
  "type": "HEARTBEAT",
  "data": {}
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `ACCOUNT_LOCKED` | 401 | Account locked after too many failed attempts |
| `TOKEN_EXPIRED` | 401 | JWT access or refresh token has expired |
| `INVALID_TOKEN` | 401 | Malformed or revoked token |
| `INVALID_INPUT` | 400 | Request body validation failed |
| `NOT_FOUND` | 404 | Requested resource does not exist |
| `QUEUE_FULL` | 503 | Queue has reached maximum capacity (200) |
| `QUEUE_CLOSED` | 503 | No active rooms -- queue is not accepting patients |
| `ALREADY_IN_QUEUE` | 409 | Patient hash already exists in the active queue |
| `MAX_POSTPONEMENTS_REACHED` | 400 | Patient has used all allowed postponements (max 3) |
| `TICKET_NOT_FOUND` | 404 | Queue ticket not found for the given session token |
| `TICKET_EXPIRED` | 400 | Queue ticket has expired (>24 hours) |
| `ROOM_NOT_AVAILABLE` | 409 | Room is already occupied or not available |
| `NO_ACTIVE_ROOM` | 404 | Staff member has no assigned room |
| `CLINIC_NOT_FOUND` | 404 | Clinic slug does not match any clinic |
| `ORGANIZATION_NOT_FOUND` | 404 | Organization not found |
| `RATE_LIMITED` | 429 | Too many requests -- retry after the specified period |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
