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
import { logUserActivity } from '@/lib/activity-logger';

/**
 * Strip HTML tags from a string to prevent XSS in text fields.
 */
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

// ============================================================
// GET /api/hire-sales — List all hire sales with relations
// Includes real-time overdue installment processing
// ============================================================
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'HireSales', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const customerId = searchParams.get('customerId');
    const currentStatus = searchParams.get('currentStatus');
    const companyId = searchParams.get('companyId');

    const where: Record<string, unknown> = { isActive: true };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (currentStatus) where.currentStatus = currentStatus;
    if (companyId) where.companyId = companyId;
    // Company isolation for non-admin users
    if (security.user.companyId && !companyId) {
      where.companyId = security.user.companyId;
    }

    const hireSales = await db.hireSales.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
    });

    // ── Real-time overdue interest update ──
    const now = new Date();
    for (const sale of hireSales) {
      if (sale.currentStatus !== 'Active') continue;

      let needsUpdate = false;
      let totalPenaltyAccrued = sale.totalPenaltyAmount || 0;
      let paidInstallmentTotal = 0;

      for (const inst of sale.installments) {
        if (inst.status === 'Paid') {
          paidInstallmentTotal = safeFinancialAdd(paidInstallmentTotal, inst.paidAmount);
          continue;
        }
        if (inst.status === 'Pending' || inst.status === 'Overdue' || inst.status === 'Partial') {
          const dueDate = new Date(inst.dueDate);
          if (dueDate < now) {
            const overdueDays = Math.floor(
              (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            if (overdueDays > 0 && inst.status !== 'Overdue') {
              needsUpdate = true;
            }
            if (overdueDays > 0) {
              const penaltyRate = sale.penaltyRate || 0;
              let penaltyAmount = 0;
              if (penaltyRate > 0) {
                penaltyAmount = safeFinancialRound(overdueDays * (inst.amount * penaltyRate / 100));
              }
              totalPenaltyAccrued = safeFinancialAdd(totalPenaltyAccrued, penaltyAmount);
              needsUpdate = true;
            }
          }
        }
      }

      if (needsUpdate) {
        // Update overdue installments in background
        const activeInstallments = sale.installments.filter(
          (i) => i.status === 'Pending' || i.status === 'Overdue' || i.status === 'Partial'
        );
        for (const inst of activeInstallments) {
          const dueDate = new Date(inst.dueDate);
          if (dueDate < now) {
            const overdueDays = Math.floor(
              (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            if (overdueDays > 0) {
              const penaltyRate = sale.penaltyRate || 0;
              let penaltyAmount = 0;
              if (penaltyRate > 0) {
                penaltyAmount = safeFinancialRound(overdueDays * (inst.amount * penaltyRate / 100));
              }
              await db.hireInstallment.update({
                where: { id: inst.id },
                data: {
                  status: 'Overdue',
                  overdueDays,
                  penaltyAmount,
                },
              });
            }
          }
        }

        // Recalculate outstanding balance
        const totalPaidAll = safeFinancialAdd(paidInstallmentTotal, sale.totalPaid - paidInstallmentTotal > 0 ? sale.totalPaid - paidInstallmentTotal : 0);
        const outstandingBalance = safeFinancialSubtract(sale.totalHirePayable, sale.totalPaid);
        await db.hireSales.update({
          where: { id: sale.id },
          data: {
            outstandingBalance: Math.max(0, outstandingBalance),
            totalPenaltyAmount: totalPenaltyAccrued,
          },
        });
      }
    }

    // Re-fetch after overdue updates if any changes were made
    const updatedHireSales = await db.hireSales.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
    });

    // VAT Auditor masking for monetary fields
    const HIRE_SALE_MASKED_FIELDS = [
      'subTotal', 'downPayment', 'hireRate', 'installmentAmount',
      'balanceAmount', 'totalPaid', 'grandTotal', 'vatAmount',
      'totalInterestAmount', 'totalHirePayable', 'outstandingBalance',
      'penaltyRate', 'totalPenaltyAmount', 'cogsTotal',
    ];
    const HIRE_LINE_MASKED_FIELDS = [
      'rate', 'discountPercent', 'discountAmount', 'total', 'costPrice', 'cogsAmount',
    ];

    const maskedHireSales = updatedHireSales.map((sale) => {
      const masked = maskForVatAuditor(
        sale as unknown as Record<string, unknown>,
        security.user.role as UserRole,
        HIRE_SALE_MASKED_FIELDS
      );
      if (sale.lines) {
        (masked as Record<string, unknown>).lines = sale.lines.map((line) =>
          maskForVatAuditor(
            line as unknown as Record<string, unknown>,
            security.user.role as UserRole,
            HIRE_LINE_MASKED_FIELDS
          )
        );
      }
      if (sale.installments) {
        (masked as Record<string, unknown>).installments = sale.installments.map((inst) =>
          maskForVatAuditor(
            inst as unknown as Record<string, unknown>,
            security.user.role as UserRole,
            ['amount', 'principalAmount', 'interestAmount', 'paidAmount', 'penaltyAmount']
          )
        );
      }
      return masked;
    });

    return NextResponse.json(maskedHireSales);
  } catch (error) {
    console.error('Error fetching hire sales:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hire sales' },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/hire-sales — Create hire sale with lines,
// COGS calculation, hire interest, installment schedule,
// stock entries, and AR integration
// ============================================================
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'HireSales', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const {
      customerId, date, godownId, hireRate, duration, downPayment,
      vatPercentage, penaltyRate, notes, lines, companyId,
    } = body;

    // ── Validation ──
    if (!customerId || !date || !lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'customerId, date, and lines are required' },
        { status: 400 }
      );
    }
    if (!duration || duration <= 0) {
      return NextResponse.json(
        { error: 'Duration (number of installments/months) is required and must be greater than 0' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(new Date(date));
    if (periodLock) return periodLock;

    // ── Server-side line total calculation with COGS ──
    const processedLines: {
      productId: string;
      quantity: number;
      rate: number;
      discountPercent: number;
      discountAmount: number;
      total: number;
      costPrice: number;
      cogsAmount: number;
    }[] = [];

    let cogsTotal = 0;

    for (const line of lines) {
      const lineQty = Number(line.quantity) || 0;
      const lineRate = Number(line.rate) || 0;
      const lineDiscPct = Number(line.discountPercent) || 0;
      const lineDiscAmt = Number(line.discountAmount) || safeFinancialRound(lineQty * lineRate * (lineDiscPct / 100));
      const lineGross = safeFinancialRound(lineQty * lineRate);
      const afterLineDisc = safeFinancialSubtract(lineGross, lineDiscAmt);
      const lineTotal = safeFinancialRound(afterLineDisc);

      // COGS: Look up Product.costPrice
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

    const subTotal = safeFinancialRound(processedLines.reduce((sum, l) => sum + l.total, 0));

    // ── Hire Interest Calculation ──
    const dp = downPayment || 0;
    const vatPct = vatPercentage || 0;
    // balanceAmount = principal after down payment (subTotal - dp)
    const balanceAmount = safeFinancialSubtract(subTotal, dp);
    // VAT is calculated on balanceAmount
    const vatAmount = safeFinancialRound(balanceAmount * (vatPct / 100));
    // grandTotal = balanceAmount + vatAmount
    const grandTotal = safeFinancialAdd(balanceAmount, vatAmount);
    // Simple interest: totalInterestAmount = balanceAmount * (effectiveRate / 100) * (duration / 12)
    const effectiveRate = hireRate || 0;
    const totalInterestAmount = safeFinancialRound(balanceAmount * (effectiveRate / 100) * (duration / 12));
    // totalHirePayable = balanceAmount + totalInterestAmount
    const totalHirePayable = safeFinancialAdd(balanceAmount, totalInterestAmount);
    // installmentAmount = totalHirePayable / duration
    const installmentAmount = duration > 0 ? safeFinancialRound(totalHirePayable / duration) : 0;
    // outstandingBalance = totalHirePayable (initially, before any payments)
    const outstandingBalance = totalHirePayable;
    const effectivePenaltyRate = penaltyRate || 0;

    // ── Credit Limit Protection ──
    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (customer) {
      if (customer.creditStatus === 'Frozen') {
        const fmtBD = (v: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
        return NextResponse.json(
          { error: `CREDIT FREEZE: Transaction blocked. Customer account is frozen. Outstanding ৳${fmtBD(Math.abs(customer.currentBalance))}. Contact management to unfreeze account or collect outstanding payments.` },
          { status: 403 }
        );
      }
      if (customer.creditLimit > 0) {
        const outstandingCustomerBalance = Math.abs(customer.currentBalance);
        const projectedBalance = outstandingCustomerBalance + grandTotal;
        if (projectedBalance > customer.creditLimit) {
          if (customer.creditStatus !== 'OverLimit') {
            await db.customer.update({
              where: { id: customerId },
              data: { creditStatus: 'OverLimit' },
            });
          }
          const fmtBD = (v: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
          return NextResponse.json(
            { error: `CREDIT FREEZE: Transaction blocked. Customer outstanding ৳${fmtBD(outstandingCustomerBalance)} + proposed ৳${fmtBD(grandTotal)} = ৳${fmtBD(projectedBalance)} exceeds credit ceiling ৳${fmtBD(customer.creditLimit)}. Contact management to increase credit limit or collect outstanding payments.` },
            { status: 403 }
          );
        }
      }
    }

    // ── Auto-generate invoiceNo: HIR-XXXXX ──
    const allHireSales = await db.hireSales.findMany({
      select: { invoiceNo: true },
    });
    let maxHireNum = 0;
    for (const hs of allHireSales) {
      if (hs.invoiceNo) {
        const match = hs.invoiceNo.match(/HIR-(\d+)/);
        if (match) maxHireNum = Math.max(maxHireNum, parseInt(match[1], 10));
      }
    }
    const invoiceNo = `HIR-${String(maxHireNum + 1).padStart(5, '0')}`;

    // ── Calculate next payment date ──
    const orderDate = new Date(date);
    const nextPayDate = new Date(orderDate.getFullYear(), orderDate.getMonth() + 1, orderDate.getDate());
    const retDate = new Date(orderDate.getFullYear(), orderDate.getMonth() + duration, orderDate.getDate());

    // ── Transaction: Create hire sale, lines, installments, stock entries, AR ──
    const result = await db.$transaction(async (tx) => {
      // Stock safety verification
      for (const line of processedLines) {
        const product = await tx.product.findUnique({ where: { id: line.productId } });
        if (!product) throw new Error(`Product not found: ${line.productId}`);

        const stockWhere: { productId: string; godownId?: string } = { productId: line.productId };
        if (godownId) stockWhere.godownId = godownId;

        const stockIns = await tx.stockEntry.aggregate({
          where: { ...stockWhere, type: 'IN' },
          _sum: { quantity: true },
        });
        const stockOuts = await tx.stockEntry.aggregate({
          where: { ...stockWhere, type: 'OUT' },
          _sum: { quantity: true },
        });

        const currentStock = (product.openingStock || 0) + (stockIns._sum.quantity || 0) - (stockOuts._sum.quantity || 0);
        if (currentStock < line.quantity) {
          throw new Error(`Insufficient stock for "${product.name}". Available: ${currentStock}, Requested: ${line.quantity}. Transaction rolled back.`);
        }
      }

      // Determine initial totalPaid: if downPayment > 0, totalPaid starts with dp
      const initialTotalPaid = dp > 0 ? dp : 0;
      const initialOutstandingBalance = dp > 0 ? safeFinancialSubtract(totalHirePayable, dp) : totalHirePayable;

      // Create hire sale with lines (including costPrice, cogsAmount)
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
          installmentAmount,
          balanceAmount,
          totalPaid: initialTotalPaid,
          currentStatus: 'Active',
          nextPaymentDate: nextPayDate,
          returnDate: retDate,
          grandTotal,
          vatPercentage: vatPct,
          vatAmount,
          totalInterestAmount,
          totalHirePayable,
          outstandingBalance: initialOutstandingBalance,
          penaltyRate: effectivePenaltyRate,
          totalPenaltyAmount: 0,
          cogsTotal,
          downPaymentPosted: dp > 0,
          notes: notes ? stripHtml(String(notes)) : null,
          companyId: companyId || security.user.companyId || null,
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
        },
        include: {
          customer: true,
          godown: true,
          company: true,
          lines: { include: { product: { include: { category: true, brand: true } } } },
        },
      });

      // ── Generate Installment Schedule (declining balance method) ──
      const principalPerInstallment = duration > 0 ? safeFinancialRound(balanceAmount / duration) : 0;

      for (let i = 1; i <= duration; i++) {
        const dueDate = new Date(orderDate.getFullYear(), orderDate.getMonth() + i, orderDate.getDate());
        // Declining balance interest: (balanceAmount - (installmentNo - 1) * principalPerInstallment) * (effectiveRate / 100) / 12
        const remainingPrincipal = safeFinancialSubtract(balanceAmount, (i - 1) * principalPerInstallment);
        const interestAmount = safeFinancialRound(remainingPrincipal * (effectiveRate / 100) / 12);
        const amount = safeFinancialAdd(principalPerInstallment, interestAmount);

        await tx.hireInstallment.create({
          data: {
            hireSalesId: hireSale.id,
            installmentNo: i,
            dueDate,
            amount,
            principalAmount: principalPerInstallment,
            interestAmount,
            paidAmount: 0,
            paidDate: null,
            overdueDays: 0,
            penaltyAmount: 0,
            status: 'Pending',
          },
        });
      }

      // ── Create StockEntry (type="OUT") for each line ──
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

      // ── AR Integration ──
      // Update Customer.currentBalance with grandTotal (Dr side — customer owes more)
      const currentCustomer = await tx.customer.findUnique({ where: { id: customerId } });
      if (currentCustomer) {
        let newBalance: number;
        let newBalanceType: string;

        if (currentCustomer.currentBalanceType === 'Dr') {
          newBalance = safeFinancialAdd(currentCustomer.currentBalance, grandTotal);
          newBalanceType = 'Dr';
        } else {
          // Customer has Cr balance, adding Dr reduces Cr or flips to Dr
          newBalance = safeFinancialSubtract(currentCustomer.currentBalance, grandTotal);
          if (newBalance < 0) {
            newBalance = Math.abs(newBalance);
            newBalanceType = 'Dr';
          } else {
            newBalanceType = 'Cr';
          }
        }

        // If downPayment > 0, subtract dp from current balance (customer paid dp — Cr side)
        if (dp > 0) {
          if (newBalanceType === 'Dr') {
            newBalance = safeFinancialSubtract(newBalance, dp);
            if (newBalance < 0) {
              newBalance = Math.abs(newBalance);
              newBalanceType = 'Cr';
            }
          } else {
            newBalance = safeFinancialAdd(newBalance, dp);
            newBalanceType = 'Cr';
          }
        }

        // Auto-toggle creditStatus based on new balance vs credit limit
        if (currentCustomer.creditLimit > 0 && newBalanceType === 'Dr' && newBalance > currentCustomer.creditLimit) {
          await tx.customer.update({
            where: { id: customerId },
            data: {
              currentBalance: newBalance,
              currentBalanceType: newBalanceType,
              creditStatus: 'OverLimit',
            },
          });
        } else if (currentCustomer.creditStatus === 'OverLimit' && currentCustomer.creditLimit > 0 && newBalanceType === 'Dr' && newBalance <= currentCustomer.creditLimit) {
          await tx.customer.update({
            where: { id: customerId },
            data: {
              currentBalance: newBalance,
              currentBalanceType: newBalanceType,
              creditStatus: 'Active',
            },
          });
        } else {
          await tx.customer.update({
            where: { id: customerId },
            data: {
              currentBalance: newBalance,
              currentBalanceType: newBalanceType,
            },
          });
        }
      }

      // ── Audit log ──
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'HireSales',
          recordId: hireSale.id,
          recordLabel: invoiceNo,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            customerId,
            grandTotal,
            subTotal,
            balanceAmount,
            totalInterestAmount,
            totalHirePayable,
            duration,
            installmentAmount,
            downPayment: dp,
            cogsTotal,
            lineCount: processedLines.length,
          }),
        },
      });

      // Activity log
      await logUserActivity({
        tx: tx,
        action: 'CREATE',
        module: 'Inv-Hire-Sales',
        recordId: hireSale.id,
        recordLabel: invoiceNo,
        userId: security.user.id,
        userName: security.user.name,
        details: `Created hire sale ${invoiceNo} for customer ${customerId} with ${processedLines.length} lines, grandTotal=${grandTotal}, cogsTotal=${cogsTotal}, duration=${duration}`,
      });

      return hireSale;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating hire sale:', error);
    const message = error instanceof Error ? error.message : 'Failed to create hire sale';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
