import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/hire-sales/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'HireSales', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const hireSale = await db.hireSales.findUnique({
      where: { id },
      include: {
        customer: true,
        godown: true,
        lines: {
          include: {
            product: true,
          },
        },
        installments: {
          orderBy: { installmentNo: 'asc' },
        },
      },
    });

    if (!hireSale) {
      return NextResponse.json(
        { error: 'Hire sale not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(hireSale);
  } catch (error) {
    console.error('Error fetching hire sale:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hire sale' },
      { status: 500 }
    );
  }
}

// PUT /api/hire-sales/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'HireSales', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      customerId, date, godownId, hireRate, duration, downPayment,
      installmentAmount, totalPaid, currentStatus, nextPaymentDate,
      returnDate, notes, status, vatPercentage, lines,
    } = body;

    // Period-close lock check: use request date or existing record's date
    const existing = await db.hireSales.findUnique({ where: { id }, select: { date: true } });
    const periodLock = await checkPeriodClose(date ? new Date(date) : existing?.date || new Date());
    if (periodLock) return periodLock;

    // Calculate grandTotal from lines if provided (with server-side hardening)
    let subTotal: number | undefined;
    let vatAmount: number | undefined;
    let grandTotal: number | undefined;
    let balanceAmount: number | undefined;
    let processedLines: any[] | undefined;
    const dp = downPayment ?? 0;
    const vatPct = vatPercentage ?? 0;

    if (lines) {
      processedLines = lines.map((line: any) => {
        const lineQty = Number(line.quantity) || 0;
        const lineRate = Number(line.rate) || 0;
        const lineDiscPct = Number(line.discountPercent) || 0;
        const lineDiscAmt = Number(line.discountAmount) || Math.round(lineQty * lineRate * (lineDiscPct / 100) * 100) / 100;
        const lineGross = Math.round(lineQty * lineRate * 100) / 100;
        const afterLineDisc = Math.round((lineGross - lineDiscAmt) * 100) / 100;
        const lineTotal = Math.round(afterLineDisc * 100) / 100;
        return {
          productId: line.productId,
          quantity: lineQty,
          rate: lineRate,
          discountPercent: lineDiscPct,
          discountAmount: lineDiscAmt,
          total: lineTotal,
        };
      });
      subTotal = Math.round(processedLines.reduce((sum, l) => sum + l.total, 0) * 100) / 100;
      const afterDownPayment = subTotal - dp;
      vatAmount = Math.round(afterDownPayment * (vatPct / 100) * 100) / 100;
      grandTotal = Math.round((afterDownPayment + vatAmount) * 100) / 100;
      balanceAmount = Math.round((grandTotal - dp) * 100) / 100;
    }

    const result = await db.$transaction(async (tx) => {
      if (lines) {
        await tx.hireSalesLine.deleteMany({
          where: { hireSalesId: id },
        });
      }

      // If installments need recalculation (duration changed)
      if (duration !== undefined && lines) {
        await tx.hireInstallment.deleteMany({
          where: { hireSalesId: id },
        });
      }

      const hireSale = await tx.hireSales.update({
        where: { id },
        data: {
          ...(customerId && { customerId }),
          ...(date && { date: new Date(date) }),
          ...(godownId !== undefined && { godownId: godownId || null }),
          ...(subTotal !== undefined && { subTotal }),
          ...(downPayment !== undefined && { downPayment: dp }),
          ...(hireRate !== undefined && { hireRate }),
          ...(duration !== undefined && { duration }),
          ...(installmentAmount !== undefined && { installmentAmount }),
          ...(balanceAmount !== undefined && { balanceAmount }),
          ...(totalPaid !== undefined && { totalPaid }),
          ...(currentStatus !== undefined && { currentStatus }),
          ...(nextPaymentDate !== undefined && {
            nextPaymentDate: nextPaymentDate ? new Date(nextPaymentDate) : null,
          }),
          ...(returnDate !== undefined && {
            returnDate: returnDate ? new Date(returnDate) : null,
          }),
          ...(grandTotal !== undefined && { grandTotal }),
          ...(vatPercentage !== undefined && { vatPercentage: vatPct }),
          ...(vatAmount !== undefined && { vatAmount }),
          ...(notes !== undefined && { notes }),
          ...(status && { status }),
          ...(processedLines && {
            lines: {
              create: processedLines.map((line) => ({
                productId: line.productId,
                quantity: line.quantity,
                rate: line.rate,
                discountPercent: line.discountPercent,
                discountAmount: line.discountAmount,
                total: line.total,
              })),
            },
          }),
        },
        include: {
          customer: true,
          godown: true,
          lines: { include: { product: true } },
        },
      });

      // Regenerate installments if duration changed and lines provided
      if (duration !== undefined && lines && subTotal) {
        const orderDate = new Date(hireSale.date);
        const effectiveDuration = duration || 1;
        const effectiveRate = hireSale.hireRate || 0;
        const effectiveBalance = balanceAmount ?? hireSale.balanceAmount;

        // Hire interest calculation: balanceAmount * (1 + hireRate/100) = total hire payable
        const hireInterestMultiplier = 1 + (effectiveRate / 100);
        const totalHirePayable = Math.round(effectiveBalance * hireInterestMultiplier * 100) / 100;
        const calcInstallment = hireSale.installmentAmount || (effectiveDuration > 0 ? Math.round((totalHirePayable / effectiveDuration) * 100) / 100 : 0);

        for (let i = 1; i <= effectiveDuration; i++) {
          const dueDate = new Date(orderDate.getFullYear(), orderDate.getMonth() + i, orderDate.getDate());
          await tx.hireInstallment.create({
            data: {
              hireSalesId: id,
              installmentNo: i,
              dueDate,
              amount: calcInstallment,
              status: 'Pending',
              paidAmount: 0,
              paidDate: null,
            },
          });
        }
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'HireSales',
          recordId: id,
          recordLabel: hireSale.invoiceNo,
          details: JSON.stringify({ currentStatus, grandTotal: hireSale.grandTotal }),
        },
      });

      return hireSale;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating hire sale:', error);
    return NextResponse.json(
      { error: 'Failed to update hire sale' },
      { status: 500 }
    );
  }
}

// DELETE /api/hire-sales/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'HireSales', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;

    // Period-close lock check: use existing record's date
    const existing = await db.hireSales.findUnique({ where: { id }, select: { date: true } });
    const periodLock = await checkPeriodClose(existing?.date || new Date());
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      const hs = await tx.hireSales.findUnique({ where: { id }, select: { invoiceNo: true } });

      await tx.hireInstallment.deleteMany({
        where: { hireSalesId: id },
      });

      await tx.hireSalesLine.deleteMany({
        where: { hireSalesId: id },
      });

      await tx.hireSales.delete({
        where: { id },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'HireSales',
          recordId: id,
          recordLabel: hs?.invoiceNo || id,
        },
      });
    });

    return NextResponse.json({ message: 'Hire sale deleted successfully' });
  } catch (error) {
    console.error('Error deleting hire sale:', error);
    return NextResponse.json(
      { error: 'Failed to delete hire sale' },
      { status: 500 }
    );
  }
}
