// ============================================================
// TRANSFER AUTHORIZATION — Authorize/Reject transfer
// PUT /api/branches/transfer/[id] — Authorize/reject transfer
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
  type UserRole,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Companies', 'PUT');
  if (!security.authorized) return security.response;

  const { id } = await params;
  const companyId = security.user.companyId;
  const role = security.user.role as UserRole;

  // Only admin can authorize/reject
  if (role !== 'admin') {
    return NextResponse.json(
      { error: 'Only administrators can authorize or reject inter-branch transfers.' },
      { status: 403 }
    );
  }

  try {
    // Pre-fetch and cross-tenant check
    const existing = await db.interBranchTransfer.findFirst({
      where: { id, isActive: true },
      include: {
        fromBranch: { select: { id: true, name: true, status: true } },
        toBranch: { select: { id: true, name: true, status: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Transfer not found.' }, { status: 404 });
    }

    if (companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Transfer not found.' }, { status: 404 });
    }

    if (existing.status !== 'Pending' && existing.status !== 'Approved') {
      return NextResponse.json(
        { error: `Transfer is in "${existing.status}" status. Only Pending or Approved transfers can be modified.` },
        { status: 400 }
      );
    }

    const body = await request.json();
    const newStatus = body.status; // "Approved", "Completed", "Rejected", "Cancelled"

    if (!newStatus || !['Approved', 'Completed', 'Rejected', 'Cancelled'].includes(newStatus)) {
      return NextResponse.json(
        { error: 'Status must be one of: Approved, Completed, Rejected, Cancelled' },
        { status: 400 }
      );
    }

    // When rejecting — set status, don't touch inventory/bank
    if (newStatus === 'Rejected' || newStatus === 'Cancelled') {
      const transfer = await db.$transaction(async (tx) => {
        const record = await tx.interBranchTransfer.update({
          where: { id },
          data: {
            status: newStatus,
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'UPDATE',
            module: 'Holding-Consolidation-Core',
            recordId: record.id,
            recordLabel: record.transferNo,
            userId: security.user.id || 'system',
            userName: security.user.name || 'System',
            details: JSON.stringify({
              transferNo: record.transferNo,
              action: newStatus,
              previousStatus: existing.status,
            }),
          },
        });

        return record;
      });

      return NextResponse.json(transfer);
    }

    // When approving/completing — update stock or bank balances atomically
    if (newStatus === 'Approved' || newStatus === 'Completed') {
      // Check neither branch is SUSPENDED
      if (existing.fromBranch.status === 'SUSPENDED') {
        return NextResponse.json(
          { error: `Source branch "${existing.fromBranch.name}" is SUSPENDED. Cannot authorize transfer.` },
          { status: 403 }
        );
      }

      if (existing.toBranch.status === 'SUSPENDED') {
        return NextResponse.json(
          { error: `Destination branch "${existing.toBranch.name}" is SUSPENDED. Cannot authorize transfer.` },
          { status: 403 }
        );
      }

      if (existing.transferType === 'STOCK') {
        // Process stock transfer atomically
        const transfer = await db.$transaction(async (tx) => {
          // Get source branch godowns
          const sourceGodowns = await tx.godown.findMany({
            where: { branchId: existing.fromBranchId, isActive: true, status: 'ACTIVE' },
            select: { id: true },
          });
          const sourceGodownIds = sourceGodowns.map((g) => g.id);

          // Get destination branch godowns
          const destGodowns = await tx.godown.findMany({
            where: { branchId: existing.toBranchId, isActive: true, status: 'ACTIVE' },
            select: { id: true },
          });
          const destGodownIds = destGodowns.map((g) => g.id);

          if (destGodownIds.length === 0) {
            throw new Error('Destination branch has no active godowns. Cannot complete stock transfer.');
          }

          // Deduct stock from source branch godowns
          if (sourceGodownIds.length > 0 && existing.productId) {
            const sourceStocks = await tx.productStock.findMany({
              where: {
                productId: existing.productId,
                godownId: { in: sourceGodownIds },
                isActive: true,
                quantity: { gt: 0 },
              },
              orderBy: { quantity: 'desc' },
            });

            let remainingQty = existing.quantity;

            for (const stock of sourceStocks) {
              if (remainingQty <= 0) break;
              const deductQty = Math.min(stock.quantity, remainingQty);
              const newQty = safeFinancialSubtract(stock.quantity, deductQty);
              const newValue = safeFinancialRound(newQty * stock.costPrice);

              await tx.productStock.update({
                where: { id: stock.id },
                data: { quantity: newQty, totalValue: newValue },
              });

              // Create stock entry for source (OUT)
              await tx.stockEntry.create({
                data: {
                  productId: existing.productId,
                  godownId: stock.godownId,
                  type: 'OUT',
                  quantity: deductQty,
                  costPrice: stock.costPrice,
                  reference: existing.transferNo,
                  referenceType: 'InterBranchTransfer',
                  companyId: existing.companyId,
                  date: new Date(),
                  notes: `Inter-branch transfer to ${existing.toBranch.name}`,
                },
              });

              remainingQty = safeFinancialSubtract(remainingQty, deductQty);
            }

            if (remainingQty > 0) {
              throw new Error(`Insufficient stock at source branch. Short by ${remainingQty} units.`);
            }
          }

          // Add stock to destination branch godowns
          if (existing.productId) {
            // Find or create product stock at first destination godown
            const destGodownId = destGodownIds[0];
            let destStock = await tx.productStock.findFirst({
              where: {
                productId: existing.productId,
                godownId: destGodownId,
                isActive: true,
              },
            });

            if (destStock) {
              const newQty = safeFinancialAdd(destStock.quantity, existing.quantity);
              // Weighted average cost
              const newTotalValue = safeFinancialAdd(destStock.totalValue, existing.totalValue);
              const newCostPrice = newQty > 0 ? safeFinancialRound(newTotalValue / newQty) : destStock.costPrice;

              await tx.productStock.update({
                where: { id: destStock.id },
                data: {
                  quantity: newQty,
                  costPrice: newCostPrice,
                  totalValue: newTotalValue,
                },
              });
            } else {
              // Create new product stock entry
              await tx.productStock.create({
                data: {
                  productId: existing.productId,
                  godownId: destGodownId,
                  quantity: existing.quantity,
                  costPrice: existing.unitCost,
                  totalValue: existing.totalValue,
                  companyId: existing.companyId,
                  isActive: true,
                },
              });
            }

            // Create stock entry for destination (IN)
            await tx.stockEntry.create({
              data: {
                productId: existing.productId,
                godownId: destGodownId,
                type: 'IN',
                quantity: existing.quantity,
                costPrice: existing.unitCost,
                reference: existing.transferNo,
                referenceType: 'InterBranchTransfer',
                companyId: existing.companyId,
                date: new Date(),
                notes: `Inter-branch transfer from ${existing.fromBranch.name}`,
              },
            });
          }

          // Update transfer status
          const record = await tx.interBranchTransfer.update({
            where: { id },
            data: {
              status: newStatus,
            },
          });

          await tx.auditLog.create({
            data: {
              action: 'UPDATE',
              module: 'Holding-Consolidation-Core',
              recordId: record.id,
              recordLabel: record.transferNo,
              userId: security.user.id || 'system',
              userName: security.user.name || 'System',
              details: JSON.stringify({
                transferNo: record.transferNo,
                action: newStatus,
                previousStatus: existing.status,
                transferType: 'STOCK',
                quantity: existing.quantity,
                productId: existing.productId,
              }),
            },
          });

          return record;
        });

        return NextResponse.json(transfer);
      } else if (existing.transferType === 'FUND') {
        // Process fund transfer atomically
        const transfer = await db.$transaction(async (tx) => {
          // Debit source bank
          if (existing.fromBankId) {
            const sourceBank = await tx.bank.findFirst({
              where: { id: existing.fromBankId, isActive: true },
            });

            if (!sourceBank) {
              throw new Error('Source bank account not found.');
            }

            if (sourceBank.currentBalance < existing.fundAmount) {
              throw new Error(`Insufficient balance in source bank. Available: ${sourceBank.currentBalance}, Required: ${existing.fundAmount}`);
            }

            const newSourceBalance = safeFinancialSubtract(sourceBank.currentBalance, existing.fundAmount);
            await tx.bank.update({
              where: { id: existing.fromBankId },
              data: { currentBalance: newSourceBalance },
            });

            // Create bank transaction for source (Withdraw)
            await tx.bankTransaction.create({
              data: {
                transactionCode: `IBT-W-${existing.transferNo}`,
                type: 'Withdraw',
                amount: existing.fundAmount,
                bankId: existing.fromBankId,
                description: `Inter-branch fund transfer to ${existing.toBranch.name} (${existing.transferNo})`,
                companyId: existing.companyId,
                isActive: true,
              },
            });
          }

          // Credit destination bank
          if (existing.toBankId) {
            const destBank = await tx.bank.findFirst({
              where: { id: existing.toBankId, isActive: true },
            });

            if (!destBank) {
              throw new Error('Destination bank account not found.');
            }

            const newDestBalance = safeFinancialAdd(destBank.currentBalance, existing.fundAmount);
            await tx.bank.update({
              where: { id: existing.toBankId },
              data: { currentBalance: newDestBalance },
            });

            // Create bank transaction for destination (Deposit)
            await tx.bankTransaction.create({
              data: {
                transactionCode: `IBT-D-${existing.transferNo}`,
                type: 'Deposit',
                amount: existing.fundAmount,
                bankId: existing.toBankId,
                description: `Inter-branch fund transfer from ${existing.fromBranch.name} (${existing.transferNo})`,
                companyId: existing.companyId,
                isActive: true,
              },
            });
          }

          // Update transfer status
          const record = await tx.interBranchTransfer.update({
            where: { id },
            data: {
              status: newStatus,
            },
          });

          await tx.auditLog.create({
            data: {
              action: 'UPDATE',
              module: 'Holding-Consolidation-Core',
              recordId: record.id,
              recordLabel: record.transferNo,
              userId: security.user.id || 'system',
              userName: security.user.name || 'System',
              details: JSON.stringify({
                transferNo: record.transferNo,
                action: newStatus,
                previousStatus: existing.status,
                transferType: 'FUND',
                fundAmount: existing.fundAmount,
                fromBankId: existing.fromBankId,
                toBankId: existing.toBankId,
              }),
            },
          });

          return record;
        });

        return NextResponse.json(transfer);
      }
    }

    return NextResponse.json({ error: 'Invalid operation.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to authorize transfer';
    console.error('[InterBranchTransfer PUT] Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
