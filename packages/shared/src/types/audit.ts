import type { ActorType } from '../constants/roles.js';

export interface AuditLogEntry {
  id: string;
  organizationId: string | null;
  clinicId: string | null;
  actorType: ActorType;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipHash: string | null;
  timestamp: string;
}

export interface SuperAdminAuditLogEntry {
  id: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipHash: string | null;
  timestamp: string;
}
