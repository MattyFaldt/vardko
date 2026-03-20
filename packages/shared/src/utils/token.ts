import { randomBytes } from 'node:crypto';

export function generateSecureToken(length: number = 64): string {
  return randomBytes(length).toString('hex');
}
