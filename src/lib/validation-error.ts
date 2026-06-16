// ============================================================
// Validation Error — Used to distinguish validation errors from server errors
// Validation errors should return 400, not 500
// ============================================================

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Helper: Determine appropriate HTTP status code from an error
 * Returns 400 for validation errors, 500 for unknown errors
 */
export function getErrorStatus(error: unknown): number {
  if (error instanceof ValidationError) return 400;
  if (error instanceof Error && error.name === 'ValidationError') return 400;
  return 500;
}

/**
 * Helper: Get error message from unknown error
 */
export function getErrorMessage(error: unknown, fallback = 'Internal server error'): string {
  return error instanceof Error ? error.message : fallback;
}
