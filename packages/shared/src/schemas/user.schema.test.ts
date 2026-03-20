import { describe, it, expect } from 'vitest';
import { createUserSchema, updateUserSchema } from './user.schema.js';

const validUser = {
  organizationId: '123e4567-e89b-12d3-a456-426614174000',
  email: 'user@example.com',
  password: 'StrongPass123!',
  displayName: 'Test User',
  role: 'staff' as const,
};

describe('createUserSchema', () => {
  it('accepts valid input', () => {
    const result = createUserSchema.safeParse(validUser);
    expect(result.success).toBe(true);
  });

  it('defaults preferredLanguage to sv', () => {
    const result = createUserSchema.safeParse(validUser);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.preferredLanguage).toBe('sv');
    }
  });

  it('rejects password without uppercase letter', () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      password: 'weakpassword123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password that is too short', () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      password: 'Short1!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password without number', () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      password: 'StrongPassword!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password without lowercase letter', () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      password: 'STRONGPASSWORD123!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      email: 'not-valid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      role: 'superadmin',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid roles', () => {
    for (const role of ['org_admin', 'clinic_admin', 'staff'] as const) {
      const result = createUserSchema.safeParse({ ...validUser, role });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid organizationId', () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      organizationId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateUserSchema', () => {
  it('accepts valid partial update', () => {
    const result = updateUserSchema.safeParse({
      displayName: 'New Name',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = updateUserSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts role change', () => {
    const result = updateUserSchema.safeParse({
      role: 'clinic_admin',
    });
    expect(result.success).toBe(true);
  });

  it('accepts isActive toggle', () => {
    const result = updateUserSchema.safeParse({
      isActive: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email in update', () => {
    const result = updateUserSchema.safeParse({
      email: 'bad-email',
    });
    expect(result.success).toBe(false);
  });
});
