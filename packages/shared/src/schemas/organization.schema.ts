import { z } from 'zod';
import { slugSchema } from './common.schema.js';

export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(255),
  slug: slugSchema,
  settings: z
    .object({
      maxClinics: z.number().int().positive().optional(),
      allowedFeatures: z.array(z.string()).optional(),
    })
    .optional()
    .default({}),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  slug: slugSchema.optional(),
  settings: z
    .object({
      maxClinics: z.number().int().positive().optional(),
      allowedFeatures: z.array(z.string()).optional(),
    })
    .optional(),
  isActive: z.boolean().optional(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
