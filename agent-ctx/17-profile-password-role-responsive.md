# Task 17: Fix bugs in Profile Page, Password Security, Role Display, and Responsive Design

## Agent: Main Agent
## Date: 2026-03-05
## Status: COMPLETE

## Summary
Fixed 10 bugs across Profile Page, Password Security, Role Display, and Responsive Design areas. Verified all API routes and existing functionality.

## Bugs Fixed:
1. **CRITICAL: Profile photo not loading/saving** — `profileImage` vs `photo` field name mismatch between ProfileCenter.tsx and API
2. **HIGH: `designation` field missing from User model** — Added to schema, both profile APIs updated
3. **HIGH: User Activity API hardcoded EXPORT/IMPORT only** — Activity Ledger now shows all user actions (CREATE, UPDATE, DELETE)
4. **MEDIUM: `/api/auth/profile` missing `displayName`** — Added to both profile API responses
5. **HIGH: ProfileCenter.tsx not connected to app** — Replaced simple ProfilePage with full ProfileCenter component
6. **HIGH: No PDF/CSV export buttons** — Added profile PDF export and activity CSV export
7. **MEDIUM: Activity API action labels limited** — Expanded to Create, Update, Delete, Password Change, Security Override
8. **MEDIUM: Sidebar touch targets below 44px** — Increased from py-1.5 to py-2.5
9. **MEDIUM: Profile title not responsive** — Changed to flex-col on mobile
10. **MEDIUM: Tabs overflow on mobile** — Added responsive text and hidden qualifiers

## Verified Working:
- AppHeader shows displayName, not email/username
- Change Password only visible to Admin
- All 3 password change APIs block non-admin with 403
- Mobile hamburger menu works
- Responsive sidebar, tables, forms
- Lint passes clean

## Files Modified:
- `src/components/ProfileCenter.tsx`
- `src/components/ElectronicsMartApp.tsx`
- `src/app/api/auth/profile/route.ts`
- `src/app/api/users/profile/route.ts`
- `src/app/api/user-activity/route.ts`
- `prisma/schema.prisma`
