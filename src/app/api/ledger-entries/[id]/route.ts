import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/ledger-entries/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ledgerEntry = await db.ledgerEntry.findUnique({
      where: { id },
    });

    if (!ledgerEntry) {
      return NextResponse.json(
        { error: 'Ledger entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(ledgerEntry);
  } catch (error) {
    console.error('Error fetching ledger entry:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ledger entry' },
      { status: 500 }
    );
  }
}

// PUT /api/ledger-entries/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { date, account, particulars, debit, credit, reference } = body;

    const result = await db.$transaction(async (tx) => {
      const ledgerEntry = await tx.ledgerEntry.update({
        where: { id },
        data: {
          ...(date && { date: new Date(date) }),
          ...(account && { account }),
          ...(particulars !== undefined && { particulars }),
          ...(debit !== undefined && { debit }),
          ...(credit !== undefined && { credit }),
          ...(reference !== undefined && { reference }),
        },
      });

      return ledgerEntry;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating ledger entry:', error);
    return NextResponse.json(
      { error: 'Failed to update ledger entry' },
      { status: 500 }
    );
  }
}

// DELETE /api/ledger-entries/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      await tx.ledgerEntry.delete({
        where: { id },
      });
    });

    return NextResponse.json({ message: 'Ledger entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting ledger entry:', error);
    return NextResponse.json(
      { error: 'Failed to delete ledger entry' },
      { status: 500 }
    );
  }
}
