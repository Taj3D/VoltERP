import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Banks', 'GET');
  if (!security.authorized) return security.response;
  try {
    const items = await db.bank.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        bankTransactions: {
          where: { isActive: true },
          select: { type: true, amount: true },
        },
      },
    });
    // Calculate currentBalance dynamically: openingBalance + deposits - withdrawals
    const computed = items.map(bank => {
      const depositTotal = bank.bankTransactions
        .filter((t: any) => t.type === 'Deposit')
        .reduce((sum: number, t: any) => sum + t.amount, 0);
      const withdrawTotal = bank.bankTransactions
        .filter((t: any) => t.type === 'Withdraw' || t.type === 'Transfer')
        .reduce((sum: number, t: any) => sum + t.amount, 0);
      const computedBalance = bank.openingBalance + depositTotal - withdrawTotal;
      // Use computed balance; if it differs from stored, update the record
      const { bankTransactions, ...bankData } = bank;
      return { ...bankData, currentBalance: computedBalance };
    });
    // Background: sync any stale currentBalance values
    computed.forEach(async (bank) => {
      const original = items.find(b => b.id === bank.id);
      if (original && Math.abs(original.currentBalance - bank.currentBalance) > 0.01) {
        await db.bank.update({ where: { id: bank.id }, data: { currentBalance: bank.currentBalance } }).catch(() => {});
      }
    });
    return NextResponse.json(computed);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch banks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Banks', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const openingBalance = body.openingBalance ?? 0;
      const record = await tx.bank.create({
        data: {
          bankName: body.bankName,
          branch: body.branch || null,
          accountNo: body.accountNo,
          accountHolder: body.accountHolder,
          openingBalance,
          currentBalance: openingBalance, // FIX 4: Set currentBalance = openingBalance on creation
          isActive: body.isActive ?? true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Banks',
          recordId: record.id,
          recordLabel: record.bankName || record.accountNo || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ bankName: record.bankName, accountNo: record.accountNo, openingBalance, currentBalance: openingBalance }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create bank' }, { status: 500 });
  }
}
