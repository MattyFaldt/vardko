import { z } from 'zod';
import { uuidSchema } from './common.schema.js';
import { USER_ROLES } from '../constants/roles.js';
import { SUPPORTED_LANGUAGES } from '../constants/i18n.js';

const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const createUserSchema = z.object({
  organizationId: uuidSchema,
  clinicId: uuidSchema.nullable().optional(),
  email: z.string().email().max(255),
  password: passwordSchema,
  displayName: z.string().min(1).max(255),
  role: z.enum(USER_ROLES),
  preferredLanguage: z.enum(SUPPORTED_LANGUAGES).default('sv'),
});

export const updateUserSchema = z.object({
  email: z.string().email().max(255).optional(),
  displayName: z.string().min(1).max(255).optional(),
  role: z.enum(USER_ROLES).optional(),
  preferredLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
  isActive: z.boolean().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
