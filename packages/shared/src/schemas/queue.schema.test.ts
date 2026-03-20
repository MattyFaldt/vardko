import { describe, it, expect } from 'vitest';
import { joinQueueSchema, postponeSchema } from './queue.schema.js';

describe('joinQueueSchema', () => {
  it('accepts valid input', () => {
    const result = joinQueueSchema.safeParse({
      clinicId: '123e4567-e89b-12d3-a456-426614174000',
      anonymousHash: 'a'.repeat(64),
      language: 'sv',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID for clinicId', () => {
    const result = joinQueueSchema.safeParse({
      clinicId: 'not-a-uuid',
      anonymousHash: 'a'.repeat(64),
      language: 'sv',
    });
    expect(result.success).toBe(false);
  });

  it('rejects wrong-length hash', () => {
    const result = joinQueueSchema.safeParse({
      clinicId: '123e4567-e89b-12d3-a456-426614174000',
      anonymousHash: 'a'.repeat(32),
      language: 'sv',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-hex hash', () => {
    const result = joinQueueSchema.safeParse({
      clinicId: '123e4567-e89b-12d3-a456-426614174000',
      anonymousHash: 'z'.repeat(64),
      language: 'sv',
    });
    expect(result.success).toBe(false);
  });

  it('defaults language to sv', () => {
    const result = joinQueueSchema.safeParse({
      clinicId: '123e4567-e89b-12d3-a456-426614174000',
      anonymousHash: 'a'.repeat(64),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe('sv');
    }
  });

  it('rejects unsupported language', () => {
    const result = joinQueueSchema.safeParse({
      clinicId: '123e4567-e89b-12d3-a456-426614174000',
      anonymousHash: 'a'.repeat(64),
      language: 'xx',
    });
    expect(result.success).toBe(false);
  });
});

describe('postponeSchema', () => {
  it('accepts valid positions back', () => {
    const result = postponeSchema.safeParse({ positionsBack: 3 });
    expect(result.success).toBe(true);
  });

  it('rejects zero', () => {
    const result = postponeSchema.safeParse({ positionsBack: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative', () => {
    const result = postponeSchema.safeParse({ positionsBack: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer', () => {
    const result = postponeSchema.safeParse({ positionsBack: 1.5 });
    expect(result.success).toBe(false);
  });
});
