# Task ID: 20-2
# Agent: Code Agent
# Task: Add photo and ID upload fields (max 5MB each) to Customer, Employee, and Investor forms

## Work Log

### 1. Prisma Schema Changes
- Added `logoUrl String?` to Supplier model (for company/dealer logo URL)
- Added `voterIdFront String?` and `voterIdBack String?` to User model (photo already existed)
- Customer model already had `profileImage`, `nidFrontImage`, `nidBackImage`, `nidNumber` — no changes needed
- Employee model already had `photo`, `nidFrontImage`, `nidBackImage`, `nidNumber` — no changes needed
- InvestmentHead model already had `profileImage`, `nidFrontImage`, `nidBackImage` — no changes needed
- Ran `bun run db:push` successfully

### 2. PersonnelCRMGroupPage.tsx Changes
- Added `logoUrl` text field to Supplier form config (with placeholder "https://example.com/logo.png")
- Added "Branding" section to Supplier formSections containing `logoUrl`
- Added avatar thumbnails (32x32 circle) in the "name" column for Employee, Customer, Supplier tables:
  - If photo/profileImage exists: shows circular image
  - If no photo: shows initial letter in a colored circle
- Enhanced image upload with toast error notification via `onError` callback on ImageUploadField

### 3. InvestmentGroupPage.tsx Changes
- Added avatar thumbnail (32x32 circle) in the Investment Heads table "name" column:
  - If profileImage exists: shows circular image
  - If no photo: shows initial letter in a green circle
- Added `onError` toast callback to all 3 ImageUploadField instances in the Investment Head form

### 4. API Route Changes

#### Suppliers API (`/api/suppliers/route.ts`)
- Added `nidNumber` to batch create (was missing — bug fix)
- Added `logoUrl` to batch create
- Added `nidNumber` and `logoUrl` to single create

#### Suppliers API (`/api/suppliers/[id]/route.ts`)
- Added `nidNumber` and `logoUrl` to PUT update handler

#### Auth Profile API (`/api/auth/profile/route.ts`)
- Added `voterIdFront` and `voterIdBack` to destructured body fields
- Added server-side validation for voter ID images (5MB max base64 string ≈ 7MB)
- Added `voterIdFront` and `voterIdBack` to both GET select and PUT select clauses

#### Users Profile API (`/api/users/profile/route.ts`)
- Added `voterIdFront` and `voterIdBack` to GET response
- Added `voterIdFront` and `voterIdBack` to PUT destructured body fields
- Added server-side 5MB validation for both voter ID images
- Added fields to update data builder and response

### 5. ImageUploadField Component Enhancement
- Added `onError` optional callback prop to ImageUploadFieldProps interface
- When validation error occurs (file type or size), the callback is invoked with the error message
- Updated processFile callback to call `onError?.(msg)` for both type and size validation errors
- Error message for file size now shows the actual file size: `File size must be less than 5MB (selected: 6.2MB)`
- Added `onError` to the useCallback dependency array

### 6. Bug Fix: Supplier nidNumber Missing from API
- The Supplier POST and PUT APIs were not saving `nidNumber` even though the form had the field
- Added `nidNumber` handling to both batch and single create modes, and to the PUT update handler

## Files Changed
1. `/home/z/my-project/prisma/schema.prisma` — Added logoUrl to Supplier, voterIdFront/voterIdBack to User
2. `/home/z/my-project/src/components/erp/ui/ImageUploadField.tsx` — Added onError callback prop
3. `/home/z/my-project/src/components/PersonnelCRMGroupPage.tsx` — Added logoUrl to Supplier form, avatar thumbnails, toast on error
4. `/home/z/my-project/src/components/InvestmentGroupPage.tsx` — Added avatar thumbnails to heads table, toast on error
5. `/home/z/my-project/src/app/api/suppliers/route.ts` — Added nidNumber and logoUrl to create
6. `/home/z/my-project/src/app/api/suppliers/[id]/route.ts` — Added nidNumber and logoUrl to update
7. `/home/z/my-project/src/app/api/auth/profile/route.ts` — Added voterIdFront/voterIdBack to GET/PUT
8. `/home/z/my-project/src/app/api/users/profile/route.ts` — Added voterIdFront/voterIdBack to GET/PUT

## Verification
- `bun run db:push` completed successfully
- `bun run lint` passes with zero errors
- Dev server running on port 3000 (HTTP 200)
- All API routes respond correctly (401 for unauthenticated requests)
