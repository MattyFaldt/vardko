import { describe, it, expect } from 'vitest';
import { createSuccessResponse, createErrorResponse } from './api-response.js';

describe('createSuccessResponse', () => {
  it('wraps data in success envelope', () => {
    const result = createSuccessResponse({ id: '123', name: 'Test' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: '123', name: 'Test' });
    expect(result.meta?.timestamp).toBeDefined();
  });

  it('includes pagination metadata when provided', () => {
    const result = createSuccessResponse([1, 2, 3], {
      pagination: { page: 1, pageSize: 10, total: 50, totalPages: 5 },
    });
    expect(result.meta?.pagination?.total).toBe(50);
  });
});

describe('createErrorResponse', () => {
  it('wraps error in failure envelope', () => {
    const result = createErrorResponse('NOT_FOUND', 'Resource not found');
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NOT_FOUND');
    expect(result.error.message).toBe('Resource not found');
  });

  it('includes details when provided', () => {
    const result = createErrorResponse('INVALID_INPUT', 'Bad input', { field: 'email' });
    expect(result.error.details).toEqual({ field: 'email' });
  });

  it('omits details when not provided', () => {
    const result = createErrorResponse('UNAUTHORIZED', 'Not authenticated');
    expect(result.error.details).toBeUndefined();
  });
});
