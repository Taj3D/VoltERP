# Task 2: Employee DOB 18+ Standalone Validation

## Summary
Added standalone DOB 18+ validation to both Employee API route files, ensuring that any employee with a date of birth indicating they are under 18 years old TODAY is rejected — regardless of joining date.

## Files Modified

### 1. `/home/z/my-project/src/app/api/employees/route.ts`
**Changes:**
- **Batch mode** (lines 55-64): Added standalone DOB 18+ check before the existing Chronological Date Interlocks. Throws `Error` with "Personnel Validation Gate" message if DOB indicates person is under 18 today.
- **Single mode** (lines 166-178): Added standalone DOB 18+ check before the existing Chronological Date Interlocks. Returns `NextResponse.json` with 400 status if DOB indicates person is under 18 today.

### 2. `/home/z/my-project/src/app/api/employees/[id]/route.ts`
**Changes:**
- **PUT method** (lines 53-65): Added standalone DOB 18+ check before the existing Chronological Date Interlocks. Returns `NextResponse.json` with 400 status if DOB indicates person is under 18 today.

## Validation Logic
```typescript
if (body.dateOfBirth) {
  const dob = new Date(body.dateOfBirth);
  const today = new Date();
  const minAgeDate = new Date(today);
  minAgeDate.setFullYear(minAgeDate.getFullYear() - 18);
  if (dob > minAgeDate) {
    // Person is under 18
  }
}
```

## Key Design Decisions
1. **Placement**: The new DOB standalone check is placed BEFORE the joiningDate+DOB check, so under-18 rejections happen first (simpler check, clearer error).
2. **Existing validations preserved**: The joiningDate+DOB pair validation (joining must be >= DOB + 18 years) remains intact as a separate, distinct check.
3. **Batch mode**: Uses `throw new Error()` instead of `return NextResponse.json()` to abort the transaction.
4. **Error message**: Uses "Personnel Validation Gate" prefix with specific DOB date for clear identification. Message contains "minimum age" which is caught by existing catch blocks.
5. **Catch blocks**: No changes needed — existing `error?.message?.includes('minimum age')` condition already catches the new error from batch mode.

## Verification
- `bun run lint` passed with zero errors
