import { createHmac, createHash } from 'node:crypto';

/** Generate HMAC-SHA256 hash. Used for anonymizing personnummer. */
export function generateHmacHash(data: string, salt: string): string {
  return createHmac('sha256', salt).update(data).digest('hex');
}

/** Hash an IP address for audit logging (no PII storage). */
export function hashIpAddress(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}
