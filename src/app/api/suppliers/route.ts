import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor, validateImageFields, safeFinancialRound, safeFinancialAdd, safeFinancialSubtract } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Suppliers', 'GET');
  if (!security.authorized) return security.response;
  try {
    const companyId = security.user.companyId;
    const companyFilter = companyId ? { companyId } : {};

    const items = await db.supplier.findMany({
      where: { isActive: true, ...companyFilter },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { purchaseOrders: true, purchaseReturns: true, cashDeliveries: true } },
      },
    });

    // ---- Batch compute AP balances for all suppliers (3 aggregate queries total) ----

    // Aggregate Purchase Orders per supplier (grandTotal where status != 'Cancelled')
    const purchaseOrdersAgg = await db.purchaseOrder.groupBy({
      by: ['supplierId'],
      where: { status: { not: 'Cancelled' }, isActive: true, ...companyFilter },
      _sum: { grandTotal: true },
    });
    const poBySupplier = new Map<string, number>();
    for (const row of purchaseOrdersAgg) {
      poBySupplier.set(row.supplierId, safeFinancialRound(row._sum.grandTotal || 0));
    }

    // Aggregate Cash Deliveries per supplier (amount)
    const cashDeliveriesAgg = await db.cashDelivery.groupBy({
      by: ['supplierId'],
      where: { isActive: true, ...companyFilter },
      _sum: { amount: true },
    });
    const deliveriesBySupplier = new Map<string, number>();
    for (const row of cashDeliveriesAgg) {
      deliveriesBySupplier.set(row.supplierId, safeFinancialRound(row._sum.amount || 0));
    }

    // Aggregate Purchase Returns per supplier (grandTotal where status != 'Cancelled')
    const purchaseReturnsAgg = await db.purchaseReturn.groupBy({
      by: ['supplierId'],
      where: { status: { not: 'Cancelled' }, isActive: true, ...companyFilter },
      _sum: { grandTotal: true },
    });
    const returnsBySupplier = new Map<string, number>();
    for (const row of purchaseReturnsAgg) {
      returnsBySupplier.set(row.supplierId, safeFinancialRound(row._sum.grandTotal || 0));
    }

    // Enrich each supplier with computed balance data
    const enrichedItems = items.map(item => {
      const openingCr = item.openingBalanceType === 'Cr' ? item.openingBalance : 0;
      const openingDr = item.openingBalanceType === 'Dr' ? item.openingBalance : 0;

      const totalPurchaseOrders = poBySupplier.get(item.id) || 0;
      const totalCashDeliveries = deliveriesBySupplier.get(item.id) || 0;
      const totalPurchaseReturns = returnsBySupplier.get(item.id) || 0;

      const totalCredits = safeFinancialAdd(openingCr, totalPurchaseOrders);
      const totalDebits = safeFinancialAdd(safeFinancialAdd(openingDr, totalCashDeliveries), totalPurchaseReturns);
      const netBalance = safeFinancialSubtract(totalCredits, totalDebits);

      const computedCurrentBalance = Math.abs(netBalance);
      const computedCurrentBalanceType: 'Dr' | 'Cr' = netBalance >= 0 ? 'Cr' : 'Dr';
      const creditLimit = safeFinancialRound(item.creditLimit || 0);
      const computedCreditUtilization = creditLimit > 0
        ? safeFinancialRound((computedCurrentBalance / creditLimit) * 100)
        : 0;

      let computedCreditStatus: 'Active' | 'OverLimit' | 'Frozen';
      if (item.creditStatus === 'Frozen') {
        computedCreditStatus = 'Frozen';
      } else if (creditLimit > 0 && computedCurrentBalance > creditLimit) {
        computedCreditStatus = 'OverLimit';
      } else {
        computedCreditStatus = 'Active';
      }

      return {
        ...item,
        computedCurrentBalance,
        computedCurrentBalanceType,
        computedCreditUtilization,
        computedCreditStatus,
      };
    });

    // VAT Auditor: mask opening balances and credit limits
    const maskedItems = enrichedItems.map(item => {
      if (security.user.role === 'vat_auditor') {
        return maskForVatAuditor(item, security.user.role, ['openingBalance', 'creditLimit', 'computedCurrentBalance', 'computedCreditUtilization']);
      }
      return item;
    });

    return NextResponse.json(maskedItems);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Suppliers', 'POST');
  if (!security.authorized) return security.response;
  // SR: blocked from creating suppliers (handled by MODULE_DENY in api-security)
  try {
    const body = await request.json();
    if (body.batchMode && Array.isArray(body.data)) {
      const results = await db.$transaction(body.data.map((record: any) =>
        db.supplier.create({ data: record })
      ));
      return NextResponse.json({ success: true, count: results.length, data: results });
    }
    const imgError = validateImageFields(body, ['profileImage', 'nidFrontImage', 'nidBackImage']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });

    // Set initial balance from opening balance
    const openingBalance = body.openingBalance ?? 0;
    const openingBalanceType = body.openingBalanceType || 'Cr';

    const item = await db.$transaction(async (tx) => {
      // Auto-generate SUP-XXXXX code (5-digit zero-padded)
      let supplierCode = body.supplierCode;
      if (!supplierCode) {
        const allSuppliers = await tx.supplier.findMany({ select: { supplierCode: true } });
        let nextNum = 1;
        for (const s of allSuppliers) {
          const match = s.supplierCode?.match(/SUP-(\d+)/);
          if (match) nextNum = Math.max(nextNum, parseInt(match[1]) + 1);
        }
        supplierCode = `SUP-${String(nextNum).padStart(5, '0')}`;
      }

      const creditLimit = body.creditLimit ?? 0;
      // Determine initial credit status
      let initialCreditStatus: string = 'Active';
      if (creditLimit > 0 && openingBalance > creditLimit) {
        initialCreditStatus = 'OverLimit';
      }

      const record = await tx.supplier.create({
        data: {
          supplierCode,
          name: body.name,
          contactPerson: body.contactPerson || null,
          phone: body.phone || null,
          email: body.email || null,
          address: body.address || null,
          area: body.area || null,
          terms: body.terms || null,
          openingBalance,
          openingBalanceType,
          currentBalance: openingBalance,       // Initial current balance = opening balance
          currentBalanceType: openingBalanceType, // Same type as opening
          creditLimit,
          creditStatus: initialCreditStatus,
          profileImage: body.profileImage || null,
          nidFrontImage: body.nidFrontImage || null,
          nidBackImage: body.nidBackImage || null,
          companyId: security.user.companyId || null,
          isActive: body.isActive ?? true,
        },
        include: {
          _count: { select: { purchaseOrders: true, purchaseReturns: true, cashDeliveries: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Suppliers',
          recordId: record.id,
          recordLabel: `${record.supplierCode} - ${record.name}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ supplierCode: record.supplierCode, name: record.name, creditLimit: record.creditLimit, openingBalance, openingBalanceType }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 });
  }
}
