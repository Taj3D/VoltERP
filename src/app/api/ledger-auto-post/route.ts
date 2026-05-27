// ============================================================
// LEDGER AUTO-POST API — Automated Ledger Posting from Transactions
// Group 5: Financial Auditing, Automated Ledgers & Data Integrity
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, type UserRole } from '@/lib/api-security';
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

function maskForVat(value: any, isVatAuditor: boolean): any {
  if (!isVatAuditor) return value;
  return 'N/A (Audit Mode)';
}

// Helper: Find or create a ChartOfAccount by classification and name
async function findOrCreateAccount(
  classification: string,
  accountName: string,
  securityUser: { id: string; name: string }
): Promise<string> {
  // Try to find existing account
  let account = await db.chartOfAccount.findFirst({
    where: {
      classification,
      name: { contains: accountName },
      isActive: true,
    },
  });

  if (!account) {
    // Try exact match
    account = await db.chartOfAccount.findFirst({
      where: {
        classification,
        isActive: true,
      },
    });
  }

  if (account) return account.id;

  // Create the account if it doesn't exist
  const code = await generateNextCode('chartOfAccount', 'COA-');
  const newAccount = await db.chartOfAccount.create({
    data: {
      code,
      name: accountName,
      classification,
      openingBalance: 0,
      openingBalanceType: classification === 'Asset' || classification === 'Expense' ? 'Dr' : 'Cr',
      isActive: true,
    },
  });

  // Audit log
  await db.auditLog.create({
    data: {
      action: 'CREATE',
      module: 'ChartOfAccounts',
      recordId: newAccount.id,
      recordLabel: newAccount.code,
      userId: securityUser.id,
      userName: securityUser.name,
      details: JSON.stringify({ autoCreated: true, name: accountName, classification }),
    },
  });

  return newAccount.id;
}

// GET /api/ledger-auto-post — List auto-post records with filters
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'LedgerEntries', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const userRole = security.user.role as UserRole;
    const isVatAuditor = userRole === 'vat_auditor';

    // SR and Dealer blocked
    if (userRole === 'sr' || userRole === 'dealer') {
      return NextResponse.json(
        { error: 'Access denied. SR and Dealer roles cannot access ledger auto-post records.' },
        { status: 403 }
      );
    }

    const where: Record<string, unknown> = {};

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

    // Mask amounts for VAT Auditor
    const masked = records.map((record: any) => ({
      ...record,
      amount: isVatAuditor ? maskForVat(record.amount, true) : record.amount,
    }));

    return NextResponse.json({ records: masked, total, limit, offset });
  } catch (error) {
    console.error('Ledger auto-post GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch auto-post records' }, { status: 500 });
  }
}

// POST /api/ledger-auto-post — Various auto-posting actions
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'LedgerEntries', 'POST');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const userRole = security.user.role as UserRole;

    // SR and Dealer blocked
    if (userRole === 'sr' || userRole === 'dealer') {
      return NextResponse.json(
        { error: 'Access denied. SR and Dealer roles cannot perform ledger auto-posting.' },
        { status: 403 }
      );
    }

    // VAT Auditor: read-only
    if (userRole === 'vat_auditor') {
      return NextResponse.json(
        { error: 'Write access denied. VAT Auditor has read-only access.' },
        { status: 403 }
      );
    }

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
  security: { authorized: true; user: { id: string; email: string; name: string; role: string } }
) {
  const { searchParams } = new URL(request.url);
  const salesOrderId = searchParams.get('salesOrderId');

  if (!salesOrderId) {
    return NextResponse.json(
      { error: 'Missing required parameter: salesOrderId' },
      { status: 400 }
    );
  }

  // Check if already posted
  const existingPost = await db.ledgerAutoPost.findFirst({
    where: { sourceType: 'SalesOrder', sourceId: salesOrderId, status: 'Posted' },
  });
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
  const salesAmount = salesOrder.grandTotal;
  const costOfGoods = salesOrder.lines.reduce(
    (sum: number, line: any) => sum + (line.quantity * (line.rate || 0)),
    0
  );

  // Find or create accounts
  const accountsReceivableId = await findOrCreateAccount('Asset', 'Accounts Receivable', security.user);
  const salesRevenueId = await findOrCreateAccount('Income', 'Sales Revenue', security.user);
  const cogsAccountId = await findOrCreateAccount('Expense', 'Cost of Goods Sold', security.user);
  const inventoryAccountId = await findOrCreateAccount('Asset', 'Inventory', security.user);

  // Use transaction for atomicity
  const result = await db.$transaction(async (tx: any) => {
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
        isActive: true,
      },
    });

    // 3. Create LedgerAutoPost tracking record
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
        postedBy: security.user.name,
      },
    });

    return { autoPost, entries: [debitEntry1, creditEntry1, debitEntry2, creditEntry2] };
  });

  // Audit log
  await db.auditLog.create({
    data: {
      action: 'CREATE',
      module: 'LedgerAutoPost',
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
    },
  });

  return NextResponse.json({ autoPost: result.autoPost, entries: result.entries }, { status: 201 });
}

// Post a Purchase Order to the ledger
async function postPurchaseOrder(
  request: NextRequest,
  security: { authorized: true; user: { id: string; email: string; name: string; role: string } }
) {
  const { searchParams } = new URL(request.url);
  const purchaseOrderId = searchParams.get('purchaseOrderId');

  if (!purchaseOrderId) {
    return NextResponse.json(
      { error: 'Missing required parameter: purchaseOrderId' },
      { status: 400 }
    );
  }

  // Check if already posted
  const existingPost = await db.ledgerAutoPost.findFirst({
    where: { sourceType: 'PurchaseOrder', sourceId: purchaseOrderId, status: 'Posted' },
  });
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
  const purchaseAmount = purchaseOrder.grandTotal;

  // Find or create accounts
  const inventoryAccountId = await findOrCreateAccount('Asset', 'Inventory', security.user);
  const accountsPayableId = await findOrCreateAccount('Liability', 'Accounts Payable', security.user);

  // Use transaction for atomicity
  const result = await db.$transaction(async (tx: any) => {
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
        isActive: true,
      },
    });

    // Create LedgerAutoPost tracking record
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
        postedBy: security.user.name,
      },
    });

    return { autoPost, entries: [debitEntry, creditEntry] };
  });

  // Audit log
  await db.auditLog.create({
    data: {
      action: 'CREATE',
      module: 'LedgerAutoPost',
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
    },
  });

  return NextResponse.json({ autoPost: result.autoPost, entries: result.entries }, { status: 201 });
}

// Reverse a previous auto-post
async function reverseAutoPost(
  request: NextRequest,
  security: { authorized: true; user: { id: string; email: string; name: string; role: string } }
) {
  const { searchParams } = new URL(request.url);
  const autoPostId = searchParams.get('autoPostId');

  if (!autoPostId) {
    return NextResponse.json(
      { error: 'Missing required parameter: autoPostId' },
      { status: 400 }
    );
  }

  const autoPost = await db.ledgerAutoPost.findUnique({ where: { id: autoPostId } });

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
  const reversalReason = body.reason || 'Manual reversal';

  // Use transaction for atomicity
  const result = await db.$transaction(async (tx: any) => {
    // Find original entries by reference
    const originalEntries = await tx.ledgerEntry.findMany({
      where: {
        reference: autoPost.sourceCode,
        referenceType: autoPost.sourceType,
        isActive: true,
      },
    });

    // Create reversing entries (swap debit/credit)
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

  // Audit log
  await db.auditLog.create({
    data: {
      action: 'UPDATE',
      module: 'LedgerAutoPost',
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
    },
  });

  return NextResponse.json({
    autoPost: result.autoPost,
    reversingEntries: result.reversingEntries,
  });
}

// Run all pending auto-posts
async function runAllPending(
  security: { authorized: true; user: { id: string; email: string; name: string; role: string } }
) {
  const results: any[] = [];
  const errors: any[] = [];

  // Find all confirmed SalesOrders without a LedgerAutoPost record
  const postedSalesIds = await db.ledgerAutoPost.findMany({
    where: { sourceType: 'SalesOrder', status: 'Posted' },
    select: { sourceId: true },
  });
  const postedSalesIdSet = new Set(postedSalesIds.map((p: any) => p.sourceId));

  const pendingSalesOrders = await db.salesOrder.findMany({
    where: {
      status: { in: ['Confirmed', 'Delivered'] },
      isActive: true,
    },
  });

  const unpostedSales = pendingSalesOrders.filter(
    (so: any) => !postedSalesIdSet.has(so.id)
  );

  // Find all confirmed PurchaseOrders without a LedgerAutoPost record
  const postedPurchaseIds = await db.ledgerAutoPost.findMany({
    where: { sourceType: 'PurchaseOrder', status: 'Posted' },
    select: { sourceId: true },
  });
  const postedPurchaseIdSet = new Set(postedPurchaseIds.map((p: any) => p.sourceId));

  const pendingPurchaseOrders = await db.purchaseOrder.findMany({
    where: {
      status: { in: ['Confirmed', 'Received'] },
      isActive: true,
    },
  });

  const unpostedPurchases = pendingPurchaseOrders.filter(
    (po: any) => !postedPurchaseIdSet.has(po.id)
  );

  // Post each pending sales order
  for (const so of unpostedSales) {
    try {
      // Reuse the post-sales logic but directly (without HTTP redirect)
      const salesAmount = so.grandTotal;

      // Check if already posted (double-check)
      const existing = await db.ledgerAutoPost.findFirst({
        where: { sourceType: 'SalesOrder', sourceId: so.id, status: 'Posted' },
      });
      if (existing) continue;

      const lapCode = await generateAutoPostCode();

      // Get sales order details
      const fullSO = await db.salesOrder.findUnique({
        where: { id: so.id },
        include: { lines: true, customer: true },
      });

      if (!fullSO) continue;

      const costOfGoods = fullSO.lines.reduce(
        (sum: number, line: any) => sum + (line.quantity * (line.rate || 0)),
        0
      );

      const accountsReceivableId = await findOrCreateAccount('Asset', 'Accounts Receivable', security.user);
      const salesRevenueId = await findOrCreateAccount('Income', 'Sales Revenue', security.user);
      const cogsAccountId = await findOrCreateAccount('Expense', 'Cost of Goods Sold', security.user);
      const inventoryAccountId = await findOrCreateAccount('Asset', 'Inventory', security.user);

      const result = await db.$transaction(async (tx: any) => {
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
            postedBy: security.user.name,
          },
        });

        return autoPost;
      });

      results.push({ type: 'SalesOrder', code: fullSO.invoiceNo, autoPostCode: result.code, amount: salesAmount });
    } catch (error: any) {
      errors.push({ type: 'SalesOrder', id: so.id, code: so.invoiceNo, error: error.message });
    }
  }

  // Post each pending purchase order
  for (const po of unpostedPurchases) {
    try {
      const existing = await db.ledgerAutoPost.findFirst({
        where: { sourceType: 'PurchaseOrder', sourceId: po.id, status: 'Posted' },
      });
      if (existing) continue;

      const lapCode = await generateAutoPostCode();
      const purchaseAmount = po.grandTotal;

      const fullPO = await db.purchaseOrder.findUnique({
        where: { id: po.id },
        include: { supplier: true },
      });

      if (!fullPO) continue;

      const inventoryAccountId = await findOrCreateAccount('Asset', 'Inventory', security.user);
      const accountsPayableId = await findOrCreateAccount('Liability', 'Accounts Payable', security.user);

      const result = await db.$transaction(async (tx: any) => {
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
            postedBy: security.user.name,
          },
        });

        return autoPost;
      });

      results.push({ type: 'PurchaseOrder', code: fullPO.poNumber, autoPostCode: result.code, amount: purchaseAmount });
    } catch (error: any) {
      errors.push({ type: 'PurchaseOrder', id: po.id, code: po.poNumber, error: error.message });
    }
  }

  // Audit log
  await db.auditLog.create({
    data: {
      action: 'CREATE',
      module: 'LedgerAutoPost',
      recordLabel: 'Run All Pending',
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        action: 'run-all-pending',
        salesPosted: results.filter(r => r.type === 'SalesOrder').length,
        purchasesPosted: results.filter(r => r.type === 'PurchaseOrder').length,
        errors: errors.length,
      }),
    },
  });

  return NextResponse.json({
    posted: results,
    errors,
    summary: {
      totalPosted: results.length,
      totalErrors: errors.length,
      salesPosted: results.filter(r => r.type === 'SalesOrder').length,
      purchasesPosted: results.filter(r => r.type === 'PurchaseOrder').length,
    },
  });
}
