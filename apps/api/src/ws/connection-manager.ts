import type { WebSocket } from 'ws';
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
} from '@vardko/shared';
import type { WSMessage } from '@vardko/shared';

interface TrackedSocket {
  ws: WebSocket;
  lastPong: number;
  clinicId?: string;
}

/**
 * Manages WebSocket connections for patients, staff, and display boards.
 *
 * - Patients are keyed by sessionToken (one connection per queue ticket).
 * - Staff are keyed by userId (one connection per authenticated user).
 * - Displays are keyed by clinicSlug (many displays per clinic).
 */
class ConnectionManager {
  /** sessionToken -> TrackedSocket */
  private patients = new Map<string, TrackedSocket>();

  /** userId -> TrackedSocket */
  private staff = new Map<string, TrackedSocket>();

  /** clinicSlug -> Set<TrackedSocket> */
  private displays = new Map<string, Set<TrackedSocket>>();

  /** clinicId -> Set<sessionToken | userId> for broadcasting */
  private clinicMembers = new Map<string, Set<string>>();

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // ── lifecycle ──────────────────────────────────────────────────────

  start(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => this.tick(), HEARTBEAT_INTERVAL_MS);
    console.log('[ws] connection-manager heartbeat started');
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.patients.clear();
    this.staff.clear();
    this.displays.clear();
    this.clinicMembers.clear();
    console.log('[ws] connection-manager stopped');
  }

  // ── patient connections ────────────────────────────────────────────

  addPatient(sessionToken: string, ws: WebSocket, clinicId: string): void {
    // If the patient already has an open connection, close the old one
    const existing = this.patients.get(sessionToken);
    if (existing) {
      try { existing.ws.close(1000, 'replaced'); } catch { /* already closed */ }
    }

    this.patients.set(sessionToken, { ws, lastPong: Date.now(), clinicId });
    this.addToClinic(clinicId, sessionToken);
    console.log(`[ws] patient connected: ${sessionToken.slice(0, 8)}…`);
  }

  removePatient(sessionToken: string): void {
    const tracked = this.patients.get(sessionToken);
    if (tracked?.clinicId) {
      this.removeFromClinic(tracked.clinicId, sessionToken);
    }
    this.patients.delete(sessionToken);
    console.log(`[ws] patient disconnected: ${sessionToken.slice(0, 8)}…`);
  }

  // ── staff connections ──────────────────────────────────────────────

  addStaff(userId: string, ws: WebSocket, clinicId: string): void {
    const existing = this.staff.get(userId);
    if (existing) {
      try { existing.ws.close(1000, 'replaced'); } catch { /* already closed */ }
    }

    this.staff.set(userId, { ws, lastPong: Date.now(), clinicId });
    this.addToClinic(clinicId, userId);
    console.log(`[ws] staff connected: ${userId.slice(0, 8)}…`);
  }

  removeStaff(userId: string): void {
    const tracked = this.staff.get(userId);
    if (tracked?.clinicId) {
      this.removeFromClinic(tracked.clinicId, userId);
    }
    this.staff.delete(userId);
    console.log(`[ws] staff disconnected: ${userId.slice(0, 8)}…`);
  }

  // ── display connections ────────────────────────────────────────────

  addDisplay(clinicSlug: string, ws: WebSocket): void {
    let set = this.displays.get(clinicSlug);
    if (!set) {
      set = new Set();
      this.displays.set(clinicSlug, set);
    }
    set.add({ ws, lastPong: Date.now() });
    console.log(`[ws] display connected for clinic: ${clinicSlug}`);
  }

  removeDisplay(clinicSlug: string, ws: WebSocket): void {
    const set = this.displays.get(clinicSlug);
    if (!set) return;
    for (const tracked of set) {
      if (tracked.ws === ws) {
        set.delete(tracked);
        break;
      }
    }
    if (set.size === 0) this.displays.delete(clinicSlug);
    console.log(`[ws] display disconnected for clinic: ${clinicSlug}`);
  }

  // ── messaging ──────────────────────────────────────────────────────

  sendToPatient(sessionToken: string, message: WSMessage): boolean {
    const tracked = this.patients.get(sessionToken);
    if (!tracked || tracked.ws.readyState !== 1 /* OPEN */) return false;
    tracked.ws.send(JSON.stringify(message));
    return true;
  }

  sendToStaff(userId: string, message: WSMessage): boolean {
    const tracked = this.staff.get(userId);
    if (!tracked || tracked.ws.readyState !== 1) return false;
    tracked.ws.send(JSON.stringify(message));
    return true;
  }

  sendToDisplay(clinicSlug: string, message: WSMessage): void {
    const set = this.displays.get(clinicSlug);
    if (!set) return;
    const payload = JSON.stringify(message);
    for (const tracked of set) {
      if (tracked.ws.readyState === 1) {
        tracked.ws.send(payload);
      }
    }
  }

  /**
   * Broadcast a message to every patient & staff member associated with a
   * clinic, plus all display boards for that clinic slug.
   */
  broadcastToClinic(clinicId: string, clinicSlug: string, message: WSMessage): void {
    const payload = JSON.stringify(message);
    const members = this.clinicMembers.get(clinicId);

    if (members) {
      for (const key of members) {
        const patient = this.patients.get(key);
        if (patient && patient.ws.readyState === 1) {
          patient.ws.send(payload);
          continue;
        }
        const staffMember = this.staff.get(key);
        if (staffMember && staffMember.ws.readyState === 1) {
          staffMember.ws.send(payload);
        }
      }
    }

    // Also broadcast to displays by slug
    this.sendToDisplay(clinicSlug, message);
  }

  // ── heartbeat ──────────────────────────────────────────────────────

  recordPong(ws: WebSocket): void {
    // Linear scan is fine – typical concurrent connections < 1 000
    for (const tracked of this.patients.values()) {
      if (tracked.ws === ws) { tracked.lastPong = Date.now(); return; }
    }
    for (const tracked of this.staff.values()) {
      if (tracked.ws === ws) { tracked.lastPong = Date.now(); return; }
    }
    for (const set of this.displays.values()) {
      for (const tracked of set) {
        if (tracked.ws === ws) { tracked.lastPong = Date.now(); return; }
      }
    }
  }

  // ── stats ──────────────────────────────────────────────────────────

  stats(): { patients: number; staff: number; displays: number } {
    let displayCount = 0;
    for (const set of this.displays.values()) displayCount += set.size;
    return {
      patients: this.patients.size,
      staff: this.staff.size,
      displays: displayCount,
    };
  }

  // ── internals ──────────────────────────────────────────────────────

  private addToClinic(clinicId: string, key: string): void {
    let set = this.clinicMembers.get(clinicId);
    if (!set) {
      set = new Set();
      this.clinicMembers.set(clinicId, set);
    }
    set.add(key);
  }

  private removeFromClinic(clinicId: string, key: string): void {
    const set = this.clinicMembers.get(clinicId);
    if (!set) return;
    set.delete(key);
    if (set.size === 0) this.clinicMembers.delete(clinicId);
  }

  private tick(): void {
    const now = Date.now();
    const deadline = now - HEARTBEAT_TIMEOUT_MS;

    // Patients
    for (const [token, tracked] of this.patients) {
      if (tracked.lastPong < deadline) {
        console.log(`[ws] patient timed out: ${token.slice(0, 8)}…`);
        try { tracked.ws.terminate(); } catch { /* noop */ }
        this.removePatient(token);
        continue;
      }
      try { tracked.ws.ping(); } catch { /* noop */ }
    }

    // Staff
    for (const [userId, tracked] of this.staff) {
      if (tracked.lastPong < deadline) {
        console.log(`[ws] staff timed out: ${userId.slice(0, 8)}…`);
        try { tracked.ws.terminate(); } catch { /* noop */ }
        this.removeStaff(userId);
        continue;
      }
      try { tracked.ws.ping(); } catch { /* noop */ }
    }

    // Displays
    for (const [slug, set] of this.displays) {
      for (const tracked of set) {
        if (tracked.lastPong < deadline) {
          console.log(`[ws] display timed out for clinic: ${slug}`);
          try { tracked.ws.terminate(); } catch { /* noop */ }
          set.delete(tracked);
          continue;
        }
        try { tracked.ws.ping(); } catch { /* noop */ }
      }
      if (set.size === 0) this.displays.delete(slug);
    }
  }
}

export const connectionManager = new ConnectionManager();
