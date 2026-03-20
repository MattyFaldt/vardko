import { describe, it, expect } from 'vitest';
import { loginSchema, refreshTokenSchema, superAdminLoginSchema } from './auth.schema.js';

describe('loginSchema', () => {
  it('accepts valid input', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'mypassword',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid input with optional clinicSlug', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'mypassword',
      clinicSlug: 'kungsholmen',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing email', () => {
    const result = loginSchema.safeParse({
      password: 'mypassword',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing password', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'mypassword',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('refreshTokenSchema', () => {
  it('accepts valid refresh token', () => {
    const result = refreshTokenSchema.safeParse({
      refreshToken: 'some-valid-token-string',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty string', () => {
    const result = refreshTokenSchema.safeParse({
      refreshToken: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing refreshToken', () => {
    const result = refreshTokenSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('superAdminLoginSchema', () => {
  it('accepts valid input with 6-digit TOTP', () => {
    const result = superAdminLoginSchema.safeParse({
      email: 'admin@example.com',
      password: 'superpassword',
      totpCode: '123456',
    });
    expect(result.success).toBe(true);
  });

  it('rejects TOTP that is not 6 digits', () => {
    const result = superAdminLoginSchema.safeParse({
      email: 'admin@example.com',
      password: 'superpassword',
      totpCode: '12345',
    });
    expect(result.success).toBe(false);
  });

  it('rejects TOTP with non-numeric characters', () => {
    const result = superAdminLoginSchema.safeParse({
      email: 'admin@example.com',
      password: 'superpassword',
      totpCode: 'abcdef',
    });
    expect(result.success).toBe(false);
  });

  it('rejects TOTP that is too long', () => {
    const result = superAdminLoginSchema.safeParse({
      email: 'admin@example.com',
      password: 'superpassword',
      totpCode: '1234567',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing totpCode', () => {
    const result = superAdminLoginSchema.safeParse({
      email: 'admin@example.com',
      password: 'superpassword',
    });
    expect(result.success).toBe(false);
  });
});
