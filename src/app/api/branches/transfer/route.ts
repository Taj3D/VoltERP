// ============================================================
// INTER-BRANCH TRANSFER ENGINE — List & Create
// GET  /api/branches/transfer — List inter-branch transfers
// POST /api/branches/transfer — Create inter-branch transfer (stock or fund)
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

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'BranchTransfers', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const transferType = searchParams.get('transferType');
    const fromBranchId = searchParams.get('fromBranchId');
    const toBranchId = searchParams.get('toBranchId');

    const where: Record<string, unknown> = {
      isActive: true,
      ...(companyId ? { companyId } : {}),
      ...(status ? { status } : {}),
      ...(transferType ? { transferType } : {}),
      ...(fromBranchId ? { fromBranchId } : {}),
      ...(toBranchId ? { toBranchId } : {}),
    };

    const transfers = await db.interBranchTransfer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        fromBranch: { select: { id: true, name: true, code: true, status: true } },
        toBranch: { select: { id: true, name: true, code: true, status: true } },
        company: { select: { id: true, name: true, code: true } },
      },
    });

    return NextResponse.json(transfers);
  } catch (error) {
    console.error('[InterBranchTransfer GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch inter-branch transfers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'BranchTransfers', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;
  const role = security.user.role as UserRole;

  // Only admin/manager can create transfers
  if (role !== 'admin' && role !== 'manager') {
    return NextResponse.json(
      { error: 'Only administrators and managers can create inter-branch transfers.' },
      { status: 403 }
    );
  }

  if (!companyId) {
    return NextResponse.json(
      { error: 'Company ID is required. User must be associated with a company.' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();

    // Validate required fields
    if (!body.fromBranchId || !body.toBranchId) {
      return NextResponse.json(
        { error: 'Source branch (fromBranchId) and destination branch (toBranchId) are required.' },
        { status: 400 }
      );
    }

    if (!body.transferType || !['STOCK', 'FUND'].includes(body.transferType)) {
      return NextResponse.json(
        { error: 'Transfer type must be "STOCK" or "FUND".' },
        { status: 400 }
      );
    }

    if (body.fromBranchId === body.toBranchId) {
      return NextResponse.json(
        { error: 'Source and destination branches cannot be the same.' },
        { status: 400 }
      );
    }

    // Validate both branches belong to same company
    const [fromBranch, toBranch] = await Promise.all([
      db.branch.findFirst({ where: { id: body.fromBranchId, isActive: true } }),
      db.branch.findFirst({ where: { id: body.toBranchId, isActive: true } }),
    ]);

    if (!fromBranch) {
      return NextResponse.json(
        { error: 'Source branch not found or inactive.' },
        { status: 404 }
      );
    }

    if (!toBranch) {
      return NextResponse.json(
        { error: 'Destination branch not found or inactive.' },
        { status: 404 }
      );
    }

    if (fromBranch.companyId !== companyId || toBranch.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Both branches must belong to the same company.' },
        { status: 403 }
      );
    }

    // Check neither branch is SUSPENDED
    if (fromBranch.status === 'SUSPENDED') {
      return NextResponse.json(
        { error: `Source branch "${fromBranch.name}" is SUSPENDED. All inter-branch transfers are frozen for this branch.` },
        { status: 403 }
      );
    }

    if (toBranch.status === 'SUSPENDED') {
      return NextResponse.json(
        { error: `Destination branch "${toBranch.name}" is SUSPENDED. All inter-branch transfers are frozen for this branch.` },
        { status: 403 }
      );
    }

    let quantity = 0;
    let unitCost = 0;
    let totalValue = 0;
    let fundAmount = 0;

    if (body.transferType === 'STOCK') {
      // Validate product exists
      if (!body.productId) {
        return NextResponse.json(
          { error: 'Product ID is required for STOCK transfers.' },
          { status: 400 }
        );
      }

      const product = await db.product.findFirst({
        where: { id: body.productId, isActive: true },
      });

      if (!product) {
        return NextResponse.json(
          { error: 'Product not found or inactive.' },
          { status: 404 }
        );
      }

      quantity = safeFinancialRound(body.quantity || 0);
      if (quantity <= 0) {
        return NextResponse.json(
          { error: 'Quantity must be greater than 0 for STOCK transfers.' },
          { status: 400 }
        );
      }

      // Validate source branch has sufficient stock
      // Get all godowns for the source branch
      const sourceGodowns = await db.godown.findMany({
        where: { branchId: body.fromBranchId, isActive: true },
        select: { id: true },
      });
      const sourceGodownIds = sourceGodowns.map((g) => g.id);

      if (sourceGodownIds.length > 0) {
        const sourceStock = await db.productStock.aggregate({
          where: {
            productId: body.productId,
            godownId: { in: sourceGodownIds },
            isActive: true,
          },
          _sum: { quantity: true },
        });

        const availableQty = safeFinancialRound(sourceStock._sum.quantity || 0);
        if (availableQty < quantity) {
          return NextResponse.json(
            { error: `Insufficient stock at source branch. Available: ${availableQty}, Requested: ${quantity}` },
            { status: 400 }
          );
        }
      }

      unitCost = safeFinancialRound(body.unitCost || product.costPrice || 0);
      totalValue = safeFinancialRound(quantity * unitCost);
    } else {
      // FUND transfer
      fundAmount = safeFinancialRound(body.fundAmount || 0);
      if (fundAmount <= 0) {
        return NextResponse.json(
          { error: 'Fund amount must be greater than 0 for FUND transfers.' },
          { status: 400 }
        );
      }

      // Validate source bank has sufficient balance
      if (body.fromBankId) {
        const sourceBank = await db.bank.findFirst({
          where: { id: body.fromBankId, companyId, isActive: true },
        });
        if (!sourceBank) {
          return NextResponse.json(
            { error: 'Source bank account not found.' },
            { status: 404 }
          );
        }
        if (sourceBank.currentBalance < fundAmount) {
          return NextResponse.json(
            { error: `Insufficient balance in source bank. Available: ${sourceBank.currentBalance}, Requested: ${fundAmount}` },
            { status: 400 }
          );
        }
      }

      // Validate destination bank exists
      if (body.toBankId) {
        const destBank = await db.bank.findFirst({
          where: { id: body.toBankId, companyId, isActive: true },
        });
        if (!destBank) {
          return NextResponse.json(
            { error: 'Destination bank account not found.' },
            { status: 404 }
          );
        }
      }
    }

    // Auto-generate transferNo (IBT-XXXXX format)
    const lastTransfer = await db.interBranchTransfer.findFirst({
      where: { companyId },
      orderBy: { transferNo: 'desc' },
      select: { transferNo: true },
    });
    const lastNum = lastTransfer?.transferNo
      ? parseInt(lastTransfer.transferNo.replace('IBT-', ''), 10) || 0
      : 0;
    const transferNo = `IBT-${String(lastNum + 1).padStart(5, '0')}`;

    const transfer = await db.$transaction(async (tx) => {
      const record = await tx.interBranchTransfer.create({
        data: {
          transferNo,
          fromBranchId: body.fromBranchId,
          toBranchId: body.toBranchId,
          transferType: body.transferType,
          status: 'Pending',
          productId: body.transferType === 'STOCK' ? body.productId : null,
          quantity,
          unitCost,
          totalValue,
          fundAmount,
          fromBankId: body.fromBankId || null,
          toBankId: body.toBankId || null,
          companyId,
          notes: body.notes || null,
          reason: body.reason || null,
          isActive: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Holding-Consolidation-Core',
          recordId: record.id,
          recordLabel: record.transferNo,
          userId: security.user.id || 'system',
          userName: security.user.name || 'System',
          details: JSON.stringify({
            transferNo,
            transferType: record.transferType,
            fromBranchId: body.fromBranchId,
            toBranchId: body.toBranchId,
            quantity,
            totalValue,
            fundAmount,
            status: 'Pending',
          }),
        },
      });

      return record;
    });

    return NextResponse.json(transfer, { status: 201 });
  } catch (error) {
    console.error('[InterBranchTransfer POST] Error:', error);
    return NextResponse.json({ error: 'Failed to create inter-branch transfer' }, { status: 500 });
  }
}
