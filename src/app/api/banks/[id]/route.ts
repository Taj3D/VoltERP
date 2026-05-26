import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Banks', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.bank.findUnique({ where: { id } });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Banks', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const record = await tx.bank.update({
        where: { id },
        data: {
          bankName: body.bankName,
          branch: body.branch || null,
          accountNo: body.accountNo,
          accountHolder: body.accountHolder,
          openingBalance: body.openingBalance ?? 0,
          isActive: body.isActive ?? true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Banks',
          recordId: record.id,
          recordLabel: record.bankName || record.accountNo || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ bankName: record.bankName, accountNo: record.accountNo }),
        },
      });

      return record;
    });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Banks', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      const record = await tx.bank.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // FK check: Check if bank is referenced by active transactions
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

      const totalRefs = activeBankTransactions + activeExpenses + activeIncomes + activeCashCollections + activeCashDeliveries;
      if (totalRefs > 0) {
        throw new Error(
          `Cannot delete: Bank is referenced by ${activeBankTransactions} transaction(s), ${activeExpenses} expense(s), ${activeIncomes} income(s), ${activeCashCollections} cash collection(s), ${activeCashDeliveries} cash deliver(y/ies)`
        );
      }

      await tx.bank.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Banks',
          recordId: record.id,
          recordLabel: record.bankName || record.accountNo || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ bankName: record.bankName, accountNo: record.accountNo, softDelete: true }),
        },
      });

      return record;
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message?.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
