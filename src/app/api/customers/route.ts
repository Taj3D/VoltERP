import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor, validateImageFields, safeFinancialRound, safeFinancialAdd, safeFinancialSubtract } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const nullIfEmpty = (v: string | undefined | null) => (!v || !v.trim()) ? null : v.trim();

// XSS sanitization — strip HTML tags from text inputs
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

// Phone validation: Bangladesh format (+880XXXXXXXXXX) or generic
function isValidPhone(phone: string): boolean {
  const bdPhone = /^\+?880\d{10}$/;
  const genericPhone = /^\+?[\d\s\-()]{7,15}$/;
  return bdPhone.test(phone.replace(/\s/g, '')) || genericPhone.test(phone.replace(/\s/g, ''));
}

// Email format validation
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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

    // ── Batch mode support for CSV import ──
    if (body.batchMode && Array.isArray(body.data)) {
      const results: unknown[] = [];
      const errors: string[] = [];

      for (let i = 0; i < body.data.length; i++) {
        const row = body.data[i];
        try {
          // Image validation
          const imgError = validateImageFields(row, ['profileImage', 'nidFrontImage', 'nidBackImage']);
          if (imgError) { errors.push(`Row ${i + 1}: ${imgError}`); continue; }

          // Case-insensitive duplicate name check
          if (row.name?.trim()) {
            const normalizedName = row.name.trim().toLowerCase();
            const duplicate = await db.customer.findFirst({
              where: { name: { contains: normalizedName }, isActive: true },
            });
            if (duplicate && duplicate.name.trim().toLowerCase() === normalizedName) {
              errors.push(`Row ${i + 1}: Duplicate customer name "${row.name.trim()}" (case-insensitive match)`);
              continue;
            }
          }

          // Phone/email validation
          if (row.phone?.trim() && !isValidPhone(row.phone.trim())) {
            errors.push(`Row ${i + 1}: Invalid phone format`);
            continue;
          }
          if (row.email?.trim() && !isValidEmail(row.email.trim())) {
            errors.push(`Row ${i + 1}: Invalid email format`);
            continue;
          }

          // Auto-generate code
          let customerCode = row.customerCode;
          if (!customerCode) {
            const allCustomers = await db.customer.findMany({ select: { customerCode: true } });
            let nextNum = 1;
            for (const c of allCustomers) {
              const match = c.customerCode?.match(/CUS-(\d+)/);
              if (match) nextNum = Math.max(nextNum, parseInt(match[1]) + 1);
            }
            nextNum += results.length;
            customerCode = `CUS-${String(nextNum).padStart(5, '0')}`;
          }

          const openingBalance = safeFinancialRound(Number(row.openingBalance) || 0);
          const openingBalanceType = row.openingBalanceType || 'Dr';
          const creditLimit = safeFinancialRound(Number(row.creditLimit) || 0);

          let initialCreditStatus = 'Active';
          if (creditLimit > 0 && openingBalance > creditLimit) {
            initialCreditStatus = 'OverLimit';
          }

          // Sanitize text fields
          const record = await db.customer.create({
            data: {
              customerCode,
              name: stripHtml(String(row.name || '')),
              phone: row.phone ? stripHtml(String(row.phone)) : null,
              email: row.email ? stripHtml(String(row.email)).toLowerCase() : null,
              address: row.address ? stripHtml(String(row.address)) : null,
              area: row.area ? stripHtml(String(row.area)) : null,
              reference: row.reference ? stripHtml(String(row.reference)) : null,
              openingBalance,
              openingBalanceType,
              currentBalance: openingBalance,
              currentBalanceType: openingBalanceType,
              creditLimit,
              creditStatus: initialCreditStatus,
              customerType: row.customerType || 'Regular',
              profileImage: row.profileImage || null,
              nidFrontImage: row.nidFrontImage || null,
              nidBackImage: row.nidBackImage || null,
              companyId: security.user.companyId || null,
              isActive: row.isActive ?? true,
            },
          });

          results.push(record);
        } catch (err) {
          errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // Batch audit log
      await logUserActivity({
        action: 'IMPORT',
        module: 'Customers',
        recordId: 'BATCH',
        recordLabel: `Batch import: ${results.length} customers`,
        userId: security.user?.id || 'system',
        userName: security.user?.name || 'System',
        details: JSON.stringify({ total: body.data.length, created: results.length, errors: errors.length }),
      });

      return NextResponse.json({ created: results, errors }, { status: 201 });
    }

    // ── Single mode ──
    const imgError = validateImageFields(body, ['profileImage', 'nidFrontImage', 'nidBackImage']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });

    // Phone/email validation
    if (body.phone?.trim() && !isValidPhone(body.phone.trim())) {
      return NextResponse.json({ error: 'Invalid phone format. Use Bangladesh format (+880XXXXXXXXXX) or international format.' }, { status: 400 });
    }
    if (body.email?.trim() && !isValidEmail(body.email.trim())) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Case-insensitive duplicate name check
    if (body.name?.trim()) {
      const normalizedName = body.name.trim().toLowerCase();
      const duplicate = await db.customer.findFirst({
        where: { name: { contains: normalizedName }, isActive: true },
      });
      if (duplicate && duplicate.name.trim().toLowerCase() === normalizedName) {
        return NextResponse.json(
          { error: `Corporate Entity Collision: Customer name "${body.name.trim()}" already exists (case-insensitive match).` },
          { status: 400 }
        );
      }
    }

    // Set initial balance from opening balance
    const openingBalance = safeFinancialRound(Number(body.openingBalance) || 0);
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

      const creditLimit = safeFinancialRound(Number(body.creditLimit) || 0);
      // Determine initial credit status
      let initialCreditStatus: string = 'Active';
      if (creditLimit > 0 && openingBalance > creditLimit) {
        initialCreditStatus = 'OverLimit';
      }

      const record = await tx.customer.create({
        data: {
          customerCode,
          name: stripHtml(String(body.name || '')),
          phone: body.phone ? stripHtml(String(body.phone)) : null,
          email: body.email ? stripHtml(String(body.email)).toLowerCase() : null,
          address: body.address ? stripHtml(String(body.address)) : null,
          area: body.area ? stripHtml(String(body.area)) : null,
          reference: body.reference ? stripHtml(String(body.reference)) : null,
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

      await logUserActivity({
          tx: tx,
        action: 'CREATE',
        module: 'Customers',
        recordId: record.id,
        recordLabel: `${record.customerCode} - ${record.name}`,
        userId: security.user?.id || 'system',
        userName: security.user?.name || 'System',
        details: JSON.stringify({ customerCode: record.customerCode, name: record.name, customerType: record.customerType, creditLimit: record.creditLimit, openingBalance, openingBalanceType }),
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}
