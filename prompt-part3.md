# VårdKö - Part 3 of 4: API Design, Real-Time, i18n, Display Board & Analytics

> **IMPORTANT: This is Part 3 of 4. Respond with "Ready for Part 4" after receiving this. Do NOT start coding until all parts are received.**

---

## 7. API DESIGN

### 7.1 API Versioning
All endpoints are prefixed with `/api/v1/`. The API must be fully documented with OpenAPI 3.1 spec, auto-generated from route definitions.

### 7.2 Endpoint Map

#### Public (no auth required)
```
POST   /api/v1/queue/join                    # Patient joins queue (receives session token)
GET    /api/v1/queue/status/:sessionToken     # Patient checks their position
POST   /api/v1/queue/postpone/:sessionToken   # Patient postpones their position
DELETE /api/v1/queue/leave/:sessionToken       # Patient leaves queue voluntarily
GET    /api/v1/display/:clinicSlug            # Public display board data
GET    /api/v1/clinic/:clinicSlug/info        # Clinic public info (name, language, QR validation)
WS     /api/v1/ws/patient/:sessionToken       # WebSocket for real-time patient updates
WS     /api/v1/ws/display/:clinicSlug         # WebSocket for display board updates
```

#### Staff (auth required, role: staff)
```
POST   /api/v1/staff/ready                    # Staff signals ready for next patient
POST   /api/v1/staff/complete                  # Staff marks current patient as complete
POST   /api/v1/staff/no-show                   # Staff marks patient as no-show
POST   /api/v1/staff/pause                     # Staff takes a break
POST   /api/v1/staff/resume                    # Staff resumes from break
GET    /api/v1/staff/room/status               # Staff sees their room status
WS     /api/v1/ws/staff                        # WebSocket for staff real-time updates
```

#### Clinic Admin (auth required, role: clinic_admin)
```
GET    /api/v1/admin/dashboard                 # Live dashboard data
GET    /api/v1/admin/queue                      # Full queue overview
POST   /api/v1/admin/rooms                      # Add a room
PUT    /api/v1/admin/rooms/:roomId             # Update room (rename, activate/deactivate)
DELETE /api/v1/admin/rooms/:roomId             # Remove a room
GET    /api/v1/admin/rooms                      # List all rooms with status
GET    /api/v1/admin/staff                      # List staff
POST   /api/v1/admin/staff                      # Invite/create staff user
PUT    /api/v1/admin/staff/:userId             # Update staff
DELETE /api/v1/admin/staff/:userId             # Deactivate staff
GET    /api/v1/admin/analytics/flow             # Patient flow analytics
GET    /api/v1/admin/analytics/wait-times       # Wait time analytics
GET    /api/v1/admin/analytics/rooms            # Room utilization analytics
GET    /api/v1/admin/analytics/predictions      # Prediction accuracy analytics
GET    /api/v1/admin/audit-log                  # Audit log viewer
PUT    /api/v1/admin/settings                   # Clinic settings
POST   /api/v1/admin/qr/regenerate             # Regenerate QR code secret
```

#### Org Admin (auth required, role: org_admin)
```
GET    /api/v1/org/clinics                      # List clinics in organization
POST   /api/v1/org/clinics                      # Create new clinic
PUT    /api/v1/org/clinics/:clinicId           # Update clinic
GET    /api/v1/org/analytics/overview           # Cross-clinic analytics
GET    /api/v1/org/users                        # List all users across org
```

#### SuperAdmin (auth required, separate auth flow)
```
POST   /api/v1/system/auth/login               # SuperAdmin login (2FA required)
GET    /api/v1/system/organizations             # List all organizations
POST   /api/v1/system/organizations             # Create organization
PUT    /api/v1/system/organizations/:orgId     # Update organization
GET    /api/v1/system/health                    # System health check
GET    /api/v1/system/metrics                   # System-wide metrics
```

### 7.3 Authentication Flow

**Staff/Admin login:**
```
POST /api/v1/auth/login
Body: { email, password, clinicSlug }
Response: { accessToken, refreshToken, user: { id, role, clinicId, organizationId } }
```

**Patient (no login):**
```
POST /api/v1/queue/join
Body: { clinicId, anonymousHash, language }
Headers: X-QR-Token (validates the QR code is genuine)
Response: { sessionToken, ticketNumber, position, estimatedWaitMinutes }
```

The sessionToken is a cryptographically secure random token that serves as the patient's identity for the duration of their queue visit. It expires when the ticket is completed/cancelled or after 24 hours.

### 7.4 Standard API Response Format
```typescript
// Success
{
  success: true,
  data: T,
  meta?: {
    pagination?: { page, pageSize, total, totalPages },
    timestamp: string
  }
}

// Error
{
  success: false,
  error: {
    code: string,        // machine-readable: 'QUEUE_FULL', 'UNAUTHORIZED'
    message: string,     // human-readable, localized
    details?: unknown    // additional context
  }
}
```

### 7.5 Rate Limiting
| Endpoint Category | Limit |
|---|---|
| Auth login | 5 requests / minute / IP |
| Queue join | 10 requests / minute / IP |
| Queue status | 60 requests / minute / session |
| Staff actions | 30 requests / minute / user |
| Admin endpoints | 60 requests / minute / user |
| WebSocket connections | 1 per session token |

Implemented via Redis sliding window counter.

---

## 8. REAL-TIME COMMUNICATION

### 8.1 Architecture
```
Patient Browser ←──WSS──→ API Server ←──Redis Pub/Sub──→ API Server (scaled)
Staff Browser   ←──WSS──→ API Server
Display Board   ←──WSS──→ API Server
```

### 8.2 WebSocket Channels (Redis pub/sub topics)
```
queue:{clinic_id}:updates          # Queue position changes, new patients, removals
queue:{clinic_id}:room-updates     # Room status changes (opened, paused, closed)
queue:{clinic_id}:display          # Display board specific updates
queue:{clinic_id}:staff:{user_id}  # Staff-specific notifications (patient assigned)
queue:{clinic_id}:patient:{token}  # Patient-specific (your turn, position change)
```

### 8.3 WebSocket Message Types
```typescript
type WSMessage =
  | { type: 'QUEUE_UPDATE'; data: { position: number; estimatedWait: number; queueLength: number } }
  | { type: 'YOUR_TURN'; data: { roomName: string; roomId: string } }
  | { type: 'POSITION_CHANGED'; data: { oldPosition: number; newPosition: number; estimatedWait: number } }
  | { type: 'NO_SHOW'; data: { message: string } }
  | { type: 'PATIENT_ASSIGNED'; data: { ticketNumber: number; encryptedPnr: string } }
  | { type: 'ROOM_STATUS_CHANGED'; data: { roomId: string; status: string; roomName: string } }
  | { type: 'QUEUE_STATS'; data: { waiting: number; avgWait: number; activeRooms: number } }
  | { type: 'DISPLAY_UPDATE'; data: { calledTickets: Array<{ ticketNumber: number; roomName: string }> } }
  | { type: 'HEARTBEAT'; data: {} };
```

### 8.4 Connection Management
- Heartbeat every 30 seconds, timeout after 90 seconds
- Automatic reconnection with exponential backoff on client
- Authentication validated on WebSocket upgrade
- Connection state tracked in Redis for scalability

---

## 9. INTERNATIONALIZATION (i18n)

### 9.1 Supported Languages
| Code | Language | Status |
|------|----------|--------|
| sv | Svenska (Swedish) | Primary |
| no | Norsk (Norwegian) | |
| da | Dansk (Danish) | |
| fi | Suomi (Finnish) | |
| en | English | |
| de | Deutsch (German) | |
| es | Español (Spanish) | |
| fr | Français (French) | |
| it | Italiano (Italian) | |

### 9.2 Implementation
- Use `i18next` on frontend with lazy-loaded language bundles
- API error messages are localized based on `Accept-Language` header or user preference
- Patient interface: language selected at QR scan or from browser language
- Staff/Admin interface: language from user profile setting
- Translation files in `packages/shared/src/i18n/{lang}.json`
- All user-facing strings must go through i18n — no hardcoded text

---

## 10. DISPLAY BOARD (Public TV Screen)

### 10.1 Features
A full-screen web page designed for large screens in the waiting room:
- Shows currently called ticket numbers with their assigned room
- Shows "Now serving" with animated highlight for newly called
- Shows queue length and estimated wait for next position
- Auto-rotates through information panels
- Clinic branding (name, logo)
- Current time
- Large, high-contrast, accessible text
- Language: clinic's default language
- Auto-refreshes via WebSocket (no manual refresh needed)

### 10.2 URL Pattern
```
https://{domain}/display/{clinicSlug}?token={displayToken}
```
Display token is a long-lived token specifically for display boards, generated by clinic admin. It has read-only access to queue state only.

---

## 11. ADMIN ANALYTICS DASHBOARD

### 11.1 Real-Time Metrics (Live)
- Current queue length
- Number of patients waiting
- Number of active rooms vs total rooms
- Average wait time right now
- Predicted wait time for a new patient joining now
- Staff status overview (active, on break, closed)

### 11.2 Historical Analytics (Charts)
- **Patient flow**: Line chart showing patients per hour over days/weeks
- **Wait times**: Average, median, P90 wait times per hour/day
- **Room utilization**: Stacked bar chart of room status over time (occupied, paused, empty)
- **Prediction accuracy**: Scatter plot of predicted vs actual wait times
- **No-show rates**: Bar chart over time
- **Peak hours heatmap**: Day of week × hour heatmap of patient volume
- **Service time distribution**: Histogram of per-patient service times

### 11.3 Chart Library
Use **Recharts** (React) for all charts. Data is fetched from the analytics API endpoints.

### 11.4 Smart Alerts
The admin dashboard should show intelligent alerts:
- "Queue is longer than usual for this time of day — consider opening another room"
- "Average wait time exceeds 30 minutes"
- "Room X has been paused for more than 15 minutes"
- "Patient no-show rate today is above average"

These are computed by comparing current metrics against historical baselines from `queue_statistics`.
