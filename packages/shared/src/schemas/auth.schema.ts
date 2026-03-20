import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  clinicSlug: z.string().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const superAdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z
    .string()
    .length(6)
    .regex(/^\d{6}$/),
});

export type LoginSchemaInput = z.infer<typeof loginSchema>;
export type RefreshTokenSchemaInput = z.infer<typeof refreshTokenSchema>;
export type SuperAdminLoginSchemaInput = z.infer<typeof superAdminLoginSchema>;
