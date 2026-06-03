import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor, validateImageFields, safeFinancialRound, safeFinancialAdd, safeFinancialSubtract } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Customers', 'GET');
  if (!security.authorized) return security.response;
  try {
    const companyId = security.user.companyId;
    const companyFilter = companyId ? { companyId } : {};

    const items = await db.customer.findMany({
      where: { isActive: true, ...companyFilter },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { salesOrders: true, hireSales: true, cashCollections: true, orderSheets: true } },
      },
    });

    // ---- Batch compute AR balances for all customers (4 aggregate queries total) ----

    // Aggregate Sales Orders per customer (grandTotal where status != 'Cancelled')
    const salesOrdersAgg = await db.salesOrder.groupBy({
      by: ['customerId'],
      where: { status: { not: 'Cancelled' }, isActive: true, ...companyFilter },
      _sum: { grandTotal: true },
    });
    const salesByCustomer = new Map<string, number>();
    for (const row of salesOrdersAgg) {
      salesByCustomer.set(row.customerId, safeFinancialRound(row._sum.grandTotal || 0));
    }

    // Aggregate Hire Sales per customer (grandTotal where status != 'Cancelled')
    const hireSalesAgg = await db.hireSales.groupBy({
      by: ['customerId'],
      where: { status: { not: 'Cancelled' }, isActive: true, ...companyFilter },
      _sum: { grandTotal: true },
    });
    const hireByCustomer = new Map<string, number>();
    for (const row of hireSalesAgg) {
      hireByCustomer.set(row.customerId, safeFinancialRound(row._sum.grandTotal || 0));
    }

    // Aggregate Cash Collections per customer (amount)
    const cashCollectionsAgg = await db.cashCollection.groupBy({
      by: ['customerId'],
      where: { isActive: true, ...companyFilter },
      _sum: { amount: true },
    });
    const collectionsByCustomer = new Map<string, number>();
    for (const row of cashCollectionsAgg) {
      collectionsByCustomer.set(row.customerId, safeFinancialRound(row._sum.amount || 0));
    }

    // Aggregate Sales Returns per customer (grandTotal where status != 'Cancelled')
    const salesReturnsAgg = await db.salesReturn.groupBy({
      by: ['customerId'],
      where: { status: { not: 'Cancelled' }, isActive: true, ...companyFilter },
      _sum: { grandTotal: true },
    });
    const returnsByCustomer = new Map<string, number>();
    for (const row of salesReturnsAgg) {
      returnsByCustomer.set(row.customerId, safeFinancialRound(row._sum.grandTotal || 0));
    }

    // Enrich each customer with computed balance data
    const enrichedItems = items.map(item => {
      const openingDr = item.openingBalanceType === 'Dr' ? item.openingBalance : 0;
      const openingCr = item.openingBalanceType === 'Cr' ? item.openingBalance : 0;

      const totalSalesOrders = salesByCustomer.get(item.id) || 0;
      const totalHireSales = hireByCustomer.get(item.id) || 0;
      const totalCashCollections = collectionsByCustomer.get(item.id) || 0;
      const totalSalesReturns = returnsByCustomer.get(item.id) || 0;

      const totalDebits = safeFinancialAdd(safeFinancialAdd(openingDr, totalSalesOrders), totalHireSales);
      const totalCredits = safeFinancialAdd(safeFinancialAdd(openingCr, totalCashCollections), totalSalesReturns);
      const netBalance = safeFinancialSubtract(totalDebits, totalCredits);

      const computedCurrentBalance = Math.abs(netBalance);
      const computedCurrentBalanceType: 'Dr' | 'Cr' = netBalance >= 0 ? 'Dr' : 'Cr';
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

    // VAT Auditor: mask credit limits and opening balances (sensitive margins)
    // SR: mask creditLimit (should not see customer credit limits)
    const maskedItems = enrichedItems.map(item => {
      if (security.user.role === 'vat_auditor') {
        return maskForVatAuditor(item, security.user.role, ['openingBalance', 'creditLimit', 'computedCurrentBalance', 'computedCreditUtilization']);
      }
      if (security.user.role === 'sr') {
        return maskForVatAuditor(item, security.user.role, ['creditLimit']);
      }
      return item;
    });

    return NextResponse.json(maskedItems);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Customers', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    if (body.batchMode && Array.isArray(body.data)) {
      const results = await db.$transaction(body.data.map((record: any) =>
        db.customer.create({ data: record })
      ));
      return NextResponse.json({ success: true, count: results.length, data: results });
    }
    const imgError = validateImageFields(body, ['profileImage', 'nidFrontImage', 'nidBackImage']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });

    // Set initial balance from opening balance
    const openingBalance = body.openingBalance ?? 0;
    const openingBalanceType = body.openingBalanceType || 'Dr';

    const item = await db.$transaction(async (tx) => {
      // Auto-generate CUS-XXXXX code (5-digit zero-padded)
      let customerCode = body.customerCode;
      if (!customerCode) {
        const allCustomers = await tx.customer.findMany({ select: { customerCode: true } });
        let nextNum = 1;
        for (const c of allCustomers) {
          const match = c.customerCode?.match(/CUS-(\d+)/);
          if (match) nextNum = Math.max(nextNum, parseInt(match[1]) + 1);
        }
        customerCode = `CUS-${String(nextNum).padStart(5, '0')}`;
      }

      const creditLimit = body.creditLimit ?? 0;
      // Determine initial credit status
      let initialCreditStatus: string = 'Active';
      if (creditLimit > 0 && openingBalance > creditLimit) {
        initialCreditStatus = 'OverLimit';
      }

      const record = await tx.customer.create({
        data: {
          customerCode,
          name: body.name,
          phone: body.phone || null,
          email: body.email || null,
          address: body.address || null,
          area: body.area || null,
          reference: body.reference || null,
          openingBalance,
          openingBalanceType,
          currentBalance: openingBalance,       // Initial current balance = opening balance
          currentBalanceType: openingBalanceType, // Same type as opening
          creditLimit,
          creditStatus: initialCreditStatus,
          customerType: body.customerType || 'Regular',
          profileImage: body.profileImage || null,
          nidFrontImage: body.nidFrontImage || null,
          nidBackImage: body.nidBackImage || null,
          companyId: security.user.companyId || null,
          isActive: body.isActive ?? true,
        },
        include: {
          _count: { select: { salesOrders: true, hireSales: true, cashCollections: true, orderSheets: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Customers',
          recordId: record.id,
          recordLabel: `${record.customerCode} - ${record.name}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ customerCode: record.customerCode, name: record.name, customerType: record.customerType, creditLimit: record.creditLimit, openingBalance, openingBalanceType }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}
