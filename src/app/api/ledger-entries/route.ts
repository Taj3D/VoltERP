import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/ledger-entries - List all ledger entries
export async function GET() {
  try {
    const ledgerEntries = await db.ledgerEntry.findMany({
      orderBy: { date: 'desc' },
    });
    return NextResponse.json(ledgerEntries);
  } catch (error) {
    console.error('Error fetching ledger entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ledger entries' },
      { status: 500 }
    );
  }
}

// POST /api/ledger-entries - Create a ledger entry
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, account, particulars, debit, credit, reference } = body;

    if (!date || !account) {
      return NextResponse.json(
        { error: 'date and account are required' },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const ledgerEntry = await tx.ledgerEntry.create({
        data: {
          date: new Date(date),
          account,
          particulars: particulars || null,
          debit: debit || 0,
          credit: credit || 0,
          reference: reference || null,
        },
      });

      return ledgerEntry;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating ledger entry:', error);
    return NextResponse.json(
      { error: 'Failed to create ledger entry' },
      { status: 500 }
    );
  }
}
