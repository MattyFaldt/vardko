import { z } from 'zod';
import { slugSchema, uuidSchema } from './common.schema.js';
import { SUPPORTED_LANGUAGES } from '../constants/i18n.js';

const clinicSettingsSchema = z
  .object({
    maxPostponements: z.number().int().min(0).max(10).optional(),
    defaultServiceTimeSeconds: z.number().int().positive().optional(),
    maxQueueSize: z.number().int().positive().optional(),
    noShowTimerSeconds: z.number().int().positive().optional(),
    openingHour: z.number().int().min(0).max(23).optional(),
    closingHour: z.number().int().min(0).max(23).optional(),
  })
  .optional()
  .default({});

export const createClinicSchema = z.object({
  organizationId: uuidSchema,
  name: z.string().min(2).max(255),
  slug: slugSchema,
  address: z.string().max(500).optional(),
  timezone: z.string().min(1).max(50).default('Europe/Stockholm'),
  defaultLanguage: z.enum(SUPPORTED_LANGUAGES).default('sv'),
  settings: clinicSettingsSchema,
});

export const updateClinicSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  slug: slugSchema.optional(),
  address: z.string().max(500).nullable().optional(),
  timezone: z.string().min(1).max(50).optional(),
  defaultLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
  settings: clinicSettingsSchema.optional(),
  isActive: z.boolean().optional(),
});

export type CreateClinicInput = z.infer<typeof createClinicSchema>;
export type UpdateClinicInput = z.infer<typeof updateClinicSchema>;
