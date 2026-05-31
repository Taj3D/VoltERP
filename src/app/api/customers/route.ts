import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  maskForVatAuditor,
  validateImageFields,
  checkFinancialDeletePermission,
  safeFinancialRound,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ────────────────────────────────────────────────────────────
// INLINE SANITIZATION HELPERS
// ────────────────────────────────────────────────────────────

/** Trim + strip HTML tags — prevents XSS and normalizes input */
function sanitizeString(input: string): string {
  return input.trim().replace(/<[^>]*>/g, '');
}

/** Convert empty/whitespace-only strings to null; sanitize non-empty values */
function nullIfEmpty(val: string | null | undefined): string | null {
  if (!val || val.trim() === '') return null;
  return sanitizeString(val);
}

/** Validate that an opening balance value is a proper non-negative number */
function validateOpeningBalance(value: unknown): { valid: boolean; amount: number; error?: string } {
  if (value === undefined || value === null || value === '') {
    return { valid: true, amount: 0 };
  }

  const strVal = String(value).trim();

  // Reject non-numeric characters, spaces, or raw negative numbers
  if (!/^\d+(\.\d+)?$/.test(strVal)) {
    return {
      valid: false,
      amount: 0,
      error: 'Opening Balance must be a non-negative number. Spaces, letters, special characters, and negative values are not allowed.',
    };
  }

  const numVal = safeFinancialRound(parseFloat(strVal));
  if (isNaN(numVal) || numVal < 0) {
    return {
      valid: false,
      amount: 0,
      error: 'Opening Balance must be a valid non-negative number.',
    };
  }

  return { valid: true, amount: numVal };
}

/** Map direction toggle labels to Dr/Cr */
function mapOpeningBalanceType(raw: string | undefined): 'Dr' | 'Cr' {
  if (!raw) return 'Dr';
  const normalized = raw.trim().toUpperCase();
  if (normalized === 'ADVANCE' || normalized === 'CR') return 'Cr';
  // Default: DUE → Dr
  return 'Dr';
}

// ────────────────────────────────────────────────────────────
// GET /api/customers — List all customers with multi-tenant isolation + VAT Auditor masking
// ────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Customers', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const customers = await db.customer.findMany({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { salesOrders: true, hireSales: true, cashCollections: true, orderSheets: true } },
        coaAccount: true,
      },
    });

    // VAT Auditor: mask openingBalance + creditLimit
    // SR: mask creditLimit only
    const maskedItems = customers.map(item => {
      if (role === 'vat_auditor') {
        return maskForVatAuditor(item, role, ['openingBalance', 'creditLimit']);
      }
      if (role === 'sr') {
        return maskForVatAuditor(item, role, ['creditLimit'], { creditLimit: ['sr'] });
      }
      return item;
    });

    return NextResponse.json(maskedItems);
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────
// POST /api/customers — Create customer with collision shields, COA ledger, opening balance
// Supports batchMode for CSV import
// ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Customers', 'POST');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const body = await request.json();

    // ────────────────────────────────────────────────────────────
    // Batch mode support (CSV import)
    // ────────────────────────────────────────────────────────────
    if (body.batchMode === true && Array.isArray(body.data)) {
      const results: unknown[] = [];
      const errors: string[] = [];

      for (let i = 0; i < body.data.length; i++) {
        try {
          const record = body.data[i];
          const result = await createSingleCustomer(record, userId, userName, companyId);
          results.push(result);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`Row ${i + 1}: ${msg}`);
        }
      }

      // Batch activity log
      await logUserActivity({
        action: 'IMPORT',
        module: 'CRM-Profiles-Core',
        recordId: 'BATCH',
        recordLabel: `Batch import: ${results.length} customers`,
        userId,
        userName,
        details: JSON.stringify({ created: results.length, errors: errors.length }),
      });

      return NextResponse.json(
        {
          created: results.length,
          errors: errors.length > 0 ? errors : undefined,
          data: results,
        },
        { status: 201 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // Single create
    // ────────────────────────────────────────────────────────────
    const result = await createSingleCustomer(body, userId, userName, companyId);
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating customer:', error);
    const message = error instanceof Error ? error.message : 'Failed to create customer';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Shared helper: create a single customer record inside a transaction.
 * Handles collision detection, auto-code, COA sub-node creation,
 * double-entry ledger for opening balance, and AuditLog.
 */
async function createSingleCustomer(
  body: Record<string, unknown>,
  userId: string,
  userName: string,
  companyId: string | null
) {
  // ────────────────────────────────────────────────────────────
  // 1. Image validation
  // ────────────────────────────────────────────────────────────
  const imgError = validateImageFields(body, ['profileImage', 'nidFrontImage', 'nidBackImage']);
  if (imgError) throw new Error(imgError);

  // ────────────────────────────────────────────────────────────
  // 2. Sanitize collision-shielded fields
  // ────────────────────────────────────────────────────────────
  const sanitizedPhone = nullIfEmpty(body.phone as string | null | undefined);
  const sanitizedAlternativePhone = nullIfEmpty(body.alternativePhone as string | null | undefined);
  const sanitizedEmail = nullIfEmpty(body.email as string | null | undefined);
  const sanitizedNidNumber = nullIfEmpty(body.nidNumber as string | null | undefined);

  // ────────────────────────────────────────────────────────────
  // 3. Validate opening balance
  // ────────────────────────────────────────────────────────────
  const obValidation = validateOpeningBalance(body.openingBalance);
  if (!obValidation.valid) throw new Error(obValidation.error!);

  const openingBalance = obValidation.amount;
  const openingBalanceType = mapOpeningBalanceType(body.openingBalanceType as string | undefined);

  // ────────────────────────────────────────────────────────────
  // 4. Validate credit limit
  // ────────────────────────────────────────────────────────────
  let creditLimit = 0;
  if (body.creditLimit !== undefined && body.creditLimit !== null && body.creditLimit !== '') {
    const clStr = String(body.creditLimit).trim();
    if (!/^\d+(\.\d+)?$/.test(clStr)) {
      throw new Error('Credit Limit must be a non-negative number.');
    }
    creditLimit = safeFinancialRound(parseFloat(clStr));
  }

  // ────────────────────────────────────────────────────────────
  // 5. Multi-tenant collision shields
  // ────────────────────────────────────────────────────────────
  // Check for existing active records with same companyId AND same phone/email/alternativePhone/nidNumber
  if (companyId) {
    if (sanitizedPhone) {
      const phoneCollision = await db.customer.findFirst({
        where: { companyId, phone: sanitizedPhone, isActive: true },
      });
      if (phoneCollision) {
        throw new Error('Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.');
      }
    }

    if (sanitizedAlternativePhone) {
      const altPhoneCollision = await db.customer.findFirst({
        where: { companyId, alternativePhone: sanitizedAlternativePhone, isActive: true },
      });
      if (altPhoneCollision) {
        throw new Error('Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.');
      }
    }

    if (sanitizedEmail) {
      const emailCollision = await db.customer.findFirst({
        where: { companyId, email: sanitizedEmail, isActive: true },
      });
      if (emailCollision) {
        throw new Error('Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.');
      }
    }

    if (sanitizedNidNumber) {
      const nidCollision = await db.customer.findFirst({
        where: { companyId, nidNumber: sanitizedNidNumber, isActive: true },
      });
      if (nidCollision) {
        throw new Error('Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.');
      }
    }
  }

  // ────────────────────────────────────────────────────────────
  // 6. Create within transaction (COA + Ledger if openingBalance > 0)
  // ────────────────────────────────────────────────────────────
  return await db.$transaction(async (tx) => {
    // Auto-generate CUS-XXXXX code (5-digit zero-padded)
    let customerCode = body.customerCode as string | undefined;
    if (!customerCode) {
      const lastCustomer = await tx.customer.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { customerCode: true },
      });
      let nextNum = 1;
      if (lastCustomer?.customerCode) {
        const match = lastCustomer.customerCode.match(/CUS-(\d+)/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
      }
      customerCode = `CUS-${String(nextNum).padStart(5, '0')}`;
    }

    // Sanitize remaining string fields
    const sanitizedName = sanitizeString(String(body.name || ''));
    if (!sanitizedName) throw new Error('Customer name is required.');

    const sanitizedAddress = nullIfEmpty(body.address as string | null | undefined);
    const sanitizedArea = nullIfEmpty(body.area as string | null | undefined);
    const sanitizedReference = nullIfEmpty(body.reference as string | null | undefined);

    // Create the Customer record
    const record = await tx.customer.create({
      data: {
        customerCode,
        name: sanitizedName,
        phone: sanitizedPhone,
        alternativePhone: sanitizedAlternativePhone,
        email: sanitizedEmail,
        address: sanitizedAddress,
        area: sanitizedArea,
        reference: sanitizedReference,
        nidNumber: sanitizedNidNumber,
        openingBalance,
        openingBalanceType,
        creditLimit,
        customerType: (body.customerType as string) || 'Regular',
        profileImage: nullIfEmpty(body.profileImage as string | null | undefined),
        nidFrontImage: nullIfEmpty(body.nidFrontImage as string | null | undefined),
        nidBackImage: nullIfEmpty(body.nidBackImage as string | null | undefined),
        companyId: companyId || null,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
      },
      include: {
        _count: { select: { salesOrders: true, hireSales: true, cashCollections: true, orderSheets: true } },
      },
    });

    // ────────────────────────────────────────────────────────────
    // 7. Opening Balance Integrity & Atomic COA Ledger Pointers
    // ────────────────────────────────────────────────────────────
    if (openingBalance > 0) {
      // Step 7a: Find or create "Accounts Receivable" parent COA node (classification="Asset")
      let arParent = await tx.chartOfAccount.findFirst({
        where: {
          name: 'Accounts Receivable',
          classification: 'Asset',
          ...(companyId ? { companyId } : {}),
          isActive: true,
        },
      });

      if (!arParent) {
        // Auto-generate COA code for AR parent
        const lastCoa = await tx.chartOfAccount.findFirst({
          orderBy: { code: 'desc' },
          select: { code: true },
        });
        let nextCoaNum = 1;
        if (lastCoa?.code) {
          const coaMatch = lastCoa.code.match(/COA-(\d+)/);
          if (coaMatch) nextCoaNum = parseInt(coaMatch[1], 10) + 1;
        }
        const arCode = `COA-${String(nextCoaNum).padStart(5, '0')}`;

        arParent = await tx.chartOfAccount.create({
          data: {
            code: arCode,
            name: 'Accounts Receivable',
            classification: 'Asset',
            companyId: companyId || null,
            isActive: true,
          },
        });
      }

      // Step 7b: Create child COA sub-node: AR-CUS-{customerCode}
      const arSubCode = `AR-CUS-${customerCode}`;
      const arSubNode = await tx.chartOfAccount.create({
        data: {
          code: arSubCode,
          name: `AR: ${sanitizedName}`,
          classification: 'Asset',
          parentAccountId: arParent.id,
          openingBalance,
          openingBalanceType,
          companyId: companyId || null,
          isActive: true,
        },
      });

      // Step 7c: Link customer's coaAccountId to the new sub-node
      await tx.customer.update({
        where: { id: record.id },
        data: { coaAccountId: arSubNode.id },
      });

      // Step 7d: Generate double-entry accounting ledger entries
      // Find or create "Retained Earnings" / "Capital" COA node
      let retainedEarnings = await tx.chartOfAccount.findFirst({
        where: {
          name: { in: ['Retained Earnings', 'Capital', 'Owner Equity'] },
          classification: 'Equity',
          ...(companyId ? { companyId } : {}),
          isActive: true,
        },
      });

      if (!retainedEarnings) {
        const lastCoa2 = await tx.chartOfAccount.findFirst({
          orderBy: { code: 'desc' },
          select: { code: true },
        });
        let nextCoaNum2 = 1;
        if (lastCoa2?.code) {
          const coaMatch2 = lastCoa2.code.match(/COA-(\d+)/);
          if (coaMatch2) nextCoaNum2 = parseInt(coaMatch2[1], 10) + 1;
        }
        const reCode = `COA-${String(nextCoaNum2).padStart(5, '0')}`;

        retainedEarnings = await tx.chartOfAccount.create({
          data: {
            code: reCode,
            name: 'Retained Earnings',
            classification: 'Equity',
            companyId: companyId || null,
            isActive: true,
          },
        });
      }

      // Auto-generate ledger entry code
      const lastLedger = await tx.ledgerEntry.findFirst({
        orderBy: { entryCode: 'desc' },
        select: { entryCode: true },
      });
      let nextLedgerNum = 1;
      if (lastLedger?.entryCode) {
        const ledgerMatch = lastLedger.entryCode.match(/LED-(\d+)/);
        if (ledgerMatch) nextLedgerNum = parseInt(ledgerMatch[1], 10) + 1;
      }

      if (openingBalanceType === 'Dr') {
        // DUE (Dr): Debit the AR sub-node, Credit Retained Earnings/Capital
        await tx.ledgerEntry.create({
          data: {
            entryCode: `LED-${String(nextLedgerNum).padStart(5, '0')}`,
            date: new Date(),
            accountId: arSubNode.id,
            account: `AR: ${sanitizedName}`,
            particulars: `Customer opening balance (Due) — ${customerCode}`,
            debit: openingBalance,
            credit: 0,
            reference: customerCode,
            referenceType: 'CustomerOpeningBalance',
            companyId: companyId || null,
          },
        });

        await tx.ledgerEntry.create({
          data: {
            entryCode: `LED-${String(nextLedgerNum + 1).padStart(5, '0')}`,
            date: new Date(),
            accountId: retainedEarnings.id,
            account: 'Retained Earnings',
            particulars: `Customer opening balance (Due) — ${customerCode}`,
            debit: 0,
            credit: openingBalance,
            reference: customerCode,
            referenceType: 'CustomerOpeningBalance',
            companyId: companyId || null,
          },
        });
      } else {
        // ADVANCE (Cr): Credit the AR sub-node, Debit Retained Earnings/Capital
        await tx.ledgerEntry.create({
          data: {
            entryCode: `LED-${String(nextLedgerNum).padStart(5, '0')}`,
            date: new Date(),
            accountId: arSubNode.id,
            account: `AR: ${sanitizedName}`,
            particulars: `Customer opening balance (Advance) — ${customerCode}`,
            debit: 0,
            credit: openingBalance,
            reference: customerCode,
            referenceType: 'CustomerOpeningBalance',
            companyId: companyId || null,
          },
        });

        await tx.ledgerEntry.create({
          data: {
            entryCode: `LED-${String(nextLedgerNum + 1).padStart(5, '0')}`,
            date: new Date(),
            accountId: retainedEarnings.id,
            account: 'Retained Earnings',
            particulars: `Customer opening balance (Advance) — ${customerCode}`,
            debit: openingBalance,
            credit: 0,
            reference: customerCode,
            referenceType: 'CustomerOpeningBalance',
            companyId: companyId || null,
          },
        });
      }
    }

    // ────────────────────────────────────────────────────────────
    // 8. Activity log — module token: CRM-Profiles-Core
    // ────────────────────────────────────────────────────────────
    await logUserActivity({
      action: 'CREATE',
      module: 'CRM-Profiles-Core',
      recordId: record.id,
      recordLabel: `${record.customerCode} - ${record.name}`,
      userId,
      userName,
      details: JSON.stringify({
        customerCode: record.customerCode,
        name: record.name,
        customerType: record.customerType,
        creditLimit,
        openingBalance,
        openingBalanceType,
        coaCreated: openingBalance > 0,
      }),
    });

    return record;
  });
}
