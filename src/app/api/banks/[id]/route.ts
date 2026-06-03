import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskForVatAuditorFinancial,
  checkFinancialDeletePermission,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Valid bankType values
const VALID_BANK_TYPES = ['Bank', 'MFS', 'CashDrawer'] as const;
type BankType = (typeof VALID_BANK_TYPES)[number];

/**
 * Strip HTML tags from a string to prevent XSS in text fields.
 */
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Banks', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;
  const role = security.user.role;

  try {
    const { id } = await params;
    const item = await db.bank.findUnique({
      where: { id },
      include: { chartOfAccount: true },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Cross-tenant validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Apply VAT Auditor masking
    const masked = maskForVatAuditorFinancial(item, role);
    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch bank' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Banks', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const body = await request.json();

    // Cross-tenant validation
    const existing = await db.bank.findUnique({
      where: { id },
      include: { chartOfAccount: true },
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // ── Bank Type Validation ──
    const bankType: BankType = body.bankType || existing.bankType || 'Bank';
    if (!VALID_BANK_TYPES.includes(bankType)) {
      return NextResponse.json(
        { error: `Invalid bankType "${bankType}". Must be one of: ${VALID_BANK_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // ── Text Sanitizer: strip HTML tags ──
    const bankName = body.bankName !== undefined ? stripHtml(String(body.bankName)) : existing.bankName;
    const branch = body.branch !== undefined ? (body.branch ? stripHtml(String(body.branch)) : null) : existing.branch;
    const accountNo = body.accountNo !== undefined ? stripHtml(String(body.accountNo)) : existing.accountNo;
    const accountHolder = body.accountHolder !== undefined ? stripHtml(String(body.accountHolder)) : existing.accountHolder;

    // ── Opening Balance Validation ──
    const rawOpening = Number(body.openingBalance ?? existing.openingBalance);
    if (rawOpening < 0) {
      return NextResponse.json(
        { error: 'Opening balance must be zero or positive.' },
        { status: 400 }
      );
    }
    const openingBalance = safeFinancialRound(rawOpening);

    // ── Update Bank + CoA sync (atomic transaction) ──
    const record = await db.$transaction(async (tx) => {
      const bank = await tx.bank.update({
        where: { id },
        data: {
          bankName,
          bankType,
          branch,
          accountNo,
          accountHolder,
          openingBalance,
          isActive: body.isActive ?? existing.isActive,
        },
        include: { chartOfAccount: true },
      });

      // If bank has a linked CoA node, sync changes
      if (existing.chartOfAccountId) {
        const coaUpdateData: Record<string, unknown> = {};

        // Sync openingBalance to CoA node
        if (openingBalance !== existing.openingBalance) {
          coaUpdateData.openingBalance = openingBalance;
        }

        // Sync name if bankName or accountNo changed
        const newCoaName = `${bankName} - ${accountNo}`;
        if (existing.chartOfAccount && existing.chartOfAccount.name !== newCoaName) {
          coaUpdateData.name = newCoaName;
        }

        if (Object.keys(coaUpdateData).length > 0) {
          await tx.chartOfAccount.update({
            where: { id: existing.chartOfAccountId },
            data: coaUpdateData,
          });
        }
      }

      // Log audit with module 'Sys-Catalog-Core'
      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'Sys-Catalog-Core',
        recordId: bank.id,
        recordLabel: bank.bankName || bank.accountNo || bank.id,
        userId: security.user?.id || 'system',
        userName: security.user?.name || 'System',
        details: JSON.stringify({
          bankName: bank.bankName,
          bankType: bank.bankType,
          accountNo: bank.accountNo,
          openingBalance,
          chartOfAccountId: existing.chartOfAccountId || null,
          companyId,
        }),
      });

      return bank;
    });

    return NextResponse.json(record);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update bank' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Banks', 'DELETE');
  if (!security.authorized) return security.response;

  // Only administrators can delete financial entities
  const deleteCheck = checkFinancialDeletePermission(security.user.role);
  if (deleteCheck) return deleteCheck;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      const record = await tx.bank.findUnique({
        where: { id },
        include: { chartOfAccount: true },
      });
      if (!record) throw new Error('Not found');

      // Cross-tenant validation
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Not found');
      }

      // FK Check: Check if bank is referenced by active transactions
      const [
        activeBankTransactions,
        activeExpenses,
        activeIncomes,
        activeCashCollections,
        activeCashDeliveries,
      ] = await Promise.all([
        tx.bankTransaction.count({ where: { bankId: id, isActive: true } }),
        tx.expense.count({ where: { bankId: id, isActive: true } }),
        tx.income.count({ where: { bankId: id, isActive: true } }),
        tx.cashCollection.count({ where: { bankId: id, isActive: true } }),
        tx.cashDelivery.count({ where: { bankId: id, isActive: true } }),
      ]);

      const totalRefs =
        activeBankTransactions +
        activeExpenses +
        activeIncomes +
        activeCashCollections +
        activeCashDeliveries;
      if (totalRefs > 0) {
        throw new Error(
          `Cannot delete: Bank is referenced by ${activeBankTransactions} transaction(s), ${activeExpenses} expense(s), ${activeIncomes} income(s), ${activeCashCollections} cash collection(s), ${activeCashDeliveries} cash deliver(y/ies)`
        );
      }

      // Soft delete the bank
      await tx.bank.update({
        where: { id },
        data: { isActive: false },
      });

      // Deactivate linked CoA node
      if (record.chartOfAccountId) {
        await tx.chartOfAccount.update({
          where: { id: record.chartOfAccountId },
          data: { isActive: false },
        });
      }

      // Log audit with module 'Sys-Catalog-Core'
      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'Sys-Catalog-Core',
        recordId: record.id,
        recordLabel: record.bankName || record.accountNo || record.id,
        userId: security.user?.id || 'system',
        userName: security.user?.name || 'System',
        details: JSON.stringify({
          bankName: record.bankName,
          accountNo: record.accountNo,
          chartOfAccountId: record.chartOfAccountId || null,
          coaDeactivated: !!record.chartOfAccountId,
          softDelete: true,
          companyId,
        }),
      });

      return record;
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message?.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error?.message === 'Not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete bank' },
      { status: 500 }
    );
  }
}
