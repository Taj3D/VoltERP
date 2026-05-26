import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/replacements/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Replacements', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const replacement = await db.replacementOrder.findUnique({
      where: { id },
      include: {
        salesOrder: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!replacement) {
      return NextResponse.json(
        { error: 'Replacement order not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(replacement);
  } catch (error) {
    console.error('Error fetching replacement order:', error);
    return NextResponse.json(
      { error: 'Failed to fetch replacement order' },
      { status: 500 }
    );
  }
}

// PUT /api/replacements/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Replacements', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const { salesOrderId, date, reason, status, lines } = body;

    const result = await db.$transaction(async (tx) => {
      if (lines) {
        await tx.replacementOrderLine.deleteMany({
          where: { replacementOrderId: id },
        });
      }

      const replacement = await tx.replacementOrder.update({
        where: { id },
        data: {
          ...(salesOrderId !== undefined && { salesOrderId: salesOrderId || null }),
          ...(date && { date: new Date(date) }),
          ...(reason !== undefined && { reason }),
          ...(status && { status }),
          ...(lines && {
            lines: {
              create: lines.map(
                (line: {
                  productId: string;
                  quantity: number;
                  rate: number;
                  total: number;
                }) => ({
                  productId: line.productId,
                  quantity: line.quantity,
                  rate: line.rate,
                  total: line.total,
                })
              ),
            },
          }),
        },
        include: {
          salesOrder: true,
          lines: { include: { product: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Replacements',
          recordId: replacement.id,
          recordLabel: replacement.replacementNo || replacement.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ replacementNo: replacement.replacementNo, status: replacement.status }),
        },
      });

      return replacement;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating replacement order:', error);
    return NextResponse.json(
      { error: 'Failed to update replacement order' },
      { status: 500 }
    );
  }
}

// DELETE /api/replacements/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Replacements', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      const record = await tx.replacementOrder.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // ReplacementOrder has no external FK references (lines are cascade-deleted)
      // Safe to soft-delete
      await tx.replacementOrder.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Replacements',
          recordId: record.id,
          recordLabel: record.replacementNo || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ replacementNo: record.replacementNo, softDelete: true }),
        },
      });

      return record;
    });

    return NextResponse.json({ message: 'Replacement order deleted successfully' });
  } catch (error) {
    console.error('Error deleting replacement order:', error);
    return NextResponse.json(
      { error: 'Failed to delete replacement order' },
      { status: 500 }
    );
  }
}
