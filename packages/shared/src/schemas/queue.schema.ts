import { z } from 'zod';
import { uuidSchema } from './common.schema.js';
import { SUPPORTED_LANGUAGES } from '../constants/i18n.js';
import { DEFAULT_MAX_POSTPONEMENTS } from '../constants/queue.js';

export const joinQueueSchema = z.object({
  clinicId: uuidSchema,
  anonymousHash: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/, 'Must be a valid HMAC-SHA256 hex string'),
  language: z.enum(SUPPORTED_LANGUAGES).default('sv'),
});

export const postponeSchema = z.object({
  positionsBack: z
    .number()
    .int()
    .positive()
    .max(DEFAULT_MAX_POSTPONEMENTS * 10, 'Cannot postpone that many positions'),
});

export type JoinQueueSchemaInput = z.infer<typeof joinQueueSchema>;
export type PostponeSchemaInput = z.infer<typeof postponeSchema>;
