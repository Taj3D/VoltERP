import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor, validateImageFields, safeFinancialRound, safeFinancialAdd, safeFinancialSubtract } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const nullIfEmpty = (v: string | undefined | null) => (!v || !v.trim()) ? null : v.trim();

// XSS sanitization — strip HTML tags from text inputs
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

// Phone validation
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
    // SR: completely blocked from suppliers by MODULE_DENY in api-security
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

    // ── Batch mode support for CSV import ──
    if (body.batchMode && Array.isArray(body.data)) {
      const results: unknown[] = [];
      const errors: string[] = [];

      for (let i = 0; i < body.data.length; i++) {
        const row = body.data[i];
        try {
          // Image validation
          const imgError = validateImageFields(row, ['profileImage', 'nidFrontImage', 'nidBackImage', 'logoUrl']);
          if (imgError) { errors.push(`Row ${i + 1}: ${imgError}`); continue; }

          // Case-insensitive duplicate name check
          if (row.name?.trim()) {
            const normalizedName = row.name.trim().toLowerCase();
            const duplicate = await db.supplier.findFirst({
              where: { name: { contains: normalizedName }, isActive: true },
            });
            if (duplicate && duplicate.name.trim().toLowerCase() === normalizedName) {
              errors.push(`Row ${i + 1}: Duplicate supplier name "${row.name.trim()}" (case-insensitive match)`);
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
          let supplierCode = row.supplierCode;
          if (!supplierCode) {
            const allSuppliers = await db.supplier.findMany({ select: { supplierCode: true } });
            let nextNum = 1;
            for (const s of allSuppliers) {
              const match = s.supplierCode?.match(/SUP-(\d+)/);
              if (match) nextNum = Math.max(nextNum, parseInt(match[1]) + 1);
            }
            nextNum += results.length;
            supplierCode = `SUP-${String(nextNum).padStart(5, '0')}`;
          }

          const openingBalance = safeFinancialRound(Number(row.openingBalance) || 0);
          const openingBalanceType = row.openingBalanceType || 'Cr';
          const creditLimit = safeFinancialRound(Number(row.creditLimit) || 0);

          let initialCreditStatus = 'Active';
          if (creditLimit > 0 && openingBalance > creditLimit) {
            initialCreditStatus = 'OverLimit';
          }

          const record = await db.supplier.create({
            data: {
              supplierCode,
              name: stripHtml(String(row.name || '')),
              contactPerson: row.contactPerson ? stripHtml(String(row.contactPerson)) : null,
              phone: row.phone ? stripHtml(String(row.phone)) : null,
              email: row.email ? stripHtml(String(row.email)).toLowerCase() : null,
              address: row.address ? stripHtml(String(row.address)) : null,
              area: row.area ? stripHtml(String(row.area)) : null,
              terms: row.terms ? stripHtml(String(row.terms)) : null,
              openingBalance,
              openingBalanceType,
              currentBalance: openingBalance,
              currentBalanceType: openingBalanceType,
              creditLimit,
              creditStatus: initialCreditStatus,
              profileImage: row.profileImage || null,
              nidFrontImage: row.nidFrontImage || null,
              nidBackImage: row.nidBackImage || null,
              nidNumber: row.nidNumber ? stripHtml(String(row.nidNumber)) : null,
              logoUrl: nullIfEmpty(row.logoUrl),
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
        module: 'Suppliers',
        recordId: 'BATCH',
        recordLabel: `Batch import: ${results.length} suppliers`,
        userId: security.user?.id || 'system',
        userName: security.user?.name || 'System',
        details: JSON.stringify({ total: body.data.length, created: results.length, errors: errors.length }),
      });

      return NextResponse.json({ created: results, errors }, { status: 201 });
    }

    // ── Single mode ──
    // Validate required fields
    if (!body.name || String(body.name).trim() === '') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const imgError = validateImageFields(body, ['profileImage', 'nidFrontImage', 'nidBackImage', 'logoUrl']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });

    // Phone/email validation
    if (body.phone?.trim() && !isValidPhone(body.phone.trim())) {
      return NextResponse.json({ error: 'Invalid phone format' }, { status: 400 });
    }
    if (body.email?.trim() && !isValidEmail(body.email.trim())) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Case-insensitive duplicate name check
    if (body.name?.trim()) {
      const normalizedName = body.name.trim().toLowerCase();
      const duplicate = await db.supplier.findFirst({
        where: { name: { contains: normalizedName }, isActive: true },
      });
      if (duplicate && duplicate.name.trim().toLowerCase() === normalizedName) {
        return NextResponse.json(
          { error: `Corporate Entity Collision: Supplier name "${body.name.trim()}" already exists (case-insensitive match).` },
          { status: 400 }
        );
      }
    }

    // Set initial balance from opening balance
    const openingBalance = safeFinancialRound(Number(body.openingBalance) || 0);
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

      const creditLimit = safeFinancialRound(Number(body.creditLimit) || 0);
      // Determine initial credit status
      let initialCreditStatus: string = 'Active';
      if (creditLimit > 0 && openingBalance > creditLimit) {
        initialCreditStatus = 'OverLimit';
      }

      const record = await tx.supplier.create({
        data: {
          supplierCode,
          name: stripHtml(String(body.name || '')),
          contactPerson: body.contactPerson ? stripHtml(String(body.contactPerson)) : null,
          phone: body.phone ? stripHtml(String(body.phone)) : null,
          email: body.email ? stripHtml(String(body.email)).toLowerCase() : null,
          address: body.address ? stripHtml(String(body.address)) : null,
          area: body.area ? stripHtml(String(body.area)) : null,
          terms: body.terms ? stripHtml(String(body.terms)) : null,
          openingBalance,
          openingBalanceType,
          currentBalance: openingBalance,       // Initial current balance = opening balance
          currentBalanceType: openingBalanceType, // Same type as opening
          creditLimit,
          creditStatus: initialCreditStatus,
          profileImage: body.profileImage || null,
          nidFrontImage: body.nidFrontImage || null,
          nidBackImage: body.nidBackImage || null,
          nidNumber: body.nidNumber ? stripHtml(String(body.nidNumber)) : null,
          logoUrl: nullIfEmpty(body.logoUrl),
          companyId: security.user.companyId || null,
          isActive: body.isActive ?? true,
        },
        include: {
          _count: { select: { purchaseOrders: true, purchaseReturns: true, cashDeliveries: true } },
        },
      });

      await logUserActivity({
          tx: tx,
        action: 'CREATE',
        module: 'Suppliers',
        recordId: record.id,
        recordLabel: `${record.supplierCode} - ${record.name}`,
        userId: security.user?.id || 'system',
        userName: security.user?.name || 'System',
        details: JSON.stringify({ supplierCode: record.supplierCode, name: record.name, creditLimit: record.creditLimit, openingBalance, openingBalanceType }),
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 });
  }
}
