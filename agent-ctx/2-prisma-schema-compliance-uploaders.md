# Task 2: Prisma Schema Upgrades & Secure Compliance File Uploaders

## Agent
Prisma Schema & Compliance File Uploader Agent

## Task
Add image fields to 5 Prisma models, create reusable ImageUploadField widget, integrate into 3 page components

## Work Completed

### Step 1: Prisma Schema Updates
- **Customer model**: Added `profileImage`, `nidFrontImage`, `nidBackImage` (String?, after customerType)
- **Supplier model**: Added `profileImage`, `nidFrontImage`, `nidBackImage` (String?, after creditLimit)
- **Employee model**: Added `nidFrontImage`, `nidBackImage` (String?, after photo field)
- **InvestmentHead model**: Added `profileImage`, `nidFrontImage`, `nidBackImage` (String?, after openingType)
- **Company model**: Added `brandLogo` (String?, after logo field)

### Step 2: Database Sync
- `npx prisma generate && npx prisma db push` — successful

### Step 3: ImageUploadField Component
- Created `/src/components/erp/ui/ImageUploadField.tsx`
- Features: drag-and-drop, click-to-browse, JPEG/PNG only, 2MB max, base64 conversion, thumbnail preview, replace/remove buttons
- Uses Lucide icons: Upload, X, Image, Camera

### Step 4: PersonnelCRMGroupPage Integration
- Added ImageUploadField import
- Added image fields to Customer/Supplier/Employee formFields configs
- Added formSections to Customer and Supplier (they didn't have sections before)
- Added "Document Uploads" section to Employee formSections
- Added `field.type === "image"` handler in renderFormField()
- Updated renderFormContent() for Document Uploads sections with `grid grid-cols-1 sm:grid-cols-3 gap-4`

### Step 5: InvestmentGroupPage Integration
- Added ImageUploadField import
- Updated openHeadsCreate/openHeadsEdit to include image fields
- Updated saveHeads payload with image fields
- Added Document Uploads section in form dialog with 3-column grid

### Step 6: BasicModulesGroupPage Integration
- Added ImageUploadField import
- Added `brandLogo` image field to Company formFields
- Added `field.type === "image"` handler in renderFormField()
- Excluded image type from duplicate Label rendering

### Step 7: Type System
- Added `"image"` to FieldDef type union in export-utils.ts

## Verification
- `bun run lint` → 0 errors
- Dev server running on port 3000

## Files Modified
1. `/home/z/my-project/prisma/schema.prisma` — 5 models updated
2. `/home/z/my-project/src/components/erp/ui/ImageUploadField.tsx` — new file
3. `/home/z/my-project/src/components/PersonnelCRMGroupPage.tsx` — import, formFields, formSections, renderFormField, renderFormContent
4. `/home/z/my-project/src/components/InvestmentGroupPage.tsx` — import, form data, save payload, form dialog
5. `/home/z/my-project/src/components/BasicModulesGroupPage.tsx` — import, formFields, renderFormField, dialog rendering
6. `/home/z/my-project/src/lib/export-utils.ts` — FieldDef type union
7. `/home/z/my-project/worklog.md` — appended work record
