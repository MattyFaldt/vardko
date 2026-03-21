/**
 * API client for VårdKö — thin wrappers around fetch().
 * No state management here; just request/response handling.
 */

const API_BASE = '/api/v1';

// ---------------------------------------------------------------------------
// Shared response type
// ---------------------------------------------------------------------------

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

async function apiGet<T>(path: string, token?: string): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  return res.json();
}

async function apiPost<T>(path: string, body: unknown, token?: string): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiPut<T>(path: string, body: unknown, token?: string): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiDelete<T>(path: string, token?: string): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers,
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function loginApi(email: string, password: string) {
  return apiPost<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; displayName: string; email: string; role: string };
  }>('/auth/login', { email, password });
}

export async function refreshTokenApi(refreshToken: string) {
  return apiPost<{
    accessToken: string;
    refreshToken: string;
  }>('/auth/refresh', { refreshToken });
}

// ---------------------------------------------------------------------------
// Queue (patient-facing)
// ---------------------------------------------------------------------------

export async function joinQueueApi(clinicId: string, anonymousHash: string, language: string) {
  return apiPost<{
    sessionToken: string;
    ticketNumber: number;
    position: number;
    estimatedWaitMinutes: number;
  }>('/queue/join', { clinicId, anonymousHash, language });
}

export async function getQueueStatusApi(sessionToken: string) {
  return apiGet<{
    ticketNumber: number;
    position: number;
    status: string;
    estimatedWaitMinutes: number;
    assignedRoom: string | null;
  }>('/queue/status', sessionToken);
}

export async function postponeQueueApi(sessionToken: string, positionsBack: number) {
  return apiPost<{
    newPosition: number;
    estimatedWaitMinutes: number;
  }>('/queue/postpone', { positionsBack }, sessionToken);
}

export async function leaveQueueApi(sessionToken: string) {
  return apiPost<{ ok: true }>('/queue/leave', {}, sessionToken);
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export async function staffReadyApi(token: string, staffId: string) {
  return apiPost<{ ticketNumber: number; roomName: string }>(
    `/staff/${staffId}/ready`, {}, token,
  );
}

export async function staffCompleteApi(token: string, staffId: string) {
  return apiPost<{ ok: true }>(`/staff/${staffId}/complete`, {}, token);
}

export async function staffNoShowApi(token: string, staffId: string) {
  return apiPost<{ ok: true }>(`/staff/${staffId}/no-show`, {}, token);
}

export async function staffPauseApi(token: string, staffId: string) {
  return apiPost<{ ok: true }>(`/staff/${staffId}/pause`, {}, token);
}

export async function staffResumeApi(token: string, staffId: string) {
  return apiPost<{ ok: true }>(`/staff/${staffId}/resume`, {}, token);
}

export async function staffRoomStatusApi(token: string, staffId: string) {
  return apiGet<{
    roomId: string;
    roomName: string;
    status: string;
    currentTicketNumber: number | null;
  }>(`/staff/${staffId}/room`, token);
}

// ---------------------------------------------------------------------------
// Admin — Dashboard & Queue
// ---------------------------------------------------------------------------

export async function getDashboardApi(token: string) {
  return apiGet<{
    waitingCount: number;
    activeRooms: number;
    avgWaitMinutes: number;
    patientsToday: number;
    completedToday: number;
    noShowsToday: number;
    avgServiceTimeMinutes: number;
  }>('/admin/dashboard', token);
}

export async function getQueueListApi(token: string) {
  return apiGet<Array<{
    id: string;
    ticketNumber: number;
    position: number;
    status: string;
    assignedRoomId: string | null;
    estimatedWaitMinutes: number;
    joinedAt: string;
    calledAt: string | null;
  }>>('/admin/queue', token);
}

// ---------------------------------------------------------------------------
// Admin — Rooms
// ---------------------------------------------------------------------------

export async function getRoomsApi(token: string) {
  return apiGet<Array<{
    id: string;
    name: string;
    status: string;
    staffName: string | null;
    currentTicketNumber: number | null;
    isActive: boolean;
  }>>('/admin/rooms', token);
}

export async function addRoomApi(token: string, name: string, clinicId: string) {
  return apiPost<{ id: string; name: string }>('/admin/rooms', { name, clinicId }, token);
}

export async function updateRoomApi(token: string, roomId: string, updates: Record<string, unknown>) {
  return apiPut<{ ok: true }>(`/admin/rooms/${roomId}`, updates, token);
}

export async function deleteRoomApi(token: string, roomId: string) {
  return apiDelete<{ ok: true }>(`/admin/rooms/${roomId}`, token);
}

// ---------------------------------------------------------------------------
// Admin — Staff
// ---------------------------------------------------------------------------

export async function getStaffListApi(token: string) {
  return apiGet<Array<{
    id: string;
    displayName: string;
    email: string;
    role: string;
    isActive: boolean;
    assignedRoomId: string | null;
  }>>('/admin/staff', token);
}

export async function addStaffApi(token: string, data: Record<string, unknown>) {
  return apiPost<{ id: string }>('/admin/staff', data, token);
}

export async function updateStaffApi(token: string, userId: string, updates: Record<string, unknown>) {
  return apiPut<{ ok: true }>(`/admin/staff/${userId}`, updates, token);
}

export async function deleteStaffApi(token: string, userId: string) {
  return apiDelete<{ ok: true }>(`/admin/staff/${userId}`, token);
}

// ---------------------------------------------------------------------------
// Admin — Audit log
// ---------------------------------------------------------------------------

export async function getAuditLogApi(token: string) {
  return apiGet<Array<{
    id: string;
    timestamp: string;
    userId: string;
    action: string;
    details: string;
  }>>('/admin/audit-log', token);
}

// ---------------------------------------------------------------------------
// Display (public, no auth)
// ---------------------------------------------------------------------------

export async function getDisplayDataApi(clinicSlug: string) {
  return apiGet<{
    clinicName: string;
    calledTickets: Array<{ ticketNumber: number; roomName: string }>;
    waitingCount: number;
    estimatedWaitMinutes: number;
  }>(`/display/${clinicSlug}`);
}

export async function getClinicInfoApi(clinicSlug: string) {
  return apiGet<{
    id: string;
    name: string;
    slug: string;
    status: string;
  }>(`/clinics/${clinicSlug}`);
}
