import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskForVatAuditor,
  safeFinancialAdd,
  safeFinancialSubtract,
  safeFinancialRound,
} from '@/lib/api-security';
import type { UserRole } from '@/lib/api-security';

// ============================================================
// POST /api/hire-sales/installment-payment — Pay an installment
// ============================================================
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'HireSales', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const { hireSalesId, installmentId, paidAmount, paidDate, paymentRef, notes } = body;

    // ── Validation ──
    if (!hireSalesId || !installmentId || paidAmount === undefined || paidAmount <= 0) {
      return NextResponse.json(
        { error: 'hireSalesId, installmentId, and paidAmount (greater than 0) are required' },
        { status: 400 }
      );
    }

    // Fetch hire sale
    const hireSale = await db.hireSales.findUnique({
      where: { id: hireSalesId },
      include: {
        customer: true,
        installments: { orderBy: { installmentNo: 'asc' } },
      },
    });

    if (!hireSale || !hireSale.isActive) {
      return NextResponse.json(
        { error: 'Hire sale not found' },
        { status: 404 }
      );
    }

    if (hireSale.currentStatus !== 'Active') {
      return NextResponse.json(
        { error: `Hire sale is not Active. Current status: ${hireSale.currentStatus}. Only active hire sales can receive installment payments.` },
        { status: 400 }
      );
    }

    // Fetch installment
    const installment = await db.hireInstallment.findUnique({
      where: { id: installmentId },
    });

    if (!installment) {
      return NextResponse.json(
        { error: 'Installment not found' },
        { status: 404 }
      );
    }

    if (installment.hireSalesId !== hireSalesId) {
      return NextResponse.json(
        { error: 'Installment does not belong to the specified hire sale' },
        { status: 400 }
      );
    }

    if (installment.status === 'Paid') {
      return NextResponse.json(
        { error: 'This installment has already been fully paid' },
        { status: 400 }
      );
    }

    if (installment.status === 'WrittenOff') {
      return NextResponse.json(
        { error: 'This installment has been written off' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const paymentDate = paidDate ? new Date(paidDate) : new Date();
    const periodLock = await checkPeriodClose(paymentDate);
    if (periodLock) return periodLock;

    // ── Transaction: Update installment, hire sale, AR ──
    const result = await db.$transaction(async (tx) => {
      // Determine new installment status
      const newPaidAmount = safeFinancialAdd(installment.paidAmount, paidAmount);
      let newInstallmentStatus: string;
      if (newPaidAmount >= installment.amount) {
        newInstallmentStatus = 'Paid';
      } else {
        newInstallmentStatus = 'Partial';
      }

      // Update installment
      const updatedInstallment = await tx.hireInstallment.update({
        where: { id: installmentId },
        data: {
          paidAmount: newPaidAmount,
          paidDate: paymentDate,
          paymentRef: paymentRef || null,
          notes: notes || installment.notes,
          status: newInstallmentStatus,
        },
      });

      // Update HireSales: totalPaid += paidAmount, outstandingBalance -= paidAmount
      const newTotalPaid = safeFinancialAdd(hireSale.totalPaid, paidAmount);
      let newOutstandingBalance = safeFinancialSubtract(hireSale.outstandingBalance, paidAmount);
      if (newOutstandingBalance < 0) newOutstandingBalance = 0;

      let newCurrentStatus = hireSale.currentStatus;
      if (newOutstandingBalance <= 0) {
        newCurrentStatus = 'Completed';
      }

      // Find next unpaid installment for nextPaymentDate
      const allInstallments = await tx.hireInstallment.findMany({
        where: { hireSalesId },
        orderBy: { installmentNo: 'asc' },
      });
      const nextUnpaid = allInstallments.find(
        (i) => i.status === 'Pending' || i.status === 'Overdue' || i.status === 'Partial'
      );

      await tx.hireSales.update({
        where: { id: hireSalesId },
        data: {
          totalPaid: newTotalPaid,
          outstandingBalance: newOutstandingBalance,
          currentStatus: newCurrentStatus,
          nextPaymentDate: nextUnpaid?.dueDate || null,
        },
      });

      // ── AR Integration ──
      // Customer is paying — reduce Dr balance (Cr side effect)
      const customer = hireSale.customer;
      if (customer) {
        let newBalance: number;
        let newBalanceType: string;

        if (customer.currentBalanceType === 'Dr') {
          // Customer has Dr balance (owes money), paying reduces it
          newBalance = safeFinancialSubtract(customer.currentBalance, paidAmount);
          if (newBalance < 0) {
            // Flipped to Cr (customer overpaid)
            newBalance = Math.abs(newBalance);
            newBalanceType = 'Cr';
          } else {
            newBalanceType = 'Dr';
          }
        } else {
          // Customer has Cr balance (is owed money), paying increases Cr
          newBalance = safeFinancialAdd(customer.currentBalance, paidAmount);
          newBalanceType = 'Cr';
        }

        // Auto-toggle creditStatus: if new balance is below creditLimit, toggle from OverLimit to Active
        const updateData: Record<string, unknown> = {
          currentBalance: Math.max(0, newBalance),
          currentBalanceType: newBalanceType,
        };

        if (customer.creditStatus === 'OverLimit' && customer.creditLimit > 0) {
          if (newBalanceType === 'Dr' && newBalance <= customer.creditLimit) {
            updateData.creditStatus = 'Active';
          } else if (newBalanceType === 'Cr') {
            updateData.creditStatus = 'Active';
          }
        }

        await tx.customer.update({
          where: { id: customer.id },
          data: updateData,
        });
      }

      // ── Audit log ──
      await tx.auditLog.create({
        data: {
          action: 'INSTALLMENT_PAYMENT',
          module: 'HireSales',
          recordId: hireSalesId,
          recordLabel: hireSale.invoiceNo,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            installmentId,
            installmentNo: installment.installmentNo,
            paidAmount,
            paymentRef: paymentRef || null,
            installmentStatus: newInstallmentStatus,
            hireSalesStatus: newCurrentStatus,
            newTotalPaid,
            newOutstandingBalance,
          }),
        },
      });

      return {
        installment: updatedInstallment,
        hireSale: {
          totalPaid: newTotalPaid,
          outstandingBalance: newOutstandingBalance,
          currentStatus: newCurrentStatus,
          nextPaymentDate: nextUnpaid?.dueDate || null,
        },
      };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    console.error('Error processing installment payment:', error);
    const message = error instanceof Error ? error.message : 'Failed to process installment payment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================
// GET /api/hire-sales/installment-payment — Get Installment Schedule
// Query param: hireSalesId
// Returns: hire sale details + full installment schedule with
// computed real-time overdue status and penalties
// ============================================================
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'HireSales', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const hireSalesId = searchParams.get('hireSalesId');

    if (!hireSalesId) {
      return NextResponse.json(
        { error: 'hireSalesId query parameter is required' },
        { status: 400 }
      );
    }

    const hireSale = await db.hireSales.findUnique({
      where: { id: hireSalesId },
      include: {
        customer: true,
        godown: true,
        company: true,
        lines: {
          include: {
            product: {
              include: {
                category: true,
                brand: true,
              },
            },
          },
        },
        installments: {
          orderBy: { installmentNo: 'asc' },
        },
      },
    });

    if (!hireSale || !hireSale.isActive) {
      return NextResponse.json(
        { error: 'Hire sale not found' },
        { status: 404 }
      );
    }

    // ── Compute real-time overdue status and penalties ──
    const now = new Date();
    const computedInstallments = hireSale.installments.map((inst) => {
      const computed = { ...inst };

      if (inst.status === 'Pending' || inst.status === 'Overdue' || inst.status === 'Partial') {
        const dueDate = new Date(inst.dueDate);
        if (dueDate < now) {
          const overdueDays = Math.floor(
            (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          computed.overdueDays = overdueDays;

          if (overdueDays > 0) {
            computed.status = 'Overdue';
            const penaltyRate = hireSale.penaltyRate || 0;
            if (penaltyRate > 0) {
              computed.penaltyAmount = safeFinancialRound(overdueDays * (inst.amount * penaltyRate / 100));
            }
          }
        }
      }

      // Compute remaining amount
      const remainingAmount = safeFinancialSubtract(inst.amount, inst.paidAmount);
      (computed as Record<string, unknown>).remainingAmount = Math.max(0, remainingAmount);

      return computed;
    });

    // Compute summary stats
    const totalInstallments = hireSale.installments.length;
    const paidCount = hireSale.installments.filter((i) => i.status === 'Paid').length;
    const overdueCount = computedInstallments.filter((i) => i.status === 'Overdue').length;
    const pendingCount = computedInstallments.filter(
      (i) => i.status === 'Pending' || i.status === 'Partial'
    ).length;
    const totalPenaltyAccrued = safeFinancialRound(
      computedInstallments.reduce((sum, i) => safeFinancialAdd(sum, i.penaltyAmount || 0), 0)
    );
    const totalPaidFromInstallments = safeFinancialRound(
      hireSale.installments.reduce((sum, i) => safeFinancialAdd(sum, i.paidAmount || 0), 0)
    );
    const progressPercent = totalInstallments > 0
      ? Math.round((paidCount / totalInstallments) * 100)
      : 0;

    // VAT Auditor masking
    const HIRE_SALE_MASKED_FIELDS = [
      'subTotal', 'downPayment', 'hireRate', 'installmentAmount',
      'balanceAmount', 'totalPaid', 'grandTotal', 'vatAmount',
      'totalInterestAmount', 'totalHirePayable', 'outstandingBalance',
      'penaltyRate', 'totalPenaltyAmount', 'cogsTotal',
    ];
    const maskedHireSale = maskForVatAuditor(
      hireSale as unknown as Record<string, unknown>,
      security.user.role as UserRole,
      HIRE_SALE_MASKED_FIELDS
    );

    const maskedInstallments = computedInstallments.map((inst) =>
      maskForVatAuditor(
        inst as unknown as Record<string, unknown>,
        security.user.role as UserRole,
        ['amount', 'principalAmount', 'interestAmount', 'paidAmount', 'penaltyAmount', 'remainingAmount']
      )
    );

    return NextResponse.json({
      hireSale: maskedHireSale,
      installments: maskedInstallments,
      summary: {
        totalInstallments,
        paidCount,
        overdueCount,
        pendingCount,
        totalPenaltyAccrued,
        totalPaidFromInstallments,
        outstandingBalance: hireSale.outstandingBalance,
        totalHirePayable: hireSale.totalHirePayable,
        progressPercent,
      },
    });
  } catch (error) {
    console.error('Error fetching installment schedule:', error);
    return NextResponse.json(
      { error: 'Failed to fetch installment schedule' },
      { status: 500 }
    );
  }
}
