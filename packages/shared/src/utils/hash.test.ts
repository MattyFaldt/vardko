import { describe, it, expect } from 'vitest';
import { generateHmacHash, hashIpAddress } from './hash.js';

describe('generateHmacHash', () => {
  it('produces deterministic output', () => {
    const hash1 = generateHmacHash('test-data', 'test-salt');
    const hash2 = generateHmacHash('test-data', 'test-salt');
    expect(hash1).toBe(hash2);
  });

  it('produces different hash for different data', () => {
    const hash1 = generateHmacHash('data-one', 'same-salt');
    const hash2 = generateHmacHash('data-two', 'same-salt');
    expect(hash1).not.toBe(hash2);
  });

  it('produces different hash for different salt', () => {
    const hash1 = generateHmacHash('same-data', 'salt-one');
    const hash2 = generateHmacHash('same-data', 'salt-two');
    expect(hash1).not.toBe(hash2);
  });

  it('returns a 64-character hex string', () => {
    const hash = generateHmacHash('test', 'salt');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('hashIpAddress', () => {
  it('produces deterministic output', () => {
    const hash1 = hashIpAddress('192.168.1.1');
    const hash2 = hashIpAddress('192.168.1.1');
    expect(hash1).toBe(hash2);
  });

  it('produces a 64-character hex string', () => {
    const hash = hashIpAddress('10.0.0.1');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces different hashes for different IPs', () => {
    const hash1 = hashIpAddress('192.168.1.1');
    const hash2 = hashIpAddress('192.168.1.2');
    expect(hash1).not.toBe(hash2);
  });

  it('handles IPv6 addresses', () => {
    const hash = hashIpAddress('::1');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
