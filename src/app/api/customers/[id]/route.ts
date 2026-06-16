import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor, validateImageFields } from '@/lib/api-security';
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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Customers', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.customer.findUnique({
      where: { id },
      include: {
        _count: { select: { salesOrders: true, hireSales: true, cashCollections: true, orderSheets: true } },
      },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Cross-tenant validation
    if (security.user.companyId && item.companyId && item.companyId !== security.user.companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const masked = security.user.role === 'vat_auditor'
      ? maskForVatAuditor(item, security.user.role, ['openingBalance', 'creditLimit'])
      : security.user.role === 'sr'
        ? maskForVatAuditor(item, security.user.role, ['creditLimit'], { creditLimit: ['sr'] })
        : item;

    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Customers', 'PUT');
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
      const duplicate = await db.customer.findFirst({
        where: { name: { contains: normalizedName }, isActive: true, id: { not: id } },
      });
      if (duplicate && duplicate.name.trim().toLowerCase() === normalizedName) {
        return NextResponse.json(
          { error: `Corporate Entity Collision: Customer name "${body.name.trim()}" already exists (case-insensitive match).` },
          { status: 400 }
        );
      }
    }

    // SR role cannot modify creditLimit — strip it from the payload server-side
    if (security.user.role === 'sr' && 'creditLimit' in body) {
      delete body.creditLimit;
    }

    const item = await db.$transaction(async (tx) => {
      // Cross-tenant validation
      const existing = await tx.customer.findUnique({ where: { id } });
      if (!existing) throw new Error('Not found');
      if (security.user.companyId && existing.companyId && existing.companyId !== security.user.companyId) {
        throw new Error('Not found');
      }

      // Build update data — only include fields that are provided
      const updateData: Record<string, any> = {};
      if (body.name !== undefined) updateData.name = stripHtml(String(body.name));
      if (body.phone !== undefined) updateData.phone = body.phone ? stripHtml(String(body.phone)) : null;
      if (body.email !== undefined) updateData.email = body.email ? stripHtml(String(body.email)).toLowerCase() : null;
      if (body.address !== undefined) updateData.address = body.address ? stripHtml(String(body.address)) : null;
      if (body.area !== undefined) updateData.area = body.area ? stripHtml(String(body.area)) : null;
      if (body.reference !== undefined) updateData.reference = body.reference ? stripHtml(String(body.reference)) : null;
      if (body.openingBalance !== undefined) updateData.openingBalance = Number(body.openingBalance);
      if (body.openingBalanceType !== undefined) updateData.openingBalanceType = body.openingBalanceType;
      if (body.customerType !== undefined) updateData.customerType = body.customerType;
      if (body.profileImage !== undefined) updateData.profileImage = body.profileImage || null;
      if (body.nidFrontImage !== undefined) updateData.nidFrontImage = body.nidFrontImage || null;
      if (body.nidBackImage !== undefined) updateData.nidBackImage = body.nidBackImage || null;
      if (body.nidNumber !== undefined) updateData.nidNumber = body.nidNumber ? stripHtml(String(body.nidNumber)) : null;
      if (body.creditStatus !== undefined) updateData.creditStatus = body.creditStatus;
      if (body.guarantorName !== undefined) updateData.guarantorName = body.guarantorName ? stripHtml(String(body.guarantorName)) : null;
      if (body.guarantorContact !== undefined) updateData.guarantorContact = body.guarantorContact ? stripHtml(String(body.guarantorContact)) : null;
      if (body.guarantorAddress !== undefined) updateData.guarantorAddress = body.guarantorAddress ? stripHtml(String(body.guarantorAddress)) : null;
      if (body.guarantorFatherName !== undefined) updateData.guarantorFatherName = body.guarantorFatherName ? stripHtml(String(body.guarantorFatherName)) : null;
      if (body.isActive !== undefined) updateData.isActive = body.isActive;

      // Only update creditLimit if provided in body (preserves existing value when SR edits)
      if (body.creditLimit !== undefined) {
        updateData.creditLimit = Number(body.creditLimit);
      }

      const record = await tx.customer.update({
        where: { id },
        data: updateData,
        include: {
          _count: { select: { salesOrders: true, hireSales: true, cashCollections: true, orderSheets: true } },
        },
      });

      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'Customers',
        recordId: record.id,
        recordLabel: `${record.customerCode} - ${record.name}`,
        userId: security.user?.id || 'system',
        userName: security.user?.name || 'System',
        details: JSON.stringify({ customerCode: record.customerCode, name: record.name }),
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
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Customers', 'DELETE');
  if (!security.authorized) return security.response;

  // Only admin/manager can delete customers
  if (security.user.role !== 'admin' && security.user.role !== 'manager') {
    return NextResponse.json(
      { error: 'Delete access denied. Only administrators and managers can delete customer records.' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      const record = await tx.customer.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // Cross-tenant validation
      if (security.user.companyId && record.companyId && record.companyId !== security.user.companyId) {
        throw new Error('Not found');
      }

      if (!record.isActive) {
        throw new Error('Customer is already deleted');
      }

      // FK integrity check: active sales orders
      const activeSalesOrders = await tx.salesOrder.count({
        where: { customerId: id, status: { not: 'Cancelled' }, isActive: true },
      });
      if (activeSalesOrders > 0) {
        throw new Error(`Cannot delete: Customer is referenced by ${activeSalesOrders} active sales order(s)`);
      }

      // FK integrity check: active hire sales
      const activeHireSales = await tx.hireSales.count({
        where: { customerId: id, status: { not: 'Cancelled' }, isActive: true },
      });
      if (activeHireSales > 0) {
        throw new Error(`Cannot delete: Customer is referenced by ${activeHireSales} active hire sale(s)`);
      }

      // Soft delete the customer
      await tx.customer.update({ where: { id }, data: { isActive: false } });

      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'Customers',
        recordId: record.id,
        recordLabel: `${record.customerCode} - ${record.name}`,
        userId: security.user?.id || 'system',
        userName: security.user?.name || 'System',
        details: JSON.stringify({ customerCode: record.customerCode, name: record.name, softDelete: true }),
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
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
  }
}
