import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'PaymentOptions', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.paymentOption.findUnique({ where: { id } });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'PaymentOptions', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const record = await tx.paymentOption.update({
        where: { id },
        data: {
          name: body.name,
          isActive: body.isActive ?? true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'PaymentOptions',
          recordId: record.id,
          recordLabel: record.name || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ name: record.name }),
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
  const security = await withApiSecurity(request, 'PaymentOptions', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      const record = await tx.paymentOption.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // FK check: Check if payment option is referenced by active records
      const [
        activeCardTypeSetups,
        activeExpenses,
        activeIncomes,
        activeSalesOrders,
        activeCashCollections,
        activeCashDeliveries,
      ] = await Promise.all([
        tx.cardTypeSetup.count({ where: { paymentOptionId: id, isActive: true } }),
        tx.expense.count({ where: { paymentOptionId: id, isActive: true } }),
        tx.income.count({ where: { paymentOptionId: id, isActive: true } }),
        tx.salesOrder.count({ where: { paymentOptionId: id, isActive: true } }),
        tx.cashCollection.count({ where: { paymentOptionId: id, isActive: true } }),
        tx.cashDelivery.count({ where: { paymentOptionId: id, isActive: true } }),
      ]);

      const totalRefs = activeCardTypeSetups + activeExpenses + activeIncomes + activeSalesOrders + activeCashCollections + activeCashDeliveries;
      if (totalRefs > 0) {
        throw new Error(
          `Cannot delete: Payment Option is referenced by ${activeCardTypeSetups} card type setup(s), ${activeExpenses} expense(s), ${activeIncomes} income(s), ${activeSalesOrders} sales order(s), ${activeCashCollections} cash collection(s), ${activeCashDeliveries} cash deliver(y/ies)`
        );
      }

      await tx.paymentOption.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'PaymentOptions',
          recordId: record.id,
          recordLabel: record.name || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ name: record.name, softDelete: true }),
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
