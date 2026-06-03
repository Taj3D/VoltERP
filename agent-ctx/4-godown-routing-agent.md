# Task 4 — Godown Routing Parameter Propagation

## Summary
Enhanced Godown API routes with warehouse routing parameter propagation. When a godown/warehouse status changes between ACTIVE and SUSPENDED, the system now validates and reports pending operations and propagates routing parameters.

## Files Modified
1. **NEW**: `/home/z/my-project/src/app/api/godowns/routing-status/route.ts` — GET endpoint returning routing status matrix for all active warehouses
2. **ENHANCED**: `/home/z/my-project/src/app/api/godowns/[id]/route.ts` — PUT handler enhanced with pending operations check and routing propagation

## Key Changes

### routing-status/route.ts (NEW)
- GET /api/godowns/routing-status returns array of routing status objects
- Each object includes: id, code, name, status, productCount, pendingPurchaseOrders, pendingSalesOrders, pendingHireSales, pendingTransfers, isReceivable, isDispatchable
- Multi-tenant companyId filtering applied
- Uses withApiSecurity, Module Token: Sys-Structure-Matrix

### godowns/[id]/route.ts (ENHANCED PUT)
- ACTIVE → SUSPENDED: Pre-computes pending operations (POs, SOs, hire sales, transfers), includes warning in response if pending ops exist, logs routingPropagation in AuditLog
- SUSPENDED → ACTIVE: Logs routing unblock event with isReceivable/isDispatchable=true
- Suspension is NOT blocked — it's an emergency closure, only a warning is returned

## Verification
- `bun run lint` passed with zero errors
- Dev server stable on localhost:3000 (HTTP 200)
