import { describe, it, expect } from 'vitest';
import { createRoomSchema, updateRoomSchema } from './room.schema.js';

describe('createRoomSchema', () => {
  it('accepts valid input', () => {
    const result = createRoomSchema.safeParse({
      clinicId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Room 1',
    });
    expect(result.success).toBe(true);
  });

  it('defaults displayOrder to 0', () => {
    const result = createRoomSchema.safeParse({
      clinicId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Room 1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayOrder).toBe(0);
    }
  });

  it('accepts custom displayOrder', () => {
    const result = createRoomSchema.safeParse({
      clinicId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Room 2',
      displayOrder: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayOrder).toBe(5);
    }
  });

  it('rejects empty name', () => {
    const result = createRoomSchema.safeParse({
      clinicId: '123e4567-e89b-12d3-a456-426614174000',
      name: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative displayOrder', () => {
    const result = createRoomSchema.safeParse({
      clinicId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Room 1',
      displayOrder: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer displayOrder', () => {
    const result = createRoomSchema.safeParse({
      clinicId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Room 1',
      displayOrder: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid clinicId', () => {
    const result = createRoomSchema.safeParse({
      clinicId: 'not-a-uuid',
      name: 'Room 1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects name exceeding max length', () => {
    const result = createRoomSchema.safeParse({
      clinicId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'x'.repeat(101),
    });
    expect(result.success).toBe(false);
  });
});

describe('updateRoomSchema', () => {
  it('accepts valid partial update with name', () => {
    const result = updateRoomSchema.safeParse({
      name: 'Updated Room',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid partial update with displayOrder', () => {
    const result = updateRoomSchema.safeParse({
      displayOrder: 3,
    });
    expect(result.success).toBe(true);
  });

  it('accepts isActive toggle', () => {
    const result = updateRoomSchema.safeParse({
      isActive: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = updateRoomSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
