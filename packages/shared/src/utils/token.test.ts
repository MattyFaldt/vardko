import { describe, it, expect } from 'vitest';
import { generateSecureToken } from './token.js';

describe('generateSecureToken', () => {
  it('returns a hex string', () => {
    const token = generateSecureToken();
    expect(token).toMatch(/^[a-f0-9]+$/);
  });

  it('returns correct length for default (64 bytes = 128 hex chars)', () => {
    const token = generateSecureToken();
    expect(token).toHaveLength(128);
  });

  it('returns correct length for custom byte count', () => {
    const token = generateSecureToken(32);
    expect(token).toHaveLength(64);
  });

  it('produces unique tokens on multiple calls', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateSecureToken());
    }
    expect(tokens.size).toBe(100);
  });

  it('returns a string of length 2 for 1 byte', () => {
    const token = generateSecureToken(1);
    expect(token).toHaveLength(2);
  });
});
