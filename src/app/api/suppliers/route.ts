import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  maskForVatAuditor,
  validateImageFields,
  safeFinancialRound,
  checkFinancialDeletePermission,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ────────────────────────────────────────────────────────────
// PHASE 9 CRM Profiles — Sanitization Helpers
// ────────────────────────────────────────────────────────────

function sanitizeString(input: string): string {
  return input.trim().replace(/<[^>]*>/g, ''); // trim + strip HTML tags
}

function nullIfEmpty(val: string | null | undefined): string | null {
  if (!val || val.trim() === '') return null;
  return sanitizeString(val);
}

const MODULE_TOKEN = 'CRM-Profiles-Core';

// GET /api/suppliers — List all suppliers with multi-tenant isolation + VAT Auditor masking
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Suppliers', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const suppliers = await db.supplier.findMany({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { purchaseOrders: true, purchaseReturns: true, cashDeliveries: true } },
        coaAccount: true,
      },
    });

    // VAT Auditor: mask openingBalance and creditLimit
    const maskedItems = suppliers.map(item => {
      if (role === 'vat_auditor') {
        return maskForVatAuditor(item, role, ['openingBalance', 'creditLimit']);
      }
      return item;
    });

    return NextResponse.json(maskedItems);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch suppliers' },
      { status: 500 }
    );
  }
}

// POST /api/suppliers — Create supplier with collision shields, COA auto-map, ledger entries
// Supports batchMode for CSV import
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Suppliers', 'POST');
  if (!security.authorized) return security.response;
  // SR: blocked from creating suppliers (handled by MODULE_DENY in api-security)

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
          const item = body.data[i];
          const result = await createSingleSupplier(item, userId, userName, companyId);
          results.push(result);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`Row ${i + 1}: ${msg}`);
        }
      }

      // Batch audit log
      await logUserActivity({
        action: 'IMPORT',
        module: MODULE_TOKEN,
        recordId: 'BATCH',
        recordLabel: `Batch import: ${results.length} suppliers`,
        userId,
        userName,
        details: JSON.stringify({ count: results.length, errors: errors.length }),
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
    const result = await createSingleSupplier(body, userId, userName, companyId);
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating supplier:', error);
    const message = error instanceof Error ? error.message : 'Failed to create supplier';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Shared helper: create a single supplier record inside a transaction.
 * Handles:
 *  - Input sanitization (trim + strip HTML tags)
 *  - Multi-tenant collision shields (phone/email/alternativePhone/nidNumber)
 *  - Opening balance integrity (reject non-numeric, negative raw numbers)
 *  - Auto-generate SUP-XXXXX code
 *  - Auto-map COA sub-node under Liabilities → Accounts Payable
 *  - Double-entry ledger post for opening balance
 *  - AuditLog with module token "CRM-Profiles-Core"
 */
async function createSingleSupplier(
  body: Record<string, unknown>,
  userId: string,
  userName: string,
  companyId: string | null
) {
  // ────────────────────────────────────────────────────────────
  // STEP 0: Sanitize all string inputs
  // ────────────────────────────────────────────────────────────
  const name = sanitizeString(String(body.name || ''));
  if (!name) {
    throw new Error('Supplier name is required');
  }

  const sanitizedPhone = nullIfEmpty(body.phone as string | null | undefined);
  const sanitizedAltPhone = nullIfEmpty(body.alternativePhone as string | null | undefined);
  const sanitizedEmail = nullIfEmpty(body.email as string | null | undefined);
  const sanitizedNidNumber = nullIfEmpty(body.nidNumber as string | null | undefined);
  const sanitizedContactPerson = nullIfEmpty(body.contactPerson as string | null | undefined);
  const sanitizedAddress = nullIfEmpty(body.address as string | null | undefined);
  const sanitizedArea = nullIfEmpty(body.area as string | null | undefined);
  const sanitizedTerms = nullIfEmpty(body.terms as string | null | undefined);

  // Image validation
  const imgError = validateImageFields(body, ['profileImage', 'nidFrontImage', 'nidBackImage']);
  if (imgError) throw new Error(imgError);

  const sanitizedProfileImage = nullIfEmpty(body.profileImage as string | null | undefined);
  const sanitizedNidFrontImage = nullIfEmpty(body.nidFrontImage as string | null | undefined);
  const sanitizedNidBackImage = nullIfEmpty(body.nidBackImage as string | null | undefined);

  // ────────────────────────────────────────────────────────────
  // STEP 1: Opening Balance validation
  // ────────────────────────────────────────────────────────────
  const rawOpeningBalance = body.openingBalance;
  let openingBalance = 0;

  if (rawOpeningBalance !== undefined && rawOpeningBalance !== null) {
    const parsed = parseFloat(String(rawOpeningBalance));

    // Reject non-numeric characters, spaces, or raw negative numbers
    if (isNaN(parsed)) {
      throw new Error('Opening Balance must be a valid number');
    }
    if (parsed < 0) {
      throw new Error('Opening Balance must not be negative. Use DUE/ADVANCE toggle to set direction.');
    }

    openingBalance = safeFinancialRound(parsed);
  }

  // Direction toggle: DUE → "Cr" (supplier is owed), ADVANCE → "Dr" (we owe less / prepaid)
  let openingBalanceType = String(body.openingBalanceType || 'Cr');
  if (body.openingBalanceDirection) {
    const dir = String(body.openingBalanceDirection).toUpperCase();
    if (dir === 'DUE') openingBalanceType = 'Cr';
    else if (dir === 'ADVANCE') openingBalanceType = 'Dr';
  }
  // Validate allowed values
  if (openingBalanceType !== 'Cr' && openingBalanceType !== 'Dr') {
    openingBalanceType = 'Cr';
  }

  const creditLimit = safeFinancialRound(
    body.creditLimit !== undefined && body.creditLimit !== null
      ? Math.max(0, parseFloat(String(body.creditLimit)))
      : 0
  );

  // ────────────────────────────────────────────────────────────
  // STEP 2: Multi-tenant Collision Shields
  // ────────────────────────────────────────────────────────────
  if (companyId) {
    // Phone collision check
    if (sanitizedPhone) {
      const phoneCollision = await db.supplier.findFirst({
        where: { companyId, phone: sanitizedPhone, isActive: true },
      });
      if (phoneCollision) {
        throw new Error('Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.');
      }
    }

    // Alternative phone collision check
    if (sanitizedAltPhone) {
      const altPhoneCollision = await db.supplier.findFirst({
        where: { companyId, alternativePhone: sanitizedAltPhone, isActive: true },
      });
      if (altPhoneCollision) {
        throw new Error('Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.');
      }
    }

    // Email collision check
    if (sanitizedEmail) {
      const emailCollision = await db.supplier.findFirst({
        where: { companyId, email: sanitizedEmail, isActive: true },
      });
      if (emailCollision) {
        throw new Error('Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.');
      }
    }

    // NID number collision check
    if (sanitizedNidNumber) {
      const nidCollision = await db.supplier.findFirst({
        where: { companyId, nidNumber: sanitizedNidNumber, isActive: true },
      });
      if (nidCollision) {
        throw new Error('Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.');
      }
    }
  }

  // ────────────────────────────────────────────────────────────
  // STEP 3: Create supplier with COA auto-map + ledger entries
  // ────────────────────────────────────────────────────────────
  return await db.$transaction(async (tx) => {
    // Re-check collisions inside the transaction for consistency
    if (companyId) {
      if (sanitizedPhone) {
        const phoneCollision = await tx.supplier.findFirst({
          where: { companyId, phone: sanitizedPhone, isActive: true },
        });
        if (phoneCollision) {
          throw new Error('Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.');
        }
      }
      if (sanitizedAltPhone) {
        const altPhoneCollision = await tx.supplier.findFirst({
          where: { companyId, alternativePhone: sanitizedAltPhone, isActive: true },
        });
        if (altPhoneCollision) {
          throw new Error('Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.');
        }
      }
      if (sanitizedEmail) {
        const emailCollision = await tx.supplier.findFirst({
          where: { companyId, email: sanitizedEmail, isActive: true },
        });
        if (emailCollision) {
          throw new Error('Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.');
        }
      }
      if (sanitizedNidNumber) {
        const nidCollision = await tx.supplier.findFirst({
          where: { companyId, nidNumber: sanitizedNidNumber, isActive: true },
        });
        if (nidCollision) {
          throw new Error('Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.');
        }
      }
    }

    // Auto-generate SUP-XXXXX code (5-digit zero-padded)
    let supplierCode = body.supplierCode ? sanitizeString(String(body.supplierCode)) : null;
    if (!supplierCode) {
      const lastSupplier = await tx.supplier.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { supplierCode: true },
      });
      let nextNum = 1;
      if (lastSupplier?.supplierCode) {
        const match = lastSupplier.supplierCode.match(/SUP-(\d+)/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
      }
      supplierCode = `SUP-${String(nextNum).padStart(5, '0')}`;
    }

    let coaAccountId: string | null = null;

    // ────────────────────────────────────────────────────────────
    // STEP 3a: Opening Balance → COA Auto-Map + Ledger Entries
    // ────────────────────────────────────────────────────────────
    if (openingBalance > 0) {
      // Find or create the "Accounts Payable" parent COA node
      let apParent = await tx.chartOfAccount.findFirst({
        where: {
          classification: 'Liability',
          name: { contains: 'Accounts Payable' },
          ...(companyId ? { companyId } : {}),
          isActive: true,
        },
      });

      if (!apParent) {
        // Create the "Accounts Payable" parent COA node under Liabilities
        const lastCoa = await tx.chartOfAccount.findFirst({
          orderBy: { code: 'desc' },
          select: { code: true },
        });
        let coaNextNum = 1;
        if (lastCoa?.code) {
          const match = lastCoa.code.match(/COA-(\d+)/);
          if (match) coaNextNum = parseInt(match[1], 10) + 1;
        }
        const apCode = `COA-${String(coaNextNum).padStart(5, '0')}`;

        apParent = await tx.chartOfAccount.create({
          data: {
            code: apCode,
            name: 'Accounts Payable',
            classification: 'Liability',
            companyId: companyId || null,
            isActive: true,
          },
        });
      }

      // Create child COA sub-node for this supplier
      const apChildCode = `AP-SUP-${supplierCode}`;
      const apChild = await tx.chartOfAccount.create({
        data: {
          code: apChildCode,
          name: `AP: ${name}`,
          classification: 'Liability',
          parentAccountId: apParent.id,
          companyId: companyId || null,
          isActive: true,
        },
      });

      coaAccountId = apChild.id;

      // ──────────────────────────────────────────────────────────
      // STEP 3b: Double-entry ledger post for opening balance
      // ──────────────────────────────────────────────────────────

      // Find or create Retained Earnings / Capital COA node
      let retainedEarnings = await tx.chartOfAccount.findFirst({
        where: {
          classification: 'Equity',
          name: { contains: 'Retained Earnings' },
          ...(companyId ? { companyId } : {}),
          isActive: true,
        },
      });

      if (!retainedEarnings) {
        const lastCoa = await tx.chartOfAccount.findFirst({
          orderBy: { code: 'desc' },
          select: { code: true },
        });
        let reNextNum = 1;
        if (lastCoa?.code) {
          const match = lastCoa.code.match(/COA-(\d+)/);
          if (match) reNextNum = parseInt(match[1], 10) + 1;
        }
        const reCode = `COA-${String(reNextNum).padStart(5, '0')}`;

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

      // Auto-generate ledger entry codes
      const lastLedgerEntry = await tx.ledgerEntry.findFirst({
        orderBy: { entryCode: 'desc' },
        select: { entryCode: true },
      });
      let ledNextNum = 1;
      if (lastLedgerEntry?.entryCode) {
        const match = lastLedgerEntry.entryCode.match(/LED-(\d+)/);
        if (match) ledNextNum = parseInt(match[1], 10) + 1;
      }

      if (openingBalanceType === 'Cr') {
        // DUE: Credit the AP sub-node (liability increases), Debit Retained Earnings/Capital
        await tx.ledgerEntry.create({
          data: {
            entryCode: `LED-${String(ledNextNum).padStart(5, '0')}`,
            date: new Date(),
            accountId: apChild.id,
            account: `AP: ${name}`,
            particulars: `Supplier opening balance (Due): ${supplierCode}`,
            debit: 0,
            credit: openingBalance,
            reference: supplierCode,
            referenceType: 'SupplierOpeningBalance',
            companyId: companyId || null,
          },
        });

        await tx.ledgerEntry.create({
          data: {
            entryCode: `LED-${String(ledNextNum + 1).padStart(5, '0')}`,
            date: new Date(),
            accountId: retainedEarnings.id,
            account: 'Retained Earnings',
            particulars: `Supplier opening balance (Due): ${supplierCode}`,
            debit: openingBalance,
            credit: 0,
            reference: supplierCode,
            referenceType: 'SupplierOpeningBalance',
            companyId: companyId || null,
          },
        });
      } else {
        // ADVANCE: Debit the AP sub-node (prepaid, liability decreases), Credit Retained Earnings/Capital
        await tx.ledgerEntry.create({
          data: {
            entryCode: `LED-${String(ledNextNum).padStart(5, '0')}`,
            date: new Date(),
            accountId: apChild.id,
            account: `AP: ${name}`,
            particulars: `Supplier opening balance (Advance): ${supplierCode}`,
            debit: openingBalance,
            credit: 0,
            reference: supplierCode,
            referenceType: 'SupplierOpeningBalance',
            companyId: companyId || null,
          },
        });

        await tx.ledgerEntry.create({
          data: {
            entryCode: `LED-${String(ledNextNum + 1).padStart(5, '0')}`,
            date: new Date(),
            accountId: retainedEarnings.id,
            account: 'Retained Earnings',
            particulars: `Supplier opening balance (Advance): ${supplierCode}`,
            debit: 0,
            credit: openingBalance,
            reference: supplierCode,
            referenceType: 'SupplierOpeningBalance',
            companyId: companyId || null,
          },
        });
      }
    }

    // ────────────────────────────────────────────────────────────
    // STEP 3c: Register the Supplier profile
    // ────────────────────────────────────────────────────────────
    const record = await tx.supplier.create({
      data: {
        supplierCode,
        name,
        contactPerson: sanitizedContactPerson,
        phone: sanitizedPhone,
        alternativePhone: sanitizedAltPhone,
        email: sanitizedEmail,
        address: sanitizedAddress,
        area: sanitizedArea,
        terms: sanitizedTerms,
        nidNumber: sanitizedNidNumber,
        openingBalance,
        openingBalanceType,
        creditLimit,
        profileImage: sanitizedProfileImage,
        nidFrontImage: sanitizedNidFrontImage,
        nidBackImage: sanitizedNidBackImage,
        coaAccountId,
        companyId: companyId || null,
        isActive: true,
      },
      include: {
        _count: { select: { purchaseOrders: true, purchaseReturns: true, cashDeliveries: true } },
        coaAccount: true,
      },
    });

    // ────────────────────────────────────────────────────────────
    // STEP 3d: AuditLog entry — module token: CRM-Profiles-Core
    // ────────────────────────────────────────────────────────────
    await logUserActivity({
      action: 'CREATE',
      module: MODULE_TOKEN,
      recordId: record.id,
      recordLabel: `${record.supplierCode} - ${record.name}`,
      userId,
      userName,
      details: JSON.stringify({
        supplierCode: record.supplierCode,
        name: record.name,
        openingBalance,
        openingBalanceType,
        creditLimit,
        coaAccountId,
        companyId: companyId || null,
      }),
    });

    return record;
  });
}
