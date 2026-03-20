import { describe, it, expect } from 'vitest';
import { createOrganizationSchema, updateOrganizationSchema } from './organization.schema.js';

describe('createOrganizationSchema', () => {
  it('accepts valid input', () => {
    const result = createOrganizationSchema.safeParse({
      name: 'My Organization',
      slug: 'my-organization',
    });
    expect(result.success).toBe(true);
  });

  it('provides default settings when not specified', () => {
    const result = createOrganizationSchema.safeParse({
      name: 'My Organization',
      slug: 'my-org',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.settings).toEqual({});
    }
  });

  it('accepts valid input with settings', () => {
    const result = createOrganizationSchema.safeParse({
      name: 'My Organization',
      slug: 'my-org',
      settings: { maxClinics: 5, allowedFeatures: ['queue', 'analytics'] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = createOrganizationSchema.safeParse({
      slug: 'my-org',
    });
    expect(result.success).toBe(false);
  });

  it('rejects slug that is too short', () => {
    const result = createOrganizationSchema.safeParse({
      name: 'My Organization',
      slug: 'a',
    });
    expect(result.success).toBe(false);
  });

  it('rejects slug with invalid characters (uppercase)', () => {
    const result = createOrganizationSchema.safeParse({
      name: 'My Organization',
      slug: 'My-Organization',
    });
    expect(result.success).toBe(false);
  });

  it('rejects slug with spaces', () => {
    const result = createOrganizationSchema.safeParse({
      name: 'My Organization',
      slug: 'my organization',
    });
    expect(result.success).toBe(false);
  });

  it('rejects slug with trailing hyphen', () => {
    const result = createOrganizationSchema.safeParse({
      name: 'My Organization',
      slug: 'my-org-',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateOrganizationSchema', () => {
  it('accepts valid partial update with name only', () => {
    const result = updateOrganizationSchema.safeParse({
      name: 'Updated Name',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid partial update with isActive', () => {
    const result = updateOrganizationSchema.safeParse({
      isActive: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = updateOrganizationSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects name that is too short', () => {
    const result = updateOrganizationSchema.safeParse({
      name: 'A',
    });
    expect(result.success).toBe(false);
  });
});
