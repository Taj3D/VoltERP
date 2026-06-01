# Task 4-integration: Wire Multi-Branch into ElectronicsMartApp.tsx Sidebar + RBAC + Verify

## Summary
Wired the Multi-Branch & Consolidation module into the main ElectronicsMartApp.tsx sidebar, RBAC system, and page rendering.

## Work Completed

### 1. Created MultiBranchConsolidationPage Component
**File:** `/home/z/my-project/src/components/MultiBranchConsolidationPage.tsx` (NEW — ~750 lines)

A full-featured component with 4 tabs:
- **Branch Management**: CRUD for branches with stats cards, search, expandable detail rows, create/edit dialog
- **Inter-Branch Transfers**: List/create/authorize transfers (STOCK or FUND type), filter by status/type, authorize/reject workflow (admin only)
- **Consolidated Statements**: Generate Trial Balance, P&L, or Balance Sheet across branches with branch selection checkboxes, elimination entries display, and save-to-log functionality
- **Consolidation History**: View past consolidation logs with expandable detail rows

Key features:
- Accepts `userRole`, `userName`, `userEmail`, and `activeTab` props
- Auto-selects correct tab based on `activeTab` prop
- Role-based UI restrictions (admin: full CRUD, manager: create/edit, vat_auditor: read-only)
- Intl.NumberFormat('en-BD') for all currency formatting
- VAT Audit Mode badge for vat_auditor role
- Uses existing API routes: `/api/branches`, `/api/branches/transfer`, `/api/consolidation/statements`

### 2. Added Sidebar Group to ElectronicsMartApp.tsx
**Location:** SIDEBAR_CONFIG array, after "financial-audit" group (line ~436)

Added new sidebar group:
```typescript
{
  key: "multi-branch",
  label: "Multi-Branch & Consolidation",
  icon: Building2,
  items: [
    { key: "branch-management", label: "Branch Management", parent: "Branch Setup", icon: Building2 },
    { key: "inter-branch-transfers", label: "Inter-Branch Transfers", parent: "Branch Setup", icon: ArrowLeftRight },
    { key: "consolidated-statements", label: "Consolidated Statements", parent: "Holding Reports", icon: BarChart3 },
    { key: "consolidation-history", label: "Consolidation History", parent: "Holding Reports", icon: FileText },
  ],
}
```

### 3. Added Component Import
**Location:** Import section (line ~66)

```typescript
import MultiBranchConsolidationPage from "@/components/MultiBranchConsolidationPage";
```

### 4. Added RBAC Access Rules
**ROLE_ACCESS:** Added "multi-branch" to manager role access array
- admin: "*" (already has full access)
- manager: Added "multi-branch"

**ITEM_ACCESS_DENIED:**
- sr: Added "branch-management", "inter-branch-transfers", "consolidated-statements", "consolidation-history"
- dealer: Added "branch-management", "inter-branch-transfers", "consolidated-statements", "consolidation-history"
- vat_auditor: Added "inter-branch-transfers" (can view branches and statements but not create transfers)

### 5. Added Component Rendering
**Location:** renderPage() function (line ~7229)

```typescript
const multiBranchKeys = new Set(["branch-management", "inter-branch-transfers", "consolidated-statements", "consolidation-history"]);
if (multiBranchKeys.has(currentPage)) return <MultiBranchConsolidationPage key={currentPage} userRole={auth.user?.role || "admin"} userName={auth.user?.displayName || ""} userEmail={auth.user?.email || ""} activeTab={currentPage} />;
```

### Verification
- `bun run lint` — ZERO errors
- Dev server HTTP 200 on localhost:3000
- No existing functionality modified — only additions
