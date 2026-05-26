---
Task ID: notification-system-patch
Agent: Main Agent
Task: Fix critical notification bell gap — implement full-stack dynamic notification system with live polling, RBAC filtering, and VAT Auditor masking

Work Log:
- Explored existing notification API, header inline code, auth patterns, and DataIntegrityLog schema
- Discovered critical gaps: header bell was using AuditLog instead of Notification model, API response shape mismatch, no PUT action handling, no polling, no role-based filtering
- Rewrote /src/app/api/notifications/route.ts with complete CRUD + auto-generate:
  - GET: Role-based module filtering (Admin/Manager see all, SR blocked from Ledger/Financial, Dealer sees only LowStock/System)
  - GET: countOnly mode for lightweight badge polling
  - POST: Auto-generate within db.$transaction() — LowStock, OverdueInstallment, DataIntegrity, PeriodClose
  - PUT: mark-read, mark-all-read, dismiss actions
  - VAT Auditor: maskVatInMessage() replaces ৳ currency patterns with "N/A (Audit Mode)"
  - Fixed DataIntegrityLog field names (status not severity, checkType not issueType, details not description)
- Created /src/components/erp/layout/AppHeader.tsx — complete global header component:
  - 30-second polling via setInterval for live badge updates
  - Unread count red badge with dynamic number
  - Notification dropdown with severity indicators (pulsing red=Critical, amber=Warning, blue=Info)
  - Type-specific icons (AlertTriangle for LowStock, XCircle for Overdue, Info for System)
  - Relative time formatting ("3 mins ago", "2 hours ago")
  - Mark as Read (single), Mark All Read, Dismiss actions
  - Module badges, reference codes, actionUrl navigation
  - VAT Auditor masking on message content
  - Full user menu with role badges, theme toggle, search, breadcrumbs
- Integrated AppHeader into page.tsx — replaced 100-line inline header with component
- Removed obsolete auditLogs state, loadAuditLogs, notifOpen from AppLayout
- Fixed userRole undefined bug (added const userRole = user?.role || "admin")
- Build: ✓ Compiled successfully in 12.6s, 0 ESLint errors
- API verification: 7 notifications auto-generated (5 LowStock + 1 PeriodClose), unreadCount=7
- VAT masking verified: PeriodClose message shows "N/A (Audit Mode)" for vat_auditor role

Stage Summary:
- Notification bell now dynamically polls /api/notifications every 30 seconds
- Auto-generates alerts for LowStock, OverdueInstallment, DataIntegrity, PeriodClose
- Full RBAC: Admin/Manager see all, SR filtered, Dealer restricted, VAT Auditor masked
- AppHeader componentized for maintainability
- All existing configurations preserved: RBAC, Period Close locks, auto-codes, VAT masking
- 0 compile errors, 0 lint errors
