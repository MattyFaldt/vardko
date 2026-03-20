import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const dateRangeSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
});

export const slugSchema = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens');

/** Client-side only — personnummer must NEVER be sent to server */
export const personnummerFormatSchema = z
  .string()
  .regex(/^\d{8}-\d{4}$/, 'Format: YYYYMMDD-XXXX');
