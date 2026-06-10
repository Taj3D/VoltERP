# Task 6d-6e-6g: Buttons/Dialogs/Tables Fix Agent

## Summary
Fixed three categories of responsive design issues:

1. **Button Heights (HIGH)**: Updated mobile button touch target from 36px → 44px with `.touch-exempt` opt-out class in `globals.css`
2. **Dialog Widths (VERIFIED OK)**: All 38 dialogs across 4 files already have `max-w-[95vw]` responsive base width — no changes needed
3. **Table Scroll Indicators (NEW)**: Added CSS for mobile touch-optimized scrolling and horizontal scroll fade indicator via mask-image gradient

## Files Changed
- `/home/z/my-project/src/app/globals.css` — Button min-height 36→44px + scroll indicator CSS

## Files Verified (No Changes Needed)
- `/home/z/my-project/src/components/ui/table.tsx` — Already has `overflow-x-auto` wrapper
- `/home/z/my-project/src/components/InventoryGroupPage.tsx` — 18 dialogs already responsive
- `/home/z/my-project/src/components/InvestmentGroupPage.tsx` — 13 dialogs already responsive
- `/home/z/my-project/src/components/SalesModulePage.tsx` — 5 dialogs already responsive
- `/home/z/my-project/src/components/AccountManagementPage.tsx` — 2 dialogs already responsive
