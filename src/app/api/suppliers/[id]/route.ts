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

// GET /api/suppliers/[id] — Get single supplier with cross-tenant validation + VAT Auditor masking
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Suppliers', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const { id } = await params;
    const item = await db.supplier.findUnique({
      where: { id },
      include: {
        _count: { select: { purchaseOrders: true, purchaseReturns: true, cashDeliveries: true } },
        coaAccount: true,
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    // Cross-tenant validation: if user has a companyId, record must match
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    // VAT Auditor: mask openingBalance and creditLimit
    const masked = role === 'vat_auditor'
      ? maskForVatAuditor(item, role, ['openingBalance', 'creditLimit'])
      : item;

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching supplier:', error);
    return NextResponse.json({ error: 'Failed to fetch supplier' }, { status: 500 });
  }
}

// PUT /api/suppliers/[id] — Update supplier with cross-tenant validation, collision shields, sanitization
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Suppliers', 'PUT');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const { id } = await params;
    const body = await request.json();

    // ────────────────────────────────────────────────────────────
    // Pre-fetch existing record for cross-tenant validation
    // ────────────────────────────────────────────────────────────
    const existing = await db.supplier.findUnique({
      where: { id },
      select: {
        supplierCode: true,
        name: true,
        isActive: true,
        companyId: true,
        openingBalance: true,
        openingBalanceType: true,
        creditLimit: true,
        phone: true,
        alternativePhone: true,
        email: true,
        nidNumber: true,
        coaAccountId: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    // Image validation
    const imgError = validateImageFields(body, ['profileImage', 'nidFrontImage', 'nidBackImage']);
    if (imgError) {
      return NextResponse.json({ error: imgError }, { status: 400 });
    }

    // ────────────────────────────────────────────────────────────
    // Sanitize inputs
    // ────────────────────────────────────────────────────────────
    const sanitizedPhone = nullIfEmpty(body.phone as string | null | undefined);
    const sanitizedAltPhone = nullIfEmpty(body.alternativePhone as string | null | undefined);
    const sanitizedEmail = nullIfEmpty(body.email as string | null | undefined);
    const sanitizedNidNumber = nullIfEmpty(body.nidNumber as string | null | undefined);
    const sanitizedContactPerson = nullIfEmpty(body.contactPerson as string | null | undefined);
    const sanitizedAddress = nullIfEmpty(body.address as string | null | undefined);
    const sanitizedArea = nullIfEmpty(body.area as string | null | undefined);
    const sanitizedTerms = nullIfEmpty(body.terms as string | null | undefined);
    const sanitizedProfileImage = nullIfEmpty(body.profileImage as string | null | undefined);
    const sanitizedNidFrontImage = nullIfEmpty(body.nidFrontImage as string | null | undefined);
    const sanitizedNidBackImage = nullIfEmpty(body.nidBackImage as string | null | undefined);

    // ────────────────────────────────────────────────────────────
    // Opening Balance validation (if provided)
    // ────────────────────────────────────────────────────────────
    let openingBalance: number | undefined = undefined;
    let openingBalanceType: string | undefined = undefined;

    if (body.openingBalance !== undefined && body.openingBalance !== null) {
      const parsed = parseFloat(String(body.openingBalance));
      if (isNaN(parsed)) {
        return NextResponse.json(
          { error: 'Opening Balance must be a valid number' },
          { status: 400 }
        );
      }
      if (parsed < 0) {
        return NextResponse.json(
          { error: 'Opening Balance must not be negative. Use DUE/ADVANCE toggle to set direction.' },
          { status: 400 }
        );
      }
      openingBalance = safeFinancialRound(parsed);
    }

    // Direction toggle: DUE → "Cr", ADVANCE → "Dr"
    if (body.openingBalanceDirection) {
      const dir = String(body.openingBalanceDirection).toUpperCase();
      if (dir === 'DUE') openingBalanceType = 'Cr';
      else if (dir === 'ADVANCE') openingBalanceType = 'Dr';
    } else if (body.openingBalanceType) {
      const obType = String(body.openingBalanceType);
      if (obType === 'Cr' || obType === 'Dr') {
        openingBalanceType = obType;
      }
    }

    const creditLimit = body.creditLimit !== undefined && body.creditLimit !== null
      ? safeFinancialRound(Math.max(0, parseFloat(String(body.creditLimit))))
      : undefined;

    // ────────────────────────────────────────────────────────────
    // Collision shield checks for updated contact fields
    // ────────────────────────────────────────────────────────────
    const effectiveCompanyId = companyId || existing.companyId;

    if (effectiveCompanyId) {
      // Phone collision (only check if phone is being changed)
      if (sanitizedPhone !== undefined && sanitizedPhone !== existing.phone) {
        if (sanitizedPhone) {
          const phoneCollision = await db.supplier.findFirst({
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
      }

      // Alternative phone collision
      if (sanitizedAltPhone !== undefined && sanitizedAltPhone !== existing.alternativePhone) {
        if (sanitizedAltPhone) {
          const altPhoneCollision = await db.supplier.findFirst({
            where: {
              companyId: effectiveCompanyId,
              alternativePhone: sanitizedAltPhone,
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
      }

      // Email collision
      if (sanitizedEmail !== undefined && sanitizedEmail !== existing.email) {
        if (sanitizedEmail) {
          const emailCollision = await db.supplier.findFirst({
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
      }

      // NID number collision
      if (sanitizedNidNumber !== undefined && sanitizedNidNumber !== existing.nidNumber) {
        if (sanitizedNidNumber) {
          const nidCollision = await db.supplier.findFirst({
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
    }

    // ────────────────────────────────────────────────────────────
    // Update the supplier inside a transaction
    // ────────────────────────────────────────────────────────────
    const result = await db.$transaction(async (tx) => {
      // Re-check collisions inside transaction for consistency
      if (effectiveCompanyId) {
        if (sanitizedPhone && sanitizedPhone !== existing.phone) {
          const phoneCollision = await tx.supplier.findFirst({
            where: {
              companyId: effectiveCompanyId,
              phone: sanitizedPhone,
              isActive: true,
              id: { not: id },
            },
          });
          if (phoneCollision) {
            throw new Error('Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.');
          }
        }
        if (sanitizedAltPhone && sanitizedAltPhone !== existing.alternativePhone) {
          const altPhoneCollision = await tx.supplier.findFirst({
            where: {
              companyId: effectiveCompanyId,
              alternativePhone: sanitizedAltPhone,
              isActive: true,
              id: { not: id },
            },
          });
          if (altPhoneCollision) {
            throw new Error('Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.');
          }
        }
        if (sanitizedEmail && sanitizedEmail !== existing.email) {
          const emailCollision = await tx.supplier.findFirst({
            where: {
              companyId: effectiveCompanyId,
              email: sanitizedEmail,
              isActive: true,
              id: { not: id },
            },
          });
          if (emailCollision) {
            throw new Error('Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.');
          }
        }
        if (sanitizedNidNumber && sanitizedNidNumber !== existing.nidNumber) {
          const nidCollision = await tx.supplier.findFirst({
            where: {
              companyId: effectiveCompanyId,
              nidNumber: sanitizedNidNumber,
              isActive: true,
              id: { not: id },
            },
          });
          if (nidCollision) {
            throw new Error('Counterparty Collision: This Mobile Number or Identity is already registered under an active profile.');
          }
        }
      }

      // Build update data object — only include fields that are provided
      const updateData: Record<string, unknown> = {};

      if (body.name !== undefined) {
        updateData.name = sanitizeString(String(body.name));
      }
      if (body.supplierCode !== undefined) {
        updateData.supplierCode = sanitizeString(String(body.supplierCode));
      }
      if (body.contactPerson !== undefined) {
        updateData.contactPerson = sanitizedContactPerson;
      }
      if (body.phone !== undefined) {
        updateData.phone = sanitizedPhone;
      }
      if (body.alternativePhone !== undefined) {
        updateData.alternativePhone = sanitizedAltPhone;
      }
      if (body.email !== undefined) {
        updateData.email = sanitizedEmail;
      }
      if (body.address !== undefined) {
        updateData.address = sanitizedAddress;
      }
      if (body.area !== undefined) {
        updateData.area = sanitizedArea;
      }
      if (body.terms !== undefined) {
        updateData.terms = sanitizedTerms;
      }
      if (body.nidNumber !== undefined) {
        updateData.nidNumber = sanitizedNidNumber;
      }
      if (openingBalance !== undefined) {
        updateData.openingBalance = openingBalance;
      }
      if (openingBalanceType !== undefined) {
        updateData.openingBalanceType = openingBalanceType;
      }
      if (creditLimit !== undefined) {
        updateData.creditLimit = creditLimit;
      }
      if (body.profileImage !== undefined) {
        updateData.profileImage = sanitizedProfileImage;
      }
      if (body.nidFrontImage !== undefined) {
        updateData.nidFrontImage = sanitizedNidFrontImage;
      }
      if (body.nidBackImage !== undefined) {
        updateData.nidBackImage = sanitizedNidBackImage;
      }
      if (body.isActive !== undefined) {
        updateData.isActive = Boolean(body.isActive);
      }

      const record = await tx.supplier.update({
        where: { id },
        data: updateData,
        include: {
          _count: { select: { purchaseOrders: true, purchaseReturns: true, cashDeliveries: true } },
          coaAccount: true,
        },
      });

      return record;
    });

    // ────────────────────────────────────────────────────────────
    // AuditLog entry — module token: CRM-Profiles-Core
    // ────────────────────────────────────────────────────────────
    await logUserActivity({
      action: 'UPDATE',
      module: MODULE_TOKEN,
      recordId: id,
      recordLabel: `${existing.supplierCode} - ${existing.name}`,
      userId,
      userName,
      details: JSON.stringify({
        supplierCode: existing.supplierCode,
        previousPhone: existing.phone,
        previousEmail: existing.email,
        openingBalanceChanged: openingBalance !== undefined,
        creditLimitChanged: creditLimit !== undefined,
        companyId: effectiveCompanyId || null,
      }),
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error updating supplier:', error);
    const message = error instanceof Error ? error.message : 'Failed to update supplier';
    // Return 409 for collision errors
    if (message.includes('Counterparty Collision')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/suppliers/[id] — Soft delete (admin-only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Suppliers', 'DELETE');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, role, companyId } = security.user;

  // Admin-only delete enforcement
  const deleteCheck = checkFinancialDeletePermission(role);
  if (deleteCheck) return deleteCheck;

  try {
    const { id } = await params;

    // Pre-fetch existing record for cross-tenant validation
    const existing = await db.supplier.findUnique({
      where: { id },
      select: {
        supplierCode: true,
        name: true,
        isActive: true,
        companyId: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Supplier is already deleted' },
        { status: 400 }
      );
    }

    // Soft delete inside transaction
    await db.$transaction(async (tx) => {
      await tx.supplier.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: MODULE_TOKEN,
          recordId: id,
          recordLabel: `${existing.supplierCode} - ${existing.name}`,
          userId,
          userName,
          details: JSON.stringify({
            supplierCode: existing.supplierCode,
            name: existing.name,
            softDelete: true,
            companyId: existing.companyId,
          }),
        },
      });
    });

    return NextResponse.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    return NextResponse.json(
      { error: 'Failed to delete supplier' },
      { status: 500 }
    );
  }
}
