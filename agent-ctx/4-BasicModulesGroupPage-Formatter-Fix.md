# Task ID: 4 — BasicModulesGroupPage Formatter Fix

## Agent: BasicModulesGroupPage Formatter Fix
## Task: Fix unsafe toLocaleString in BasicModulesGroupPage.tsx

## Work Summary

Replaced unsafe `toLocaleString("en-US", ...)` calls in `fmt()` and `fmtCurrency()` functions with safe `Intl.NumberFormat` instances to prevent Bengali digit output (০-৯) in certain Node.js/browser environments.

## Changes Made

### File: `src/components/BasicModulesGroupPage.tsx`

**Before (lines 39-52):**
```typescript
const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined || v === "N/A (Audit Mode)") return v || "—";
  if (type === "currency") return `৳${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  if (type === "date") return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  if (type === "boolean") return v ? "Active" : "Inactive";
  if (type === "number") return Number(v).toLocaleString();
  return String(v);
};

const fmtCurrency = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)") return v;
  return `৳${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
};
```

**After:**
```typescript
const bdFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bdFmtInt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined || v === "N/A (Audit Mode)") return v || "—";
  if (type === "currency") return `৳${bdFmt.format(Number(v))}`;
  if (type === "date") return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  if (type === "boolean") return v ? "Active" : "Inactive";
  if (type === "number") return bdFmtInt.format(Number(v));
  return String(v);
};

const fmtCurrency = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)") return v;
  return `৳${bdFmt.format(Number(v))}`;
};
```

## Lint Check
- `bun run lint` — PASSED with zero errors

## Related Previous Fixes
- Phase 2: DashboardAnalyticsPage.tsx — same Intl.NumberFormat pattern
- Phase 4: invoice-engine.ts — same Intl.NumberFormat pattern
- StructureModulePage.tsx — same Intl.NumberFormat pattern (reference)
