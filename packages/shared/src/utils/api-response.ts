import type { ApiSuccess, ApiFailure, ApiMeta } from '../types/api.js';

export function createSuccessResponse<T>(data: T, meta?: Partial<ApiMeta>): ApiSuccess<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

export function createErrorResponse(code: string, message: string, details?: unknown): ApiFailure {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
  };
}
