import { describe, it, expect } from 'vitest';
import { createClinicSchema, updateClinicSchema } from './clinic.schema.js';

const validClinic = {
  organizationId: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Kungsholmen Clinic',
  slug: 'kungsholmen',
};

describe('createClinicSchema', () => {
  it('accepts valid input', () => {
    const result = createClinicSchema.safeParse(validClinic);
    expect(result.success).toBe(true);
  });

  it('defaults timezone to Europe/Stockholm', () => {
    const result = createClinicSchema.safeParse(validClinic);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe('Europe/Stockholm');
    }
  });

  it('defaults defaultLanguage to sv', () => {
    const result = createClinicSchema.safeParse(validClinic);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultLanguage).toBe('sv');
    }
  });

  it('accepts custom timezone', () => {
    const result = createClinicSchema.safeParse({
      ...validClinic,
      timezone: 'Europe/Oslo',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty timezone string', () => {
    const result = createClinicSchema.safeParse({
      ...validClinic,
      timezone: '',
    });
    expect(result.success).toBe(false);
  });

  it('accepts supported language', () => {
    const result = createClinicSchema.safeParse({
      ...validClinic,
      defaultLanguage: 'en',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unsupported language', () => {
    const result = createClinicSchema.safeParse({
      ...validClinic,
      defaultLanguage: 'xx',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid slug with uppercase', () => {
    const result = createClinicSchema.safeParse({
      ...validClinic,
      slug: 'My-Clinic',
    });
    expect(result.success).toBe(false);
  });

  it('rejects slug that is too short', () => {
    const result = createClinicSchema.safeParse({
      ...validClinic,
      slug: 'a',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const result = createClinicSchema.safeParse({
      organizationId: '123e4567-e89b-12d3-a456-426614174000',
      slug: 'test-clinic',
    });
    expect(result.success).toBe(false);
  });

  it('rejects name that is too short', () => {
    const result = createClinicSchema.safeParse({
      ...validClinic,
      name: 'A',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid settings', () => {
    const result = createClinicSchema.safeParse({
      ...validClinic,
      settings: {
        maxPostponements: 3,
        defaultServiceTimeSeconds: 600,
        maxQueueSize: 50,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('updateClinicSchema', () => {
  it('accepts valid partial update', () => {
    const result = updateClinicSchema.safeParse({
      name: 'Updated Clinic',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = updateClinicSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts nullable address', () => {
    const result = updateClinicSchema.safeParse({
      address: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts isActive toggle', () => {
    const result = updateClinicSchema.safeParse({
      isActive: false,
    });
    expect(result.success).toBe(true);
  });
});
