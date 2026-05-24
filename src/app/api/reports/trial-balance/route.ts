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

    return NextResponse.json({
      entries: trialBalance,
      grandTotalDebit,
      grandTotalCredit,
      balanced: grandTotalDebit === grandTotalCredit,
    });
  } catch (error) {
    console.error('Error generating trial balance:', error);
    return NextResponse.json(
      { error: 'Failed to generate trial balance' },
      { status: 500 }
    );
  }
}
