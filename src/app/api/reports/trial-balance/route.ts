import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const ledgerEntries = await db.ledgerEntry.findMany();

    // Group by account and sum debits and credits
    const accountMap = new Map<string, { account: string; totalDebit: number; totalCredit: number }>();

    for (const entry of ledgerEntries) {
      const existing = accountMap.get(entry.account);
      if (existing) {
        existing.totalDebit += entry.debit;
        existing.totalCredit += entry.credit;
      } else {
        accountMap.set(entry.account, {
          account: entry.account,
          totalDebit: entry.debit,
          totalCredit: entry.credit,
        });
      }
    }

    const trialBalance = Array.from(accountMap.values()).sort((a, b) =>
      a.account.localeCompare(b.account)
    );

    const grandTotalDebit = trialBalance.reduce((sum, entry) => sum + entry.totalDebit, 0);
    const grandTotalCredit = trialBalance.reduce((sum, entry) => sum + entry.totalCredit, 0);

    // Bar chart data: top accounts by debit/credit
    const chartData = trialBalance
      .filter(e => e.totalDebit > 0 || e.totalCredit > 0)
      .slice(0, 10)
      .map(e => ({
        account: e.account.length > 15 ? e.account.substring(0, 15) + '…' : e.account,
        debit: e.totalDebit,
        credit: e.totalCredit,
      }));

    // Pie chart data: account balance distribution
    const pieData = trialBalance
      .filter(e => Math.abs(e.totalDebit - e.totalCredit) > 0)
      .map(e => ({
        name: e.account.length > 20 ? e.account.substring(0, 20) + '…' : e.account,
        value: Math.abs(e.totalDebit - e.totalCredit),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

    return NextResponse.json({
      entries: trialBalance,
      grandTotalDebit,
      grandTotalCredit,
      balanced: grandTotalDebit === grandTotalCredit,
      chartData,
      pieData: pieData.map((d, i) => ({ ...d, color: PIE_COLORS[i % PIE_COLORS.length] })),
    });
  } catch (error) {
    console.error('Error generating trial balance:', error);
    return NextResponse.json(
      { error: 'Failed to generate trial balance' },
      { status: 500 }
    );
  }
}
