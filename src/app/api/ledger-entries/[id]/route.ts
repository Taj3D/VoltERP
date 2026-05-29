import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  safeFinancialRound,
  checkFinancialDeletePermission,
  maskAccountingArray,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Helper: Check if a date falls within a locked period (scoped by companyId)
async function isPeriodLocked(
  date: Date,
  companyId: string | null
): Promise<boolean> {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const where: Record<string, unknown> = {
    periodMonth: month,
    periodYear: year,
    isLocked: true,
  };
  // STAGE 12: Scope period lock check to the user's company
  if (companyId) {
    where.companyId = companyId;
  }
  const lockedPeriod = await db.periodClose.findFirst({ where });
  return !!lockedPeriod;
}

// GET /api/ledger-entries/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'LedgerEntries', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const companyId = security.user.companyId;
    const ledgerEntry = await db.ledgerEntry.findUnique({
      where: { id },
      include: { chartOfAccount: true },
    });

    if (!ledgerEntry) {
      return NextResponse.json(
        { error: 'Ledger entry not found' },
        { status: 404 }
      );
    }

    // STAGE 12: Multi-tenant isolation — verify companyId matches
    if (companyId && ledgerEntry.companyId && ledgerEntry.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Ledger entry not found' },
        { status: 404 }
      );
    }

    // STAGE 12: VAT Auditor masking — apply maskAccountingArray for vat_auditor role
    const responseData =
      security.user.role === 'vat_auditor'
        ? maskAccountingArray([ledgerEntry], security.user.role)[0]
        : ledgerEntry;

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error fetching ledger entry:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ledger entry' },
      { status: 500 }
    );
  }
}

// PUT /api/ledger-entries/[id] - entryCode immutable, period lock validation, double-entry validation
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'LedgerEntries', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      date,
      account,
      particulars,
      debit,
      credit,
      reference,
      referenceType,
      accountId,
    } = body;
    const companyId = security.user.companyId;

    // Verify entry exists
    const existing = await db.ledgerEntry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Ledger entry not found' },
        { status: 404 }
      );
    }

    // STAGE 12: Multi-tenant isolation — verify companyId matches
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Ledger entry not found' },
        { status: 404 }
      );
    }

    // PERIOD LOCK VALIDATION: Cannot update if existing date falls within locked period
    // STAGE 12: scoped by companyId
    const existingDateLocked = await isPeriodLocked(
      new Date(existing.date),
      companyId
    );
    if (existingDateLocked) {
      return NextResponse.json(
        {
          error: 'Cannot update entry: existing entry date falls within a locked period',
        },
        { status: 403 }
      );
    }

    if (date) {
      const newDateLocked = await isPeriodLocked(new Date(date), companyId);
      if (newDateLocked) {
        return NextResponse.json(
          {
            error: 'Cannot update entry: new date falls within a locked period',
          },
          { status: 403 }
        );
      }
    }

    // Double-entry validation on update: compute the final debit/credit values
    const finalDebit =
      debit !== undefined ? safeFinancialRound(Number(debit)) : existing.debit;
    const finalCredit =
      credit !== undefined
        ? safeFinancialRound(Number(credit))
        : existing.credit;

    if (finalDebit > 0 && finalCredit > 0) {
      return NextResponse.json(
        {
          error: 'Double-entry violation: an entry cannot have both debit and credit > 0',
        },
        { status: 400 }
      );
    }
    if (finalDebit === 0 && finalCredit === 0) {
      return NextResponse.json(
        { error: 'Either debit or credit must be greater than 0' },
        { status: 400 }
      );
    }
    if (finalDebit < 0 || finalCredit < 0) {
      return NextResponse.json(
        { error: 'Debit and credit values must be non-negative' },
        { status: 400 }
      );
    }

    // Validate accountId if provided
    if (accountId) {
      const coa = await db.chartOfAccount.findUnique({
        where: { id: accountId, isActive: true },
      });
      if (!coa) {
        return NextResponse.json(
          { error: 'Chart of account not found for the given accountId' },
          { status: 400 }
        );
      }
    }

    const result = await db.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = {};
      if (date !== undefined) updateData.date = new Date(date);
      if (account !== undefined) updateData.account = account;
      if (particulars !== undefined) updateData.particulars = particulars;
      // STAGE 12: Safe math — use safeFinancialRound instead of parseFloat
      if (debit !== undefined)
        updateData.debit = safeFinancialRound(Number(debit));
      if (credit !== undefined)
        updateData.credit = safeFinancialRound(Number(credit));
      if (reference !== undefined) updateData.reference = reference;
      if (referenceType !== undefined)
        updateData.referenceType = referenceType;
      if (accountId !== undefined) updateData.accountId = accountId || null;

      const ledgerEntry = await tx.ledgerEntry.update({
        where: { id },
        data: updateData,
        include: { chartOfAccount: true },
      });

      // Create AuditLog entry (legacy — kept for transaction atomicity)
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Acc-Chart-Of-Accounts',
          recordId: id,
          recordLabel: existing.entryCode,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({
            before: {
              date: existing.date,
              account: existing.account,
              debit: existing.debit,
              credit: existing.credit,
              reference: existing.reference,
              referenceType: existing.referenceType,
              accountId: existing.accountId,
            },
            after: updateData,
          }),
        },
      });

      return ledgerEntry;
    });

    // STAGE 12: Activity logging — module token 'Acc-Chart-Of-Accounts'
    await logUserActivity({
      action: 'UPDATE',
      module: 'Acc-Chart-Of-Accounts',
      recordId: id,
      recordLabel: existing.entryCode,
      userId: security.user?.id,
      userName: security.user?.name,
      details: JSON.stringify({
        before: {
          date: existing.date,
          account: existing.account,
          debit: existing.debit,
          credit: existing.credit,
          reference: existing.reference,
          referenceType: existing.referenceType,
          accountId: existing.accountId,
        },
        after: {
          date,
          account,
          particulars,
          debit,
          credit,
          reference,
          referenceType,
          accountId,
        },
      }),
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error updating ledger entry:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to update ledger entry';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/ledger-entries/[id] - Period lock validation, soft delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'LedgerEntries', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    // STAGE 12: checkFinancialDeletePermission — only admin can delete
    const deleteDenied = checkFinancialDeletePermission(security.user.role);
    if (deleteDenied) return deleteDenied;

    const existing = await db.ledgerEntry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Ledger entry not found' },
        { status: 404 }
      );
    }

    // STAGE 12: Multi-tenant isolation — verify companyId matches
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Ledger entry not found' },
        { status: 404 }
      );
    }

    // PERIOD LOCK VALIDATION — STAGE 12: scoped by companyId
    const locked = await isPeriodLocked(new Date(existing.date), companyId);
    if (locked) {
      return NextResponse.json(
        {
          error: 'Cannot delete entry: entry date falls within a locked period',
        },
        { status: 403 }
      );
    }

    await db.$transaction(async (tx) => {
      await tx.ledgerEntry.update({
        where: { id },
        data: { isActive: false },
      });

      // Create AuditLog entry (legacy — kept for transaction atomicity)
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Acc-Chart-Of-Accounts',
          recordId: id,
          recordLabel: existing.entryCode,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({
            softDelete: true,
            entryCode: existing.entryCode,
            account: existing.account,
            debit: existing.debit,
            credit: existing.credit,
            date: existing.date,
          }),
        },
      });
    });

    // STAGE 12: Activity logging — module token 'Acc-Chart-Of-Accounts'
    await logUserActivity({
      action: 'DELETE',
      module: 'Acc-Chart-Of-Accounts',
      recordId: id,
      recordLabel: existing.entryCode,
      userId: security.user?.id,
      userName: security.user?.name,
      details: JSON.stringify({
        softDelete: true,
        entryCode: existing.entryCode,
        account: existing.account,
        debit: existing.debit,
        credit: existing.credit,
        date: existing.date,
      }),
    });

    return NextResponse.json({
      message: 'Ledger entry deactivated successfully',
    });
  } catch (error) {
    console.error('Error deleting ledger entry:', error);
    return NextResponse.json(
      { error: 'Failed to delete ledger entry' },
      { status: 500 }
    );
  }
}
