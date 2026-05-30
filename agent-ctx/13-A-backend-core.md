# Task 13-A: Backend Core Files — Domain 20 System Audit Logs, Backups & Security Overhaul

## Assignment
Create 6 backend files for the System Audit Logs, Backups & Security Overhaul domain.

## Work Log

### FILE 1: /src/lib/audit-middleware.ts
- **maskSensitivePayload(data)**: Deep-clones input object, replaces values for 17 sensitive field patterns with "********". Case-insensitive matching. Recursively walks nested objects and arrays.
  - Sensitive fields: password, confirmPassword, newPassword, oldPassword, apiKey, apiSecret, secretKey, accessToken, refreshToken, sessionToken, token, bankRoutingNumber, routingNumber, swiftCode, iban, cardNumber, cvv, pin, otp
- **logSystemAudit(params)**: Creates SystemAuditLog record. Both previousState and newState passed through maskSensitivePayload() before JSON.stringify. Wrapped in try/catch — never throws (non-blocking). Uses db.systemAuditLog.create().
- **withAuditLog(params, operation, previousStateGetter?)**: Wrapper function for API routes. Gets previousState from getter (if provided), runs the operation, then logs the audit. Return value of operation used as newState. All sensitive fields masked before persistence. Never throws — audit logging failures are caught and logged to console.

### FILE 2: /src/lib/rate-limiter.ts
- **checkRateLimit(ipAddress, endpoint)**: Sliding window of 60 seconds, max 5 failed attempts per IP per endpoint. In-memory Map with key format `${ipAddress}:${endpoint}`. Returns { allowed, remainingAttempts, retryAfterSeconds }.
- **recordFailedAttempt(ipAddress, endpoint)**: Increments failed attempt counter. Creates key if not exists. Resets window if expired.
- **resetRateLimit(ipAddress, endpoint)**: Clears rate limit for successful authentication.
- **getRateLimitStatus(ipAddress, endpoint)**: Returns { attempts, windowStart, isLocked, retryAfterSeconds } for UI countdown display.

### FILE 3: /src/lib/exception-sanitizer.ts
- **sanitizeError(error, context?)**: Converts any thrown error into sanitized user-friendly object { userMessage, errorCode, statusCode }.
  - Prisma P2002 → DUPLICATE_RECORD + 409
  - Prisma P2025 → RECORD_NOT_FOUND + 404
  - Prisma P2003 → FOREIGN_KEY_VIOLATION + 409
  - Other Prisma → DATABASE_ERROR + 500
  - SyntaxError/TypeError → VALIDATION_ERROR + 400
  - Default → INTERNAL_ERROR + 500
  - NEVER includes raw stack traces, Prisma query text, or table/column names in userMessage
  - Logs FULL raw error + stack to console.error('[ExceptionSanitizer]', { context, rawError: ... })

### FILE 4: /src/app/api/system-audit-logs/route.ts
- **GET**: Read-only endpoint for fetching system audit logs.
  - Uses withApiSecurity for RBAC enforcement
  - Multi-tenant isolation: admin sees all companies' logs, others only their own (companyId filter)
  - Pagination: page, pageSize params with default 20 per page
  - Filters: actionType, targetModel, search, dateFrom, dateTo
  - Search across actorUserId, targetModel, targetRecordId, metadata, userAgent, ipAddress
  - Returns previousState and newState parsed from JSON strings
  - Includes total count for pagination
  - logUserActivity with module token "Sec-Audit-Overhaul"
  - Error handling via sanitizeError

### FILE 5: /src/app/api/system-backup/route.ts
- **GET**: List backup history (admin only).
  - withApiSecurity + admin role check
  - Returns SystemBackup records filtered by companyId
  - logUserActivity with module token "Sec-Audit-Overhaul"
- **POST**: Trigger new backup (admin only).
  - Creates SystemBackup record with status "PENDING"
  - Generates backupCode like "BKP-XXXXX"
  - Multi-tenant database export: Product, Customer, Supplier, SalesOrder, PurchaseOrder, Bank, Expense, Income, CashCollection, CashDelivery, BankTransaction, ExpenseIncomeHead, ChartOfAccount, LedgerEntry
  - All exports filtered by { companyId, isActive: true }
  - Computes recordCount, fileSizeBytes, checksumSha256 (SHA-256)
  - Simulates S3-compatible storage key
  - Updates SystemBackup with status "COMPLETED" and all metadata
  - On error: updates with status "FAILED" and errorMessage
  - Returns backup metadata + downloadData (JSON export data for download — NOT stored in DB)
  - logUserActivity with module token "Sec-Audit-Overhaul"

### FILE 6: /src/app/api/auth/rate-limit/route.ts
- **GET**: Check rate limit status for frontend countdown.
  - Parses ipAddress and endpoint from query params
  - Returns { attempts, isLocked, retryAfterSeconds }
  - Uses getRateLimitStatus from rate-limiter module

## Verification
- `bun run lint` passed with ZERO errors
- Dev server stable on localhost:3000 (HTTP 200)
- All 6 files follow project conventions (Next.js 16, import { db } from '@/lib/db', withApiSecurity, logUserActivity, sanitizeError)
