// ============================================================
// Payment Options [id] API — Phase 7 Multi-Channel Payment Architecture
// Cross-tenant validation, Status toggle, Company-scoped unique name on rename
// Module Token: Sys-Ops-Channels
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// GET /api/payment-options/[id] — Get single payment option with cross-tenant validation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'PaymentOptions', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const item = await db.paymentOption.findUnique({ where: { id } });

    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation: if user has a companyId and the record has one, they must match
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching payment option:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment option' },
      { status: 500 }
    );
  }
}

// PUT /api/payment-options/[id] — Update with cross-tenant validation, status toggle, name unique check
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'PaymentOptions', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const body = await request.json();

    // Pre-fetch the existing record for cross-tenant validation
    const existing = await db.paymentOption.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // If changing name, check company-scoped unique constraint
    if (body.name && typeof body.name === 'string' && body.name.trim() !== existing.name) {
      const trimmedName = body.name.trim();
      const duplicate = await db.paymentOption.findFirst({
        where: {
          ...(companyId ? { companyId } : {}),
          name: trimmedName,
          isActive: true,
          id: { not: id }, // Exclude current record
        },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: `Payment option "${trimmedName}" already exists for this company` },
          { status: 409 }
        );
      }
    }

    // Validate status toggle: only ACTIVE or INACTIVE allowed
    if (body.status && !['ACTIVE', 'INACTIVE'].includes(body.status)) {
      return NextResponse.json(
        { error: 'Status must be either "ACTIVE" or "INACTIVE"' },
        { status: 400 }
      );
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.paymentOption.update({
        where: { id },
        data: {
          ...(body.name && { name: body.name.trim() }),
          ...(body.status && { status: body.status }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          // Enforce companyId — prevent cross-tenant reassignment
          ...(companyId && { companyId }),
        },
      });

      // Activity logging with module token Sys-Ops-Channels
      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'Sys-Ops-Channels',
        recordId: record.id,
        recordLabel: record.name,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          previousName: existing.name,
          previousStatus: existing.status,
          newName: record.name,
          newStatus: record.status,
          companyId,
        }),
      });

      return record;
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating payment option:', error);
    return NextResponse.json(
      { error: 'Failed to update payment option' },
      { status: 500 }
    );
  }
}

// DELETE /api/payment-options/[id] — Soft delete with FK checks, cross-tenant validation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'PaymentOptions', 'DELETE');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;

    // Pre-fetch for cross-tenant validation
    const existing = await db.paymentOption.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Payment option is already deleted' },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      // FK check: Check if payment option is referenced by active records
      const [
        activeCardTypeSetups,
        activeExpenses,
        activeIncomes,
        activeSalesOrders,
        activeCashCollections,
        activeCashDeliveries,
      ] = await Promise.all([
        tx.cardTypeSetup.count({ where: { paymentOptionId: id, isActive: true } }),
        tx.expense.count({ where: { paymentOptionId: id, isActive: true } }),
        tx.income.count({ where: { paymentOptionId: id, isActive: true } }),
        tx.salesOrder.count({ where: { paymentOptionId: id, isActive: true } }),
        tx.cashCollection.count({ where: { paymentOptionId: id, isActive: true } }),
        tx.cashDelivery.count({ where: { paymentOptionId: id, isActive: true } }),
      ]);

      const totalRefs =
        activeCardTypeSetups +
        activeExpenses +
        activeIncomes +
        activeSalesOrders +
        activeCashCollections +
        activeCashDeliveries;

      if (totalRefs > 0) {
        throw new Error(
          `Cannot delete: Payment Option is referenced by ${activeCardTypeSetups} card type setup(s), ${activeExpenses} expense(s), ${activeIncomes} income(s), ${activeSalesOrders} sales order(s), ${activeCashCollections} cash collection(s), ${activeCashDeliveries} cash deliver(y/ies)`
        );
      }

      // Soft delete
      await tx.paymentOption.update({
        where: { id },
        data: { isActive: false },
      });

      // Activity logging with module token Sys-Ops-Channels
      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'Sys-Ops-Channels',
        recordId: existing.id,
        recordLabel: existing.name,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          name: existing.name,
          status: existing.status,
          softDelete: true,
          companyId,
        }),
      });
    });

    return NextResponse.json({
      success: true,
      message: 'Payment option deleted successfully',
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error deleting payment option:', error);
    return NextResponse.json(
      { error: 'Failed to delete payment option' },
      { status: 500 }
    );
  }
}
