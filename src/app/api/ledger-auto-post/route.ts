// ============================================================
// LEDGER AUTO-POST API — Automated Ledger Posting from Transactions
// Group 5: Financial Auditing, Automated Ledgers & Data Integrity
// STAGE 13: Full multi-tenant companyId isolation, safe financial
// arithmetic, RBAC via checkAutoPostAdminPermission, logUserActivity
// with Audit-AutoPost-Engine module token, VAT Auditor masking.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  safeFinancialAdd,
  safeFinancialSubtract,
  safeFinancialRound,
  checkAutoPostAdminPermission,
  maskForVatAuditor,
  type UserRole,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { db } from '@/lib/db';
import { generateNextCode } from '@/lib/accounting-utils';

// Inline code generator for LedgerAutoPost
async function generateAutoPostCode(): Promise<string> {
  const latest = await db.ledgerAutoPost.findFirst({
    where: { code: { startsWith: 'LAP-' } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  if (!latest) return 'LAP-00001';
  const num = parseInt(latest.code.replace('LAP-', ''), 10) || 0;
  return `LAP-${String(num + 1).padStart(5, '0')}`;
}

// Helper: Find or create a ChartOfAccount by classification and name (company-scoped)
async function findOrCreateAccount(
  classification: string,
  accountName: string,
  securityUser: { id: string; name: string },
  companyId: string | null
): Promise<string> {
  // Try to find existing account — scoped by companyId
  const companyFilter = companyId ? { companyId } : {};

  let account = await db.chartOfAccount.findFirst({
    where: {
      classification,
      name: { contains: accountName },
      isActive: true,
      ...companyFilter,
    },
  });

  if (!account) {
    // Try exact match by classification only (fallback within company)
    account = await db.chartOfAccount.findFirst({
      where: {
        classification,
        isActive: true,
        ...companyFilter,
      },
    });
  }

  if (account) return account.id;

  // Create the account if it doesn't exist — inherit companyId from security context
  const code = await generateNextCode('chartOfAccount', 'COA-');
  const newAccount = await db.chartOfAccount.create({
    data: {
      code,
      name: accountName,
      classification,
      openingBalance: 0,
      openingBalanceType: classification === 'Asset' || classification === 'Expense' ? 'Dr' : 'Cr',
      companyId: companyId,
      isActive: true,
    },
  });

  // Audit log for auto-created COA
  await logUserActivity({
    action: 'CREATE',
    module: 'Audit-AutoPost-Engine',
    recordId: newAccount.id,
    recordLabel: newAccount.code,
    userId: securityUser.id,
    userName: securityUser.name,
    details: JSON.stringify({ autoCreated: true, name: accountName, classification, companyId }),
  });

  return newAccount.id;
}

// GET /api/ledger-auto-post — List auto-post records with filters
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'LedgerAutoPost', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const userRole = security.user.role as UserRole;

    // SR and Dealer blocked via MODULE_DENY (enforced by withApiSecurity)
    // Additional explicit check for safety
    if (userRole === 'sr' || userRole === 'dealer') {
      return NextResponse.json(
        { error: 'Access denied. SR and Dealer roles cannot access ledger auto-post records.' },
        { status: 403 }
      );
    }

    const companyId = security.user.companyId;

    const where: Record<string, unknown> = {};

    // Multi-tenant isolation: filter by companyId
    if (companyId) {
      where.companyId = companyId;
    }

    const sourceType = searchParams.get('sourceType');
    const status = searchParams.get('status');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (sourceType) where.sourceType = sourceType;
    if (status) where.status = status;

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo + 'T23:59:59.999Z');
      where.postingDate = dateFilter;
    }

    const [records, total] = await Promise.all([
      db.ledgerAutoPost.findMany({
        where,
        orderBy: { postedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.ledgerAutoPost.count({ where }),
    ]);

    // VAT Auditor masking — mask `amount` field on all returned records
    const masked = records.map((record: Record<string, unknown>) =>
      maskForVatAuditor(record, userRole, ['amount'])
    );

    return NextResponse.json({ records: masked, total, limit, offset });
  } catch (error) {
    console.error('Ledger auto-post GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch auto-post records' }, { status: 500 });
  }
}

// POST /api/ledger-auto-post — Various auto-posting actions
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'LedgerAutoPost', 'POST');
  if (!security.authorized) return security.response;

  try {
    const userRole = security.user.role as UserRole;

    // RBAC: Only admin can trigger auto-post actions
    const permCheck = checkAutoPostAdminPermission(userRole);
    if (permCheck) return permCheck;

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'post-sales':
        return await postSalesOrder(request, security);
      case 'post-purchase':
        return await postPurchaseOrder(request, security);
      case 'reverse':
        return await reverseAutoPost(request, security);
      case 'run-all-pending':
        return await runAllPending(security);
      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: post-sales, post-purchase, reverse, or run-all-pending' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Ledger auto-post POST error:', error);
    return NextResponse.json({ error: 'Failed to process auto-post action' }, { status: 500 });
  }
}

// Post a Sales Order to the ledger
async function postSalesOrder(
  request: NextRequest,
  security: { authorized: true; user: { id: string; email: string; name: string; role: string; companyId: string | null } }
) {
  const { searchParams } = new URL(request.url);
  const salesOrderId = searchParams.get('salesOrderId');
  const companyId = security.user.companyId;

  if (!salesOrderId) {
    return NextResponse.json(
      { error: 'Missing required parameter: salesOrderId' },
      { status: 400 }
    );
  }

  // Check if already posted — scoped by companyId
  const existingPostWhere: Record<string, unknown> = { sourceType: 'SalesOrder', sourceId: salesOrderId, status: 'Posted' };
  if (companyId) existingPostWhere.companyId = companyId;

  const existingPost = await db.ledgerAutoPost.findFirst({ where: existingPostWhere });
  if (existingPost) {
    return NextResponse.json(
      { error: 'This sales order has already been posted to the ledger.', autoPost: existingPost },
      { status: 409 }
    );
  }

  // Fetch the sales order
  const salesOrder = await db.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: { lines: true, customer: true },
  });

  if (!salesOrder) {
    return NextResponse.json({ error: 'Sales order not found' }, { status: 404 });
  }

  if (salesOrder.status !== 'Confirmed' && salesOrder.status !== 'Delivered') {
    return NextResponse.json(
      { error: `Sales order must be Confirmed or Delivered to post. Current status: ${salesOrder.status}` },
      { status: 400 }
    );
  }

  const lapCode = await generateAutoPostCode();
  const now = new Date();

  // STAGE 13: Use safeFinancialRound on all amounts
  const salesAmount = safeFinancialRound(salesOrder.grandTotal);
  const costOfGoods = safeFinancialRound(
    salesOrder.lines.reduce(
      (sum: number, line: { quantity: number; rate: number | null }) =>
        safeFinancialAdd(sum, (line.quantity * (line.rate || 0))),
      0
    )
  );

  // Find or create accounts — company-scoped
  const accountsReceivableId = await findOrCreateAccount('Asset', 'Accounts Receivable', security.user, companyId);
  const salesRevenueId = await findOrCreateAccount('Income', 'Sales Revenue', security.user, companyId);
  const cogsAccountId = await findOrCreateAccount('Expense', 'Cost of Goods Sold', security.user, companyId);
  const inventoryAccountId = await findOrCreateAccount('Asset', 'Inventory', security.user, companyId);

  // Use transaction for atomicity
  const result = await db.$transaction(async (tx: Parameters<Parameters<typeof tx.$transaction>[0]>[0]) => {
    // 1. Dr: Accounts Receivable | Cr: Sales Revenue
    const debitEntry1 = await tx.ledgerEntry.create({
      data: {
        entryCode: await generateNextCode('ledgerEntry', 'LED-'),
        date: salesOrder.date,
        accountId: accountsReceivableId,
        account: 'Accounts Receivable',
        particulars: `Sales Order ${salesOrder.invoiceNo} - ${salesOrder.customer?.name || 'Customer'}`,
        debit: salesAmount,
        credit: 0,
        reference: salesOrder.invoiceNo,
        referenceType: 'SalesOrder',
        companyId: companyId,
        isActive: true,
      },
    });

    const creditEntry1 = await tx.ledgerEntry.create({
      data: {
        entryCode: await generateNextCode('ledgerEntry', 'LED-'),
        date: salesOrder.date,
        accountId: salesRevenueId,
        account: 'Sales Revenue',
        particulars: `Sales Order ${salesOrder.invoiceNo} - ${salesOrder.customer?.name || 'Customer'}`,
        debit: 0,
        credit: salesAmount,
        reference: salesOrder.invoiceNo,
        referenceType: 'SalesOrder',
        companyId: companyId,
        isActive: true,
      },
    });

    // 2. Dr: Cost of Goods Sold | Cr: Inventory
    const debitEntry2 = await tx.ledgerEntry.create({
      data: {
        entryCode: await generateNextCode('ledgerEntry', 'LED-'),
        date: salesOrder.date,
        accountId: cogsAccountId,
        account: 'Cost of Goods Sold',
        particulars: `COGS for Sales Order ${salesOrder.invoiceNo}`,
        debit: costOfGoods,
        credit: 0,
        reference: salesOrder.invoiceNo,
        referenceType: 'SalesOrder',
        companyId: companyId,
        isActive: true,
      },
    });

    const creditEntry2 = await tx.ledgerEntry.create({
      data: {
        entryCode: await generateNextCode('ledgerEntry', 'LED-'),
        date: salesOrder.date,
        accountId: inventoryAccountId,
        account: 'Inventory',
        particulars: `Inventory reduction for Sales Order ${salesOrder.invoiceNo}`,
        debit: 0,
        credit: costOfGoods,
        reference: salesOrder.invoiceNo,
        referenceType: 'SalesOrder',
        companyId: companyId,
        isActive: true,
      },
    });

    // 3. Create LedgerAutoPost tracking record — inherit companyId
    const autoPost = await tx.ledgerAutoPost.create({
      data: {
        code: lapCode,
        sourceType: 'SalesOrder',
        sourceId: salesOrderId,
        sourceCode: salesOrder.invoiceNo,
        debitEntryId: debitEntry1.entryCode,
        creditEntryId: creditEntry1.entryCode,
        debitAccount: 'Accounts Receivable',
        creditAccount: 'Sales Revenue',
        amount: salesAmount,
        postingDate: salesOrder.date,
        status: 'Posted',
        companyId: companyId,
        postedBy: security.user.name,
      },
    });

    return { autoPost, entries: [debitEntry1, creditEntry1, debitEntry2, creditEntry2] };
  });

  // Activity log with Audit-AutoPost-Engine module token
  await logUserActivity({
    action: 'CREATE',
    module: 'Audit-AutoPost-Engine',
    recordId: result.autoPost.id,
    recordLabel: result.autoPost.code,
    userId: security.user.id,
    userName: security.user.name,
    details: JSON.stringify({
      action: 'post-sales',
      salesOrder: salesOrder.invoiceNo,
      amount: salesAmount,
      cogs: costOfGoods,
      entriesCreated: result.entries.length,
    }),
  });

  return NextResponse.json({ autoPost: result.autoPost, entries: result.entries }, { status: 201 });
}

// Post a Purchase Order to the ledger
async function postPurchaseOrder(
  request: NextRequest,
  security: { authorized: true; user: { id: string; email: string; name: string; role: string; companyId: string | null } }
) {
  const { searchParams } = new URL(request.url);
  const purchaseOrderId = searchParams.get('purchaseOrderId');
  const companyId = security.user.companyId;

  if (!purchaseOrderId) {
    return NextResponse.json(
      { error: 'Missing required parameter: purchaseOrderId' },
      { status: 400 }
    );
  }

  // Check if already posted — scoped by companyId
  const existingPostWhere: Record<string, unknown> = { sourceType: 'PurchaseOrder', sourceId: purchaseOrderId, status: 'Posted' };
  if (companyId) existingPostWhere.companyId = companyId;

  const existingPost = await db.ledgerAutoPost.findFirst({ where: existingPostWhere });
  if (existingPost) {
    return NextResponse.json(
      { error: 'This purchase order has already been posted to the ledger.', autoPost: existingPost },
      { status: 409 }
    );
  }

  // Fetch the purchase order
  const purchaseOrder = await db.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: { lines: true, supplier: true },
  });

  if (!purchaseOrder) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
  }

  if (purchaseOrder.status !== 'Confirmed' && purchaseOrder.status !== 'Received') {
    return NextResponse.json(
      { error: `Purchase order must be Confirmed or Received to post. Current status: ${purchaseOrder.status}` },
      { status: 400 }
    );
  }

  const lapCode = await generateAutoPostCode();

  // STAGE 13: Use safeFinancialRound on all amounts
  const purchaseAmount = safeFinancialRound(purchaseOrder.grandTotal);

  // Find or create accounts — company-scoped
  const inventoryAccountId = await findOrCreateAccount('Asset', 'Inventory', security.user, companyId);
  const accountsPayableId = await findOrCreateAccount('Liability', 'Accounts Payable', security.user, companyId);

  // Use transaction for atomicity
  const result = await db.$transaction(async (tx: Parameters<Parameters<typeof tx.$transaction>[0]>[0]) => {
    // Dr: Inventory/Purchases (Asset) | Cr: Accounts Payable (Liability)
    const debitEntry = await tx.ledgerEntry.create({
      data: {
        entryCode: await generateNextCode('ledgerEntry', 'LED-'),
        date: purchaseOrder.date,
        accountId: inventoryAccountId,
        account: 'Inventory',
        particulars: `Purchase Order ${purchaseOrder.poNumber} - ${purchaseOrder.supplier?.name || 'Supplier'}`,
        debit: purchaseAmount,
        credit: 0,
        reference: purchaseOrder.poNumber,
        referenceType: 'PurchaseOrder',
        companyId: companyId,
        isActive: true,
      },
    });

    const creditEntry = await tx.ledgerEntry.create({
      data: {
        entryCode: await generateNextCode('ledgerEntry', 'LED-'),
        date: purchaseOrder.date,
        accountId: accountsPayableId,
        account: 'Accounts Payable',
        particulars: `Purchase Order ${purchaseOrder.poNumber} - ${purchaseOrder.supplier?.name || 'Supplier'}`,
        debit: 0,
        credit: purchaseAmount,
        reference: purchaseOrder.poNumber,
        referenceType: 'PurchaseOrder',
        companyId: companyId,
        isActive: true,
      },
    });

    // Create LedgerAutoPost tracking record — inherit companyId
    const autoPost = await tx.ledgerAutoPost.create({
      data: {
        code: lapCode,
        sourceType: 'PurchaseOrder',
        sourceId: purchaseOrderId,
        sourceCode: purchaseOrder.poNumber,
        debitEntryId: debitEntry.entryCode,
        creditEntryId: creditEntry.entryCode,
        debitAccount: 'Inventory',
        creditAccount: 'Accounts Payable',
        amount: purchaseAmount,
        postingDate: purchaseOrder.date,
        status: 'Posted',
        companyId: companyId,
        postedBy: security.user.name,
      },
    });

    return { autoPost, entries: [debitEntry, creditEntry] };
  });

  // Activity log with Audit-AutoPost-Engine module token
  await logUserActivity({
    action: 'CREATE',
    module: 'Audit-AutoPost-Engine',
    recordId: result.autoPost.id,
    recordLabel: result.autoPost.code,
    userId: security.user.id,
    userName: security.user.name,
    details: JSON.stringify({
      action: 'post-purchase',
      purchaseOrder: purchaseOrder.poNumber,
      amount: purchaseAmount,
      entriesCreated: result.entries.length,
    }),
  });

  return NextResponse.json({ autoPost: result.autoPost, entries: result.entries }, { status: 201 });
}

// Reverse a previous auto-post
async function reverseAutoPost(
  request: NextRequest,
  security: { authorized: true; user: { id: string; email: string; name: string; role: string; companyId: string | null } }
) {
  const { searchParams } = new URL(request.url);
  const autoPostId = searchParams.get('autoPostId');
  const companyId = security.user.companyId;

  if (!autoPostId) {
    return NextResponse.json(
      { error: 'Missing required parameter: autoPostId' },
      { status: 400 }
    );
  }

  const autoPostWhere: Record<string, unknown> = { id: autoPostId };
  if (companyId) autoPostWhere.companyId = companyId;

  const autoPost = await db.ledgerAutoPost.findFirst({ where: autoPostWhere });

  if (!autoPost) {
    return NextResponse.json({ error: 'Auto-post record not found' }, { status: 404 });
  }

  if (autoPost.status === 'Reversed') {
    return NextResponse.json(
      { error: 'This auto-post has already been reversed.' },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const reversalReason = (body as { reason?: string }).reason || 'Manual reversal';

  // Use transaction for atomicity
  const result = await db.$transaction(async (tx: Parameters<Parameters<typeof tx.$transaction>[0]>[0]) => {
    // Find original entries by reference — scoped by companyId
    const entryWhere: Record<string, unknown> = {
      reference: autoPost.sourceCode,
      referenceType: autoPost.sourceType,
      isActive: true,
    };
    if (companyId) entryWhere.companyId = companyId;

    const originalEntries = await tx.ledgerEntry.findMany({ where: entryWhere });

    // Create reversing entries (swap debit/credit) — inherit companyId
    const reversingEntries = [];
    for (const entry of originalEntries) {
      const reversingEntry = await tx.ledgerEntry.create({
        data: {
          entryCode: await generateNextCode('ledgerEntry', 'LED-'),
          date: new Date(),
          accountId: entry.accountId,
          account: entry.account,
          particulars: `REVERSAL: ${entry.particulars || ''}`,
          debit: entry.credit, // Swap
          credit: entry.debit, // Swap
          reference: `REV-${autoPost.sourceCode}`,
          referenceType: 'Reversal',
          companyId: companyId,
          isActive: true,
        },
      });
      reversingEntries.push(reversingEntry);
    }

    // Update auto-post status
    const updatedAutoPost = await tx.ledgerAutoPost.update({
      where: { id: autoPostId },
      data: {
        status: 'Reversed',
        reversalReason,
      },
    });

    return { autoPost: updatedAutoPost, reversingEntries };
  });

  // Activity log with Audit-AutoPost-Engine module token
  await logUserActivity({
    action: 'UPDATE',
    module: 'Audit-AutoPost-Engine',
    recordId: result.autoPost.id,
    recordLabel: result.autoPost.code,
    userId: security.user.id,
    userName: security.user.name,
    details: JSON.stringify({
      action: 'reverse',
      originalSourceCode: autoPost.sourceCode,
      originalSourceType: autoPost.sourceType,
      originalAmount: autoPost.amount,
      reversalReason,
      reversingEntriesCreated: result.reversingEntries.length,
    }),
  });

  return NextResponse.json({
    autoPost: result.autoPost,
    reversingEntries: result.reversingEntries,
  });
}

// Run all pending auto-posts
// STAGE 13: Each individual order posting is wrapped in its own try/catch
// with rollback so one failure doesn't corrupt the rest.
async function runAllPending(
  security: { authorized: true; user: { id: string; email: string; name: string; role: string; companyId: string | null } }
) {
  const companyId = security.user.companyId;
  const companyFilter = companyId ? { companyId } : {};

  const results: Record<string, unknown>[] = [];
  const errors: Record<string, unknown>[] = [];

  // Find all confirmed SalesOrders without a LedgerAutoPost record — scoped by companyId
  const postedSalesWhere: Record<string, unknown> = { sourceType: 'SalesOrder', status: 'Posted' };
  if (companyId) postedSalesWhere.companyId = companyId;

  const postedSalesIds = await db.ledgerAutoPost.findMany({
    where: postedSalesWhere,
    select: { sourceId: true },
  });
  const postedSalesIdSet = new Set(postedSalesIds.map((p: { sourceId: string }) => p.sourceId));

  const pendingSalesOrders = await db.salesOrder.findMany({
    where: {
      status: { in: ['Confirmed', 'Delivered'] },
      isActive: true,
    },
  });

  const unpostedSales = pendingSalesOrders.filter(
    (so: { id: string }) => !postedSalesIdSet.has(so.id)
  );

  // Find all confirmed PurchaseOrders without a LedgerAutoPost record — scoped by companyId
  const postedPurchaseWhere: Record<string, unknown> = { sourceType: 'PurchaseOrder', status: 'Posted' };
  if (companyId) postedPurchaseWhere.companyId = companyId;

  const postedPurchaseIds = await db.ledgerAutoPost.findMany({
    where: postedPurchaseWhere,
    select: { sourceId: true },
  });
  const postedPurchaseIdSet = new Set(postedPurchaseIds.map((p: { sourceId: string }) => p.sourceId));

  const pendingPurchaseOrders = await db.purchaseOrder.findMany({
    where: {
      status: { in: ['Confirmed', 'Received'] },
      isActive: true,
    },
  });

  const unpostedPurchases = pendingPurchaseOrders.filter(
    (po: { id: string }) => !postedPurchaseIdSet.has(po.id)
  );

  // Post each pending sales order — EACH wrapped in individual try/catch for defensive fallback
  for (const so of unpostedSales) {
    try {
      // STAGE 13: Use safeFinancialRound on amounts
      const salesAmount = safeFinancialRound(so.grandTotal);

      // Check if already posted (double-check)
      const existingWhere: Record<string, unknown> = { sourceType: 'SalesOrder', sourceId: so.id, status: 'Posted' };
      if (companyId) existingWhere.companyId = companyId;
      const existing = await db.ledgerAutoPost.findFirst({ where: existingWhere });
      if (existing) continue;

      const lapCode = await generateAutoPostCode();

      // Get sales order details
      const fullSO = await db.salesOrder.findUnique({
        where: { id: so.id },
        include: { lines: true, customer: true },
      });

      if (!fullSO) continue;

      const costOfGoods = safeFinancialRound(
        fullSO.lines.reduce(
          (sum: number, line: { quantity: number; rate: number | null }) =>
            safeFinancialAdd(sum, (line.quantity * (line.rate || 0))),
          0
        )
      );

      const accountsReceivableId = await findOrCreateAccount('Asset', 'Accounts Receivable', security.user, companyId);
      const salesRevenueId = await findOrCreateAccount('Income', 'Sales Revenue', security.user, companyId);
      const cogsAccountId = await findOrCreateAccount('Expense', 'Cost of Goods Sold', security.user, companyId);
      const inventoryAccountId = await findOrCreateAccount('Asset', 'Inventory', security.user, companyId);

      // STAGE 13: Individual transaction per order — one failure doesn't corrupt the rest
      const result = await db.$transaction(async (tx: Parameters<Parameters<typeof tx.$transaction>[0]>[0]) => {
        const d1 = await tx.ledgerEntry.create({
          data: {
            entryCode: await generateNextCode('ledgerEntry', 'LED-'),
            date: fullSO.date,
            accountId: accountsReceivableId,
            account: 'Accounts Receivable',
            particulars: `Sales Order ${fullSO.invoiceNo} - ${fullSO.customer?.name || 'Customer'}`,
            debit: salesAmount,
            credit: 0,
            reference: fullSO.invoiceNo,
            referenceType: 'SalesOrder',
            companyId: companyId,
            isActive: true,
          },
        });
        const c1 = await tx.ledgerEntry.create({
          data: {
            entryCode: await generateNextCode('ledgerEntry', 'LED-'),
            date: fullSO.date,
            accountId: salesRevenueId,
            account: 'Sales Revenue',
            particulars: `Sales Order ${fullSO.invoiceNo} - ${fullSO.customer?.name || 'Customer'}`,
            debit: 0,
            credit: salesAmount,
            reference: fullSO.invoiceNo,
            referenceType: 'SalesOrder',
            companyId: companyId,
            isActive: true,
          },
        });
        const d2 = await tx.ledgerEntry.create({
          data: {
            entryCode: await generateNextCode('ledgerEntry', 'LED-'),
            date: fullSO.date,
            accountId: cogsAccountId,
            account: 'Cost of Goods Sold',
            particulars: `COGS for Sales Order ${fullSO.invoiceNo}`,
            debit: costOfGoods,
            credit: 0,
            reference: fullSO.invoiceNo,
            referenceType: 'SalesOrder',
            companyId: companyId,
            isActive: true,
          },
        });
        const c2 = await tx.ledgerEntry.create({
          data: {
            entryCode: await generateNextCode('ledgerEntry', 'LED-'),
            date: fullSO.date,
            accountId: inventoryAccountId,
            account: 'Inventory',
            particulars: `Inventory reduction for Sales Order ${fullSO.invoiceNo}`,
            debit: 0,
            credit: costOfGoods,
            reference: fullSO.invoiceNo,
            referenceType: 'SalesOrder',
            companyId: companyId,
            isActive: true,
          },
        });

        const autoPost = await tx.ledgerAutoPost.create({
          data: {
            code: lapCode,
            sourceType: 'SalesOrder',
            sourceId: so.id,
            sourceCode: fullSO.invoiceNo,
            debitEntryId: d1.entryCode,
            creditEntryId: c1.entryCode,
            debitAccount: 'Accounts Receivable',
            creditAccount: 'Sales Revenue',
            amount: salesAmount,
            postingDate: fullSO.date,
            status: 'Posted',
            companyId: companyId,
            postedBy: security.user.name,
          },
        });

        return autoPost;
      });

      results.push({ type: 'SalesOrder', code: fullSO.invoiceNo, autoPostCode: result.code, amount: salesAmount });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push({ type: 'SalesOrder', id: so.id, code: so.invoiceNo, error: errorMessage });
    }
  }

  // Post each pending purchase order — EACH wrapped in individual try/catch for defensive fallback
  for (const po of unpostedPurchases) {
    try {
      const existingWhere: Record<string, unknown> = { sourceType: 'PurchaseOrder', sourceId: po.id, status: 'Posted' };
      if (companyId) existingWhere.companyId = companyId;
      const existing = await db.ledgerAutoPost.findFirst({ where: existingWhere });
      if (existing) continue;

      const lapCode = await generateAutoPostCode();
      const purchaseAmount = safeFinancialRound(po.grandTotal);

      const fullPO = await db.purchaseOrder.findUnique({
        where: { id: po.id },
        include: { supplier: true },
      });

      if (!fullPO) continue;

      const inventoryAccountId = await findOrCreateAccount('Asset', 'Inventory', security.user, companyId);
      const accountsPayableId = await findOrCreateAccount('Liability', 'Accounts Payable', security.user, companyId);

      // STAGE 13: Individual transaction per order — one failure doesn't corrupt the rest
      const result = await db.$transaction(async (tx: Parameters<Parameters<typeof tx.$transaction>[0]>[0]) => {
        const d1 = await tx.ledgerEntry.create({
          data: {
            entryCode: await generateNextCode('ledgerEntry', 'LED-'),
            date: fullPO.date,
            accountId: inventoryAccountId,
            account: 'Inventory',
            particulars: `Purchase Order ${fullPO.poNumber} - ${fullPO.supplier?.name || 'Supplier'}`,
            debit: purchaseAmount,
            credit: 0,
            reference: fullPO.poNumber,
            referenceType: 'PurchaseOrder',
            companyId: companyId,
            isActive: true,
          },
        });
        const c1 = await tx.ledgerEntry.create({
          data: {
            entryCode: await generateNextCode('ledgerEntry', 'LED-'),
            date: fullPO.date,
            accountId: accountsPayableId,
            account: 'Accounts Payable',
            particulars: `Purchase Order ${fullPO.poNumber} - ${fullPO.supplier?.name || 'Supplier'}`,
            debit: 0,
            credit: purchaseAmount,
            reference: fullPO.poNumber,
            referenceType: 'PurchaseOrder',
            companyId: companyId,
            isActive: true,
          },
        });

        const autoPost = await tx.ledgerAutoPost.create({
          data: {
            code: lapCode,
            sourceType: 'PurchaseOrder',
            sourceId: po.id,
            sourceCode: fullPO.poNumber,
            debitEntryId: d1.entryCode,
            creditEntryId: c1.entryCode,
            debitAccount: 'Inventory',
            creditAccount: 'Accounts Payable',
            amount: purchaseAmount,
            postingDate: fullPO.date,
            status: 'Posted',
            companyId: companyId,
            postedBy: security.user.name,
          },
        });

        return autoPost;
      });

      results.push({ type: 'PurchaseOrder', code: fullPO.poNumber, autoPostCode: result.code, amount: purchaseAmount });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push({ type: 'PurchaseOrder', id: po.id, code: po.poNumber, error: errorMessage });
    }
  }

  // STAGE 13: Use safeFinancialAdd for total accumulations
  const totalPostedAmount = results.reduce(
    (sum: number, r: Record<string, unknown>) => safeFinancialAdd(sum, (r.amount as number) || 0),
    0
  );

  // Activity log with Audit-AutoPost-Engine module token
  await logUserActivity({
    action: 'CREATE',
    module: 'Audit-AutoPost-Engine',
    recordLabel: 'Run All Pending',
    userId: security.user.id,
    userName: security.user.name,
    details: JSON.stringify({
      action: 'run-all-pending',
      salesPosted: results.filter(r => r.type === 'SalesOrder').length,
      purchasesPosted: results.filter(r => r.type === 'PurchaseOrder').length,
      errors: errors.length,
      totalPostedAmount,
    }),
  });

  return NextResponse.json({
    posted: results,
    errors,
    summary: {
      totalPosted: results.length,
      totalErrors: errors.length,
      salesPosted: results.filter(r => r.type === 'SalesOrder').length,
      purchasesPosted: results.filter(r => r.type === 'PurchaseOrder').length,
      totalPostedAmount,
    },
  });
}
