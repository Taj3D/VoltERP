// ============================================================
// EXCEPTION SANITIZER - Global error sanitization layer
// Domain 20: System Audit Logs, Backups & Security Overhaul
// Converts raw Prisma/Node/generic errors into safe, user-friendly
// responses. NEVER exposes raw stack traces, Prisma query text,
// or table/column names to the client.
// ============================================================

interface SanitizedError {
  userMessage: string;
  errorCode: string;
  statusCode: number;
}

/**
 * Prisma error code mapping to user-friendly codes and HTTP status codes.
 * - P2002: Unique constraint violation → 409 Conflict
 * - P2025: Record not found → 404 Not Found
 * - P2003: Foreign key constraint violation → 409 Conflict
 * - Others: Generic database error → 500 Internal Server Error
 */
const PRISMA_ERROR_MAP: Record<string, { errorCode: string; statusCode: number; userMessage: string }> = {
  P2002: {
    errorCode: 'DUPLICATE_RECORD',
    statusCode: 409,
    userMessage: 'A record with this information already exists. Please check for duplicates and try again.',
  },
  P2025: {
    errorCode: 'RECORD_NOT_FOUND',
    statusCode: 404,
    userMessage: 'The requested record was not found. It may have been deleted or modified by another user.',
  },
  P2003: {
    errorCode: 'FOREIGN_KEY_VIOLATION',
    statusCode: 409,
    userMessage: 'This operation references a related record that does not exist or cannot be modified.',
  },
};

/**
 * sanitizeError - Converts any thrown error into a sanitized,
 * user-friendly object suitable for API responses.
 *
 * SECURITY GUARANTEES:
 * - NEVER includes raw stack traces in the output
 * - NEVER includes Prisma query text in the output
 * - NEVER includes table/column names in the output
 * - ALWAYS logs the full raw error + stack to console.error
 *   for debugging purposes (server-side only)
 *
 * @param error - Any thrown error (Prisma, Node, generic)
 * @param context - Optional context string for log correlation
 * @returns Sanitized error object with userMessage, errorCode, statusCode
 */
export function sanitizeError(
  error: unknown,
  context?: string
): SanitizedError {
  // Log the FULL raw error + stack to console (server-side only)
  console.error('[ExceptionSanitizer]', {
    context: context || 'unknown',
    rawError: error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
          // Capture Prisma-specific metadata if present
          ...(error as unknown as Record<string, unknown>),
        }
      : error,
  });

  // ============================================================
  // 1. Prisma errors — identified by `code` property
  // ============================================================
  if (isPrismaError(error)) {
    const prismaCode = (error as { code: string }).code;
    const mapped = PRISMA_ERROR_MAP[prismaCode];

    if (mapped) {
      return {
        userMessage: mapped.userMessage,
        errorCode: mapped.errorCode,
        statusCode: mapped.statusCode,
      };
    }

    // Unmapped Prisma error — generic database error
    return {
      userMessage: 'A database error occurred. Please try again or contact support if the issue persists.',
      errorCode: 'DATABASE_ERROR',
      statusCode: 500,
    };
  }

  // ============================================================
  // 2. SyntaxError / TypeError — validation or input errors
  // ============================================================
  if (error instanceof SyntaxError) {
    return {
      userMessage: 'The request contains invalid data format. Please check your input and try again.',
      errorCode: 'VALIDATION_ERROR',
      statusCode: 400,
    };
  }

  if (error instanceof TypeError) {
    return {
      userMessage: 'An invalid operation was attempted. Please check your input and try again.',
      errorCode: 'VALIDATION_ERROR',
      statusCode: 400,
    };
  }

  // ============================================================
  // 3. Error instances with status/code properties (e.g., from Next.js)
  // ============================================================
  if (error instanceof Error) {
    // Check for HTTP-style errors with statusCode
    const errorWithStatus = error as Error & { statusCode?: number; status?: number };
    const statusCode = errorWithStatus.statusCode || errorWithStatus.status;

    if (statusCode === 400) {
      return {
        userMessage: error.message || 'Bad request. Please check your input and try again.',
        errorCode: 'VALIDATION_ERROR',
        statusCode: 400,
      };
    }

    if (statusCode === 401) {
      return {
        userMessage: 'Authentication required. Please log in and try again.',
        errorCode: 'UNAUTHORIZED',
        statusCode: 401,
      };
    }

    if (statusCode === 403) {
      return {
        userMessage: 'Access denied. You do not have permission to perform this action.',
        errorCode: 'FORBIDDEN',
        statusCode: 403,
      };
    }

    if (statusCode === 404) {
      return {
        userMessage: 'The requested resource was not found.',
        errorCode: 'RECORD_NOT_FOUND',
        statusCode: 404,
      };
    }

    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return {
        userMessage: 'The request could not be processed. Please check your input and try again.',
        errorCode: 'CLIENT_ERROR',
        statusCode,
      };
    }
  }

  // ============================================================
  // 4. Default — internal server error
  // ============================================================
  return {
    userMessage: 'An unexpected error occurred. Please try again or contact support if the issue persists.',
    errorCode: 'INTERNAL_ERROR',
    statusCode: 500,
  };
}

/**
 * Type guard for Prisma errors. Prisma errors always have a `code` property
 * that starts with 'P' followed by digits (e.g., P2002, P2025).
 */
function isPrismaError(error: unknown): error is { code: string; meta?: unknown } {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const err = error as Record<string, unknown>;
  return typeof err.code === 'string' && /^P\d{3,4}$/.test(err.code);
}
