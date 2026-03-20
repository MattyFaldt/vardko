import { z } from 'zod';
import { uuidSchema } from './common.schema.js';

export const createRoomSchema = z.object({
  clinicId: uuidSchema,
  name: z.string().min(1).max(100),
  displayOrder: z.number().int().min(0).default(0),
});

export const updateRoomSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
