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
// GET /api/hire-sales/[id] — Single hire sale with full relations
// ============================================================
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

    // VAT Auditor masking
    const HIRE_SALE_MASKED_FIELDS = [
      'subTotal', 'downPayment', 'hireRate', 'installmentAmount',
      'balanceAmount', 'totalPaid', 'grandTotal', 'vatAmount',
      'totalInterestAmount', 'totalHirePayable', 'outstandingBalance',
      'penaltyRate', 'totalPenaltyAmount', 'cogsTotal',
    ];
    const HIRE_LINE_MASKED_FIELDS = [
      'rate', 'discountPercent', 'discountAmount', 'total', 'costPrice', 'cogsAmount',
    ];

    const masked = maskForVatAuditor(
      hireSale as unknown as Record<string, unknown>,
      security.user.role as UserRole,
      HIRE_SALE_MASKED_FIELDS
    );
    if (hireSale.lines) {
      (masked as Record<string, unknown>).lines = hireSale.lines.map((line) =>
        maskForVatAuditor(
          line as unknown as Record<string, unknown>,
          security.user.role as UserRole,
          HIRE_LINE_MASKED_FIELDS
        )
      );
    }
    if (hireSale.installments) {
      (masked as Record<string, unknown>).installments = hireSale.installments.map((inst) =>
        maskForVatAuditor(
          inst as unknown as Record<string, unknown>,
          security.user.role as UserRole,
          ['amount', 'principalAmount', 'interestAmount', 'paidAmount', 'penaltyAmount']
        )
      );
    }

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching hire sale:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hire sale' },
      { status: 500 }
    );
  }
}

// ============================================================
// PUT /api/hire-sales/[id] — Update hire sale
// Recalculates interest if duration/hireRate changes,
// handles status transitions, adjusts AR
// ============================================================
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
      currentStatus, nextPaymentDate, returnDate, notes, status,
      vatPercentage, penaltyRate, lines, companyId,
    } = body;

    // Fetch existing record
    const existing = await db.hireSales.findUnique({
      where: { id },
      include: {
        lines: true,
        installments: { orderBy: { installmentNo: 'asc' } },
        customer: true,
      },
    });

    if (!existing || !existing.isActive) {
      return NextResponse.json(
        { error: 'Hire sale not found' },
        { status: 404 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(date ? new Date(date) : existing.date);
    if (periodLock) return periodLock;

    // ── Determine if recalculation is needed ──
    const effectiveDuration = duration ?? existing.duration;
    const effectiveHireRate = hireRate ?? existing.hireRate;
    const effectiveDownPayment = downPayment ?? existing.downPayment;
    const effectiveVatPct = vatPercentage ?? existing.vatPercentage;
    const effectivePenaltyRate = penaltyRate ?? existing.penaltyRate;
    const needsRecalc = lines || hireRate !== undefined || duration !== undefined || downPayment !== undefined || vatPercentage !== undefined;

    let subTotal: number | undefined;
    let balanceAmount: number | undefined;
    let vatAmount: number | undefined;
    let grandTotal: number | undefined;
    let totalInterestAmount: number | undefined;
    let totalHirePayable: number | undefined;
    let installmentAmount: number | undefined;
    let outstandingBalance: number | undefined;
    let cogsTotal: number | undefined;
    let processedLines: {
      productId: string;
      quantity: number;
      rate: number;
      discountPercent: number;
      discountAmount: number;
      total: number;
      costPrice: number;
      cogsAmount: number;
    }[] | undefined;

    if (needsRecalc) {
      // Recalculate from lines if provided, or use existing lines
      if (lines && lines.length > 0) {
        processedLines = [];
        cogsTotal = 0;
        for (const line of lines) {
          const lineQty = Number(line.quantity) || 0;
          const lineRate = Number(line.rate) || 0;
          const lineDiscPct = Number(line.discountPercent) || 0;
          const lineDiscAmt = Number(line.discountAmount) || safeFinancialRound(lineQty * lineRate * (lineDiscPct / 100));
          const lineGross = safeFinancialRound(lineQty * lineRate);
          const afterLineDisc = safeFinancialSubtract(lineGross, lineDiscAmt);
          const lineTotal = safeFinancialRound(afterLineDisc);

          const product = await db.product.findUnique({
            where: { id: line.productId },
            select: { costPrice: true },
          });
          const cp = product?.costPrice || 0;
          const cogsAmount = safeFinancialRound(lineQty * cp);
          cogsTotal = safeFinancialAdd(cogsTotal, cogsAmount);

          processedLines.push({
            productId: line.productId,
            quantity: lineQty,
            rate: lineRate,
            discountPercent: lineDiscPct,
            discountAmount: lineDiscAmt,
            total: lineTotal,
            costPrice: cp,
            cogsAmount,
          });
        }
        subTotal = safeFinancialRound(processedLines.reduce((sum, l) => sum + l.total, 0));
      } else {
        subTotal = existing.subTotal;
        cogsTotal = existing.cogsTotal;
      }

      const dp = effectiveDownPayment;
      balanceAmount = safeFinancialSubtract(subTotal, dp);
      vatAmount = safeFinancialRound(balanceAmount * (effectiveVatPct / 100));
      grandTotal = safeFinancialAdd(balanceAmount, vatAmount);

      // Simple interest: totalInterestAmount = balanceAmount * (effectiveRate / 100) * (duration / 12)
      totalInterestAmount = safeFinancialRound(balanceAmount * (effectiveHireRate / 100) * (effectiveDuration / 12));
      totalHirePayable = safeFinancialAdd(balanceAmount, totalInterestAmount);
      installmentAmount = effectiveDuration > 0 ? safeFinancialRound(totalHirePayable / effectiveDuration) : 0;
      // outstandingBalance = totalHirePayable - totalPaid
      outstandingBalance = safeFinancialSubtract(totalHirePayable, existing.totalPaid);
      if (outstandingBalance < 0) outstandingBalance = 0;
    }

    // ── Handle status transitions ──
    let newCurrentStatus = currentStatus ?? existing.currentStatus;
    if (outstandingBalance !== undefined && outstandingBalance <= 0) {
      newCurrentStatus = 'Completed';
    }

    const result = await db.$transaction(async (tx) => {
      // Delete and recreate lines if provided
      if (processedLines) {
        await tx.hireSalesLine.deleteMany({ where: { hireSalesId: id } });
      }

      // If duration or hireRate changed, regenerate installment schedule
      const regenerateInstallments = (duration !== undefined && duration !== existing.duration) ||
        (hireRate !== undefined && hireRate !== existing.hireRate) ||
        (downPayment !== undefined && downPayment !== existing.downPayment);

      if (regenerateInstallments) {
        await tx.hireInstallment.deleteMany({ where: { hireSalesId: id } });
      }

      const effectiveBalance = balanceAmount ?? existing.balanceAmount;
      const effectiveRate = effectiveHireRate;
      const effectiveDur = effectiveDuration;

      const hireSale = await tx.hireSales.update({
        where: { id },
        data: {
          ...(customerId && { customerId }),
          ...(date && { date: new Date(date) }),
          ...(godownId !== undefined && { godownId: godownId || null }),
          ...(subTotal !== undefined && { subTotal }),
          ...(downPayment !== undefined && { downPayment: effectiveDownPayment }),
          ...(hireRate !== undefined && { hireRate: effectiveRate }),
          ...(duration !== undefined && { duration: effectiveDur }),
          ...(installmentAmount !== undefined && { installmentAmount }),
          ...(balanceAmount !== undefined && { balanceAmount: effectiveBalance }),
          ...(vatPercentage !== undefined && { vatPercentage: effectiveVatPct }),
          ...(vatAmount !== undefined && { vatAmount }),
          ...(grandTotal !== undefined && { grandTotal }),
          ...(totalInterestAmount !== undefined && { totalInterestAmount }),
          ...(totalHirePayable !== undefined && { totalHirePayable }),
          ...(outstandingBalance !== undefined && { outstandingBalance }),
          ...(penaltyRate !== undefined && { penaltyRate: effectivePenaltyRate }),
          ...(cogsTotal !== undefined && { cogsTotal }),
          ...(currentStatus !== undefined && { currentStatus: newCurrentStatus }),
          ...(nextPaymentDate !== undefined && {
            nextPaymentDate: nextPaymentDate ? new Date(nextPaymentDate) : null,
          }),
          ...(returnDate !== undefined && {
            returnDate: returnDate ? new Date(returnDate) : null,
          }),
          ...(notes !== undefined && { notes }),
          ...(status && { status }),
          ...(companyId !== undefined && { companyId }),
          ...(processedLines && {
            lines: {
              create: processedLines.map((line) => ({
                productId: line.productId,
                quantity: line.quantity,
                rate: line.rate,
                discountPercent: line.discountPercent,
                discountAmount: line.discountAmount,
                total: line.total,
                costPrice: line.costPrice,
                cogsAmount: line.cogsAmount,
              })),
            },
          }),
        },
        include: {
          customer: true,
          godown: true,
          company: true,
          lines: { include: { product: { include: { category: true, brand: true } } } },
        },
      });

      // Regenerate installments if needed
      if (regenerateInstallments) {
        const orderDate = new Date(hireSale.date);
        const principalPerInstallment = effectiveDur > 0 ? safeFinancialRound(effectiveBalance / effectiveDur) : 0;

        for (let i = 1; i <= effectiveDur; i++) {
          const dueDate = new Date(orderDate.getFullYear(), orderDate.getMonth() + i, orderDate.getDate());
          const remainingPrincipal = safeFinancialSubtract(effectiveBalance, (i - 1) * principalPerInstallment);
          const interestAmt = safeFinancialRound(remainingPrincipal * (effectiveRate / 100) / 12);
          const amount = safeFinancialAdd(principalPerInstallment, interestAmt);

          await tx.hireInstallment.create({
            data: {
              hireSalesId: id,
              installmentNo: i,
              dueDate,
              amount,
              principalAmount: principalPerInstallment,
              interestAmount: interestAmt,
              paidAmount: 0,
              paidDate: null,
              overdueDays: 0,
              penaltyAmount: 0,
              status: 'Pending',
            },
          });
        }

        // Update nextPaymentDate to first installment
        if (effectiveDur > 0) {
          const firstDue = new Date(orderDate.getFullYear(), orderDate.getMonth() + 1, orderDate.getDate());
          await tx.hireSales.update({
            where: { id },
            data: { nextPaymentDate: firstDue },
          });
        }
      }

      // ── AR Integration on status transition ──
      if (currentStatus && currentStatus !== existing.currentStatus) {
        const currentCustomer = await tx.customer.findUnique({ where: { id: hireSale.customerId } });
        if (currentCustomer) {
          if (currentStatus === 'Cancelled') {
            // Reverse AR: reduce Dr balance by grandTotal
            let newBalance: number;
            let newBalanceType: string;
            const reverseAmount = existing.grandTotal;

            if (currentCustomer.currentBalanceType === 'Dr') {
              newBalance = safeFinancialSubtract(currentCustomer.currentBalance, reverseAmount);
              if (newBalance < 0) {
                newBalance = Math.abs(newBalance);
                newBalanceType = 'Cr';
              } else {
                newBalanceType = 'Dr';
              }
            } else {
              newBalance = safeFinancialAdd(currentCustomer.currentBalance, reverseAmount);
              newBalanceType = 'Cr';
            }

            await tx.customer.update({
              where: { id: hireSale.customerId },
              data: {
                currentBalance: Math.max(0, newBalance),
                currentBalanceType: newBalanceType,
                ...(currentCustomer.creditLimit > 0 && newBalanceType === 'Dr' && newBalance <= currentCustomer.creditLimit && currentCustomer.creditStatus === 'OverLimit'
                  ? { creditStatus: 'Active' }
                  : {}),
              },
            });

            // Reverse stock entries
            const stockEntries = await tx.stockEntry.findMany({
              where: { reference: existing.invoiceNo, referenceType: 'HireSales' },
            });
            for (const entry of stockEntries) {
              await tx.stockEntry.create({
                data: {
                  productId: entry.productId,
                  godownId: entry.godownId,
                  type: 'IN',
                  quantity: entry.quantity,
                  reference: `${existing.invoiceNo}-REVERSE`,
                  referenceType: 'HireSales',
                  date: new Date(),
                },
              });
            }
          } else if (currentStatus === 'Completed' && existing.currentStatus === 'Active') {
            // No AR adjustment needed for completion — installments handle the payments
          }
        }
      }

      // ── Audit log ──
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'HireSales',
          recordId: id,
          recordLabel: hireSale.invoiceNo,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            previousStatus: existing.currentStatus,
            newStatus: newCurrentStatus,
            grandTotal: hireSale.grandTotal,
            ...(totalInterestAmount !== undefined && { totalInterestAmount }),
            ...(totalHirePayable !== undefined && { totalHirePayable }),
            ...(installmentAmount !== undefined && { installmentAmount }),
            ...(regenerateInstallments && { installmentsRegenerated: true }),
          }),
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

// ============================================================
// DELETE /api/hire-sales/[id] — Soft delete with stock reversal
// and AR adjustment
// ============================================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'HireSales', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;

    // Fetch existing record for validation
    const existing = await db.hireSales.findUnique({
      where: { id },
      include: {
        customer: true,
        lines: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Hire sale not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Hire sale is already deleted' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(existing.date);
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      // ── Stock Reversal: Create IN entries for each OUT entry ──
      const stockEntries = await tx.stockEntry.findMany({
        where: { reference: existing.invoiceNo, referenceType: 'HireSales' },
      });
      for (const entry of stockEntries) {
        await tx.stockEntry.create({
          data: {
            productId: entry.productId,
            godownId: entry.godownId,
            type: 'IN',
            quantity: entry.quantity,
            reference: `${existing.invoiceNo}-DELETE-REVERSE`,
            referenceType: 'HireSales',
            date: new Date(),
            notes: `Reversal for deleted hire sale ${existing.invoiceNo}`,
          },
        });
      }

      // ── AR Adjustment: Reverse the Dr posting ──
      const customer = existing.customer;
      if (customer) {
        let newBalance: number;
        let newBalanceType: string;
        const reverseAmount = existing.grandTotal;

        if (customer.currentBalanceType === 'Dr') {
          newBalance = safeFinancialSubtract(customer.currentBalance, reverseAmount);
          if (newBalance < 0) {
            newBalance = Math.abs(newBalance);
            newBalanceType = 'Cr';
          } else {
            newBalanceType = 'Dr';
          }
        } else {
          // Customer has Cr balance, reducing Dr effectively increases Cr
          newBalance = safeFinancialAdd(customer.currentBalance, reverseAmount);
          newBalanceType = 'Cr';
        }

        const updateData: Record<string, unknown> = {
          currentBalance: Math.max(0, newBalance),
          currentBalanceType: newBalanceType,
        };

        // Auto-toggle from OverLimit to Active if balance is now within limit
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

      // Soft delete the hire sale
      await tx.hireSales.update({
        where: { id },
        data: {
          isActive: false,
          currentStatus: 'Cancelled',
          status: 'Cancelled',
        },
      });

      // ── Audit log ──
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'HireSales',
          recordId: id,
          recordLabel: existing.invoiceNo || id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            softDelete: true,
            previousStatus: existing.currentStatus,
            previousGrandTotal: existing.grandTotal,
            stockReversed: stockEntries.length,
            arReversed: true,
          }),
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
