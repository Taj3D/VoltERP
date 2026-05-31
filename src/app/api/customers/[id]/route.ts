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
// GET /api/customers/[id] — Get single customer with cross-tenant validation + VAT Auditor masking
// ────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Customers', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const { id } = await params;
    const item = await db.customer.findUnique({
      where: { id },
      include: {
        _count: { select: { salesOrders: true, hireSales: true, cashCollections: true, orderSheets: true } },
        coaAccount: true,
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // VAT Auditor: mask openingBalance + creditLimit
    // SR: mask creditLimit only
    const masked = role === 'vat_auditor'
      ? maskForVatAuditor(item, role, ['openingBalance', 'creditLimit'])
      : role === 'sr'
        ? maskForVatAuditor(item, role, ['creditLimit'], { creditLimit: ['sr'] })
        : item;

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching customer:', error);
    return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────
// PUT /api/customers/[id] — Update customer with cross-tenant validation, collision shields
// ────────────────────────────────────────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Customers', 'PUT');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, role, companyId } = security.user;

  try {
    const { id } = await params;
    const body = await request.json();

    // ────────────────────────────────────────────────────────────
    // 1. Fetch existing record for cross-tenant validation
    // ────────────────────────────────────────────────────────────
    const existing = await db.customer.findUnique({
      where: { id },
      select: {
        customerCode: true,
        name: true,
        phone: true,
        alternativePhone: true,
        email: true,
        nidNumber: true,
        companyId: true,
        isActive: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // ────────────────────────────────────────────────────────────
    // 2. Image validation
    // ────────────────────────────────────────────────────────────
    const imgError = validateImageFields(body, ['profileImage', 'nidFrontImage', 'nidBackImage']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });

    // ────────────────────────────────────────────────────────────
    // 3. SR role: cannot modify creditLimit — strip it from payload
    // ────────────────────────────────────────────────────────────
    if (role === 'sr' && 'creditLimit' in body) {
      delete body.creditLimit;
    }

    // ────────────────────────────────────────────────────────────
    // 4. Sanitize collision-shielded fields
    // ────────────────────────────────────────────────────────────
    const sanitizedPhone = nullIfEmpty(body.phone as string | null | undefined);
    const sanitizedAlternativePhone = nullIfEmpty(body.alternativePhone as string | null | undefined);
    const sanitizedEmail = nullIfEmpty(body.email as string | null | undefined);
    const sanitizedNidNumber = nullIfEmpty(body.nidNumber as string | null | undefined);

    // ────────────────────────────────────────────────────────────
    // 5. Multi-tenant collision shields (excluding current record)
    // ────────────────────────────────────────────────────────────
    const effectiveCompanyId = companyId || existing.companyId;

    if (effectiveCompanyId) {
      if (sanitizedPhone && sanitizedPhone !== existing.phone) {
        const phoneCollision = await db.customer.findFirst({
          where: {
            companyId: effectiveCompanyId,
            phone: sanitizedPhone,
            isActive: true,
            id: { not: id },
          },
        });
        if (phoneCollision) {
          return NextResponse.json(
            { error: 'Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.' },
            { status: 409 }
          );
        }
      }

      if (sanitizedAlternativePhone && sanitizedAlternativePhone !== existing.alternativePhone) {
        const altPhoneCollision = await db.customer.findFirst({
          where: {
            companyId: effectiveCompanyId,
            alternativePhone: sanitizedAlternativePhone,
            isActive: true,
            id: { not: id },
          },
        });
        if (altPhoneCollision) {
          return NextResponse.json(
            { error: 'Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.' },
            { status: 409 }
          );
        }
      }

      if (sanitizedEmail && sanitizedEmail !== existing.email) {
        const emailCollision = await db.customer.findFirst({
          where: {
            companyId: effectiveCompanyId,
            email: sanitizedEmail,
            isActive: true,
            id: { not: id },
          },
        });
        if (emailCollision) {
          return NextResponse.json(
            { error: 'Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.' },
            { status: 409 }
          );
        }
      }

      if (sanitizedNidNumber && sanitizedNidNumber !== existing.nidNumber) {
        const nidCollision = await db.customer.findFirst({
          where: {
            companyId: effectiveCompanyId,
            nidNumber: sanitizedNidNumber,
            isActive: true,
            id: { not: id },
          },
        });
        if (nidCollision) {
          return NextResponse.json(
            { error: 'Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.' },
            { status: 409 }
          );
        }
      }
    }

    // ────────────────────────────────────────────────────────────
    // 6. Validate opening balance if provided
    // ────────────────────────────────────────────────────────────
    let openingBalance: number | undefined;
    let openingBalanceType: 'Dr' | 'Cr' | undefined;

    if (body.openingBalance !== undefined) {
      const obValidation = validateOpeningBalance(body.openingBalance);
      if (!obValidation.valid) {
        return NextResponse.json({ error: obValidation.error }, { status: 400 });
      }
      openingBalance = obValidation.amount;
    }

    if (body.openingBalanceType !== undefined) {
      openingBalanceType = mapOpeningBalanceType(body.openingBalanceType as string | undefined);
    }

    // ────────────────────────────────────────────────────────────
    // 7. Validate credit limit if provided
    // ────────────────────────────────────────────────────────────
    let creditLimit: number | undefined;
    if (body.creditLimit !== undefined) {
      const clStr = String(body.creditLimit).trim();
      if (clStr !== '' && !/^\d+(\.\d+)?$/.test(clStr)) {
        return NextResponse.json({ error: 'Credit Limit must be a non-negative number.' }, { status: 400 });
      }
      creditLimit = clStr === '' ? 0 : safeFinancialRound(parseFloat(clStr));
    }

    // ────────────────────────────────────────────────────────────
    // 8. Build update data — only include fields that are provided
    // ────────────────────────────────────────────────────────────
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const sanitizedName = sanitizeString(String(body.name));
      if (!sanitizedName) {
        return NextResponse.json({ error: 'Customer name is required.' }, { status: 400 });
      }
      updateData.name = sanitizedName;
    }

    if (body.phone !== undefined) updateData.phone = sanitizedPhone;
    if (body.alternativePhone !== undefined) updateData.alternativePhone = sanitizedAlternativePhone;
    if (body.email !== undefined) updateData.email = sanitizedEmail;
    if (body.nidNumber !== undefined) updateData.nidNumber = sanitizedNidNumber;
    if (body.address !== undefined) updateData.address = nullIfEmpty(body.address as string | null | undefined);
    if (body.area !== undefined) updateData.area = nullIfEmpty(body.area as string | null | undefined);
    if (body.reference !== undefined) updateData.reference = nullIfEmpty(body.reference as string | null | undefined);
    if (openingBalance !== undefined) updateData.openingBalance = openingBalance;
    if (openingBalanceType !== undefined) updateData.openingBalanceType = openingBalanceType;
    if (creditLimit !== undefined) updateData.creditLimit = creditLimit;
    if (body.customerType !== undefined) updateData.customerType = String(body.customerType);
    if (body.profileImage !== undefined) updateData.profileImage = nullIfEmpty(body.profileImage as string | null | undefined);
    if (body.nidFrontImage !== undefined) updateData.nidFrontImage = nullIfEmpty(body.nidFrontImage as string | null | undefined);
    if (body.nidBackImage !== undefined) updateData.nidBackImage = nullIfEmpty(body.nidBackImage as string | null | undefined);
    if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive);

    // customerCode is immutable — do not allow changing it
    // companyId is set at creation time — do not allow changing it via PUT

    // ────────────────────────────────────────────────────────────
    // 9. Execute update within transaction
    // ────────────────────────────────────────────────────────────
    const result = await db.$transaction(async (tx) => {
      const record = await tx.customer.update({
        where: { id },
        data: updateData,
        include: {
          _count: { select: { salesOrders: true, hireSales: true, cashCollections: true, orderSheets: true } },
          coaAccount: true,
        },
      });

      return record;
    });

    // ────────────────────────────────────────────────────────────
    // 10. Activity log — module token: CRM-Profiles-Core
    // ────────────────────────────────────────────────────────────
    await logUserActivity({
      action: 'UPDATE',
      module: 'CRM-Profiles-Core',
      recordId: result.id,
      recordLabel: `${result.customerCode} - ${result.name}`,
      userId,
      userName,
      details: JSON.stringify({
        customerCode: result.customerCode,
        name: result.name,
        updatedFields: Object.keys(updateData),
      }),
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error updating customer:', error);
    const message = error instanceof Error ? error.message : 'Failed to update customer';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────
// DELETE /api/customers/[id] — Soft delete (isActive=false)
// Only admin can delete (checkFinancialDeletePermission)
// ────────────────────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Customers', 'DELETE');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, role, companyId } = security.user;

  // Admin-only delete enforcement
  const deleteCheck = checkFinancialDeletePermission(role);
  if (deleteCheck) return deleteCheck;

  try {
    const { id } = await params;

    // Fetch existing record for cross-tenant validation
    const existing = await db.customer.findUnique({
      where: { id },
      select: {
        customerCode: true,
        name: true,
        isActive: true,
        companyId: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json({ error: 'Customer is already deleted' }, { status: 400 });
    }

    // Soft delete within transaction
    await db.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id },
        data: { isActive: false },
      });

      // Activity log — module token: CRM-Profiles-Core
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'CRM-Profiles-Core',
          recordId: id,
          recordLabel: `${existing.customerCode} - ${existing.name}`,
          userId,
          userName,
          details: JSON.stringify({
            customerCode: existing.customerCode,
            name: existing.name,
            softDelete: true,
          }),
        },
      });
    });

    return NextResponse.json({ message: 'Customer deleted successfully' });
  } catch (error: unknown) {
    console.error('Error deleting customer:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete customer';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
