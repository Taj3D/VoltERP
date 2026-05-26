import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/hire-sales - List all hire sales with relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'HireSales', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const customerId = searchParams.get('customerId');
    const currentStatus = searchParams.get('currentStatus');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (currentStatus) where.currentStatus = currentStatus;

    const hireSales = await db.hireSales.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(hireSales);
  } catch (error) {
    console.error('Error fetching hire sales:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hire sales' },
      { status: 500 }
    );
  }
}

// POST /api/hire-sales - Create hire sale with lines and installment schedule
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'HireSales', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const {
      customerId, date, godownId, hireRate, duration, downPayment,
      installmentAmount, totalPaid, currentStatus, nextPaymentDate,
      returnDate, notes, vatPercentage, lines,
    } = body;

    if (!customerId || !date || !lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'customerId, date, and lines are required' },
        { status: 400 }
      );
    }

    if (!duration || duration <= 0) {
      return NextResponse.json(
        { error: 'Duration (months) is required for hire sales' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(new Date(date));
    if (periodLock) return periodLock;

    // Calculate subTotal from lines (server-side hardened)
    const processedLines = lines.map((line: any) => {
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
    const subTotal = Math.round(processedLines.reduce((sum, l) => sum + l.total, 0) * 100) / 100;

    const dp = downPayment || 0;
    const vatPct = vatPercentage || 0;
    const afterDownPayment = subTotal - dp;
    const vatAmt = Math.round(afterDownPayment * (vatPct / 100) * 100) / 100;
    const grandTotal = Math.round((afterDownPayment + vatAmt) * 100) / 100;
    const balanceAmount = Math.round((grandTotal - dp) * 100) / 100;

    // Hire interest calculation: balanceAmount * (1 + hireRate/100) = total hire payable
    const effectiveRate = hireRate || 0;
    const hireInterestMultiplier = 1 + (effectiveRate / 100);
    const totalHirePayable = Math.round(balanceAmount * hireInterestMultiplier * 100) / 100;
    const calcInstallment = installmentAmount || (duration > 0 ? Math.round((totalHirePayable / duration) * 100) / 100 : 0);

    // Calculate next payment date (1 month from date)
    const orderDate = new Date(date);
    const nextPayDate = nextPaymentDate ? new Date(nextPaymentDate) : new Date(orderDate.getFullYear(), orderDate.getMonth() + 1, orderDate.getDate());

    // Calculate return date (duration months from date)
    const retDate = returnDate ? new Date(returnDate) : new Date(orderDate.getFullYear(), orderDate.getMonth() + duration, orderDate.getDate());

    // Auto-generate invoiceNo with 5-digit padding: HIR-XXXXX
    const lastHire = await db.hireSales.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { invoiceNo: true },
    });

    let nextNum = 1;
    if (lastHire?.invoiceNo) {
      const match = lastHire.invoiceNo.match(/HIR-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const invoiceNo = `HIR-${String(nextNum).padStart(5, '0')}`;

    const result = await db.$transaction(async (tx) => {
      // Create hire sale with lines
      const hireSale = await tx.hireSales.create({
        data: {
          invoiceNo,
          customerId,
          date: new Date(date),
          godownId: godownId || null,
          subTotal,
          downPayment: dp,
          hireRate: effectiveRate,
          duration,
          installmentAmount: calcInstallment,
          balanceAmount,
          totalPaid: totalPaid || 0,
          currentStatus: currentStatus || 'Active',
          nextPaymentDate: nextPayDate,
          returnDate: retDate,
          grandTotal,
          vatPercentage: vatPct,
          vatAmount: vatAmt,
          notes: notes || null,
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
        },
        include: {
          customer: true,
          godown: true,
          lines: { include: { product: true } },
        },
      });

      // Generate installment schedule (all Pending, down payment handled separately)
      for (let i = 1; i <= duration; i++) {
        const dueDate = new Date(orderDate.getFullYear(), orderDate.getMonth() + i, orderDate.getDate());
        await tx.hireInstallment.create({
          data: {
            hireSalesId: hireSale.id,
            installmentNo: i,
            dueDate,
            amount: calcInstallment,
            status: 'Pending',
            paidAmount: 0,
            paidDate: null,
          },
        });
      }

      // Create StockEntry (type="OUT") for each line
      for (const line of processedLines) {
        await tx.stockEntry.create({
          data: {
            productId: line.productId,
            godownId: godownId || null,
            type: 'OUT',
            quantity: line.quantity,
            reference: invoiceNo,
            referenceType: 'HireSales',
            date: new Date(date),
          },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'HireSales',
          recordId: hireSale.id,
          recordLabel: invoiceNo,
          details: JSON.stringify({ customerId, grandTotal, duration, installmentAmount: calcInstallment }),
        },
      });

      return hireSale;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating hire sale:', error);
    return NextResponse.json(
      { error: 'Failed to create hire sale' },
      { status: 500 }
    );
  }
}
