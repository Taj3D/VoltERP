import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor, validateImageFields } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Suppliers', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.supplier.findUnique({
      where: { id },
      include: {
        _count: { select: { purchaseOrders: true, purchaseReturns: true, cashDeliveries: true } },
      },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Cross-tenant validation
    if (security.user.companyId && item.companyId && item.companyId !== security.user.companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const masked = security.user.role === 'vat_auditor'
      ? maskForVatAuditor(item, security.user.role, ['openingBalance', 'creditLimit'])
      : item;

    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch supplier' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Suppliers', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const imgError = validateImageFields(body, ['profileImage', 'nidFrontImage', 'nidBackImage']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });

    // Phone/email validation
    if (body.phone?.trim() && !isValidPhone(body.phone.trim())) {
      return NextResponse.json({ error: 'Invalid phone format' }, { status: 400 });
    }
    if (body.email?.trim() && !isValidEmail(body.email.trim())) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Case-insensitive duplicate name check (exclude current record)
    if (body.name?.trim()) {
      const normalizedName = body.name.trim().toLowerCase();
      const duplicate = await db.supplier.findFirst({
        where: { name: { contains: normalizedName }, isActive: true, id: { not: id } },
      });
      if (duplicate && duplicate.name.trim().toLowerCase() === normalizedName) {
        return NextResponse.json(
          { error: `Corporate Entity Collision: Supplier name "${body.name.trim()}" already exists (case-insensitive match).` },
          { status: 400 }
        );
      }
    }

    const item = await db.$transaction(async (tx) => {
      // Cross-tenant validation
      const existing = await tx.supplier.findUnique({ where: { id } });
      if (!existing) throw new Error('Not found');
      if (security.user.companyId && existing.companyId && existing.companyId !== security.user.companyId) {
        throw new Error('Not found');
      }

      // Build update data — only include fields that are provided
      const updateData: Record<string, any> = {};
      if (body.name !== undefined) updateData.name = stripHtml(String(body.name));
      if (body.contactPerson !== undefined) updateData.contactPerson = body.contactPerson ? stripHtml(String(body.contactPerson)) : null;
      if (body.phone !== undefined) updateData.phone = body.phone ? stripHtml(String(body.phone)) : null;
      if (body.email !== undefined) updateData.email = body.email ? stripHtml(String(body.email)).toLowerCase() : null;
      if (body.address !== undefined) updateData.address = body.address ? stripHtml(String(body.address)) : null;
      if (body.area !== undefined) updateData.area = body.area ? stripHtml(String(body.area)) : null;
      if (body.terms !== undefined) updateData.terms = body.terms ? stripHtml(String(body.terms)) : null;
      if (body.openingBalance !== undefined) updateData.openingBalance = Number(body.openingBalance);
      if (body.openingBalanceType !== undefined) updateData.openingBalanceType = body.openingBalanceType;
      if (body.creditLimit !== undefined) updateData.creditLimit = Number(body.creditLimit);
      if (body.profileImage !== undefined) updateData.profileImage = body.profileImage || null;
      if (body.nidFrontImage !== undefined) updateData.nidFrontImage = body.nidFrontImage || null;
      if (body.nidBackImage !== undefined) updateData.nidBackImage = body.nidBackImage || null;
      if (body.nidNumber !== undefined) updateData.nidNumber = body.nidNumber ? stripHtml(String(body.nidNumber)) : null;
      if (body.logoUrl !== undefined) updateData.logoUrl = body.logoUrl ? stripHtml(String(body.logoUrl)) : null;
      if (body.isActive !== undefined) updateData.isActive = body.isActive;

      const record = await tx.supplier.update({
        where: { id },
        data: updateData,
        include: {
          _count: { select: { purchaseOrders: true, purchaseReturns: true, cashDeliveries: true } },
        },
      });

      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'Suppliers',
        recordId: record.id,
        recordLabel: `${record.supplierCode} - ${record.name}`,
        userId: security.user?.id || 'system',
        userName: security.user?.name || 'System',
        details: JSON.stringify({ supplierCode: record.supplierCode, name: record.name }),
      });

      return record;
    });
    return NextResponse.json(item);
  } catch (error: any) {
    if (error?.message === 'Not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (error?.message?.includes('Corporate Entity Collision')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update supplier' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Suppliers', 'DELETE');
  if (!security.authorized) return security.response;

  // Only admin/manager can delete suppliers
  if (security.user.role !== 'admin' && security.user.role !== 'manager') {
    return NextResponse.json(
      { error: 'Delete access denied. Only administrators and managers can delete supplier records.' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      const record = await tx.supplier.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // Cross-tenant validation
      if (security.user.companyId && record.companyId && record.companyId !== security.user.companyId) {
        throw new Error('Not found');
      }

      if (!record.isActive) {
        throw new Error('Supplier is already deleted');
      }

      // FK integrity check: active purchase orders
      const activePurchaseOrders = await tx.purchaseOrder.count({
        where: { supplierId: id, status: { not: 'Cancelled' }, isActive: true },
      });
      if (activePurchaseOrders > 0) {
        throw new Error(`Cannot delete: Supplier is referenced by ${activePurchaseOrders} active purchase order(s)`);
      }

      // Soft delete the supplier
      await tx.supplier.update({ where: { id }, data: { isActive: false } });

      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'Suppliers',
        recordId: record.id,
        recordLabel: `${record.supplierCode} - ${record.name}`,
        userId: security.user?.id || 'system',
        userName: security.user?.name || 'System',
        details: JSON.stringify({ supplierCode: record.supplierCode, name: record.name, softDelete: true }),
      });

      return record;
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message === 'Not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (error?.message?.startsWith('Cannot delete') || error?.message?.includes('already deleted')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to delete supplier' }, { status: 500 });
  }
}
