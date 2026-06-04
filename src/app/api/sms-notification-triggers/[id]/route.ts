// ============================================================
// SMS NOTIFICATION TRIGGERS [id] API ROUTE
// Multi-tenant companyId isolation, RBAC, VAT Auditor masking,
// Activity logging with SMS-Notification-Trigger module token
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskForVatAuditorSms,
  stripHtml,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Valid event types for notification triggers
const VALID_EVENT_TYPES = [
  'SalesConfirmation',
  'FinancialCollection',
  'InventoryIngestion',
  'HRLifecycle',
] as const;

// Valid recipient types
const VALID_RECIPIENT_TYPES = [
  'Customer',
  'Dealer',
  'Supplier',
  'Employee',
  'Custom',
] as const;

// Helper: convert empty string to null
function nullIfEmpty(val: string | undefined | null): string | null {
  if (val === undefined || val === null || val.trim() === '') return null;
  return val;
}

// GET /api/sms-notification-triggers/[id] — Get single notification trigger
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsLogs', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const item = await db.smsNotificationTrigger.findUnique({ where: { id } });
    if (!item || !item.isActive) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Apply VAT Auditor masking
    const masked = maskForVatAuditorSms(
      item as Record<string, unknown>,
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsNotificationTriggers] GET [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notification trigger' },
      { status: 500 }
    );
  }
}

// PUT /api/sms-notification-triggers/[id] — Update notification trigger
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsLogs', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const companyId = security.user.companyId;

    // Cross-tenant validation
    const existing = await db.smsNotificationTrigger.findUnique({ where: { id } });
    if (!existing || !existing.isActive) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Validate eventType if provided
    if (body.eventType !== undefined && !VALID_EVENT_TYPES.includes(body.eventType)) {
      return NextResponse.json(
        { error: `Invalid eventType. Must be one of: ${VALID_EVENT_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate recipientType if provided
    if (body.recipientType !== undefined && !VALID_RECIPIENT_TYPES.includes(body.recipientType)) {
      return NextResponse.json(
        { error: `Invalid recipientType. Must be one of: ${VALID_RECIPIENT_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate templateBody if provided — must not be empty
    if (body.templateBody !== undefined && (typeof body.templateBody !== 'string' || body.templateBody.trim() === '')) {
      return NextResponse.json(
        { error: 'templateBody cannot be empty.' },
        { status: 400 }
      );
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.smsNotificationTrigger.update({
        where: { id },
        data: {
          eventType: body.eventType !== undefined ? body.eventType : existing.eventType,
          label: body.label !== undefined ? stripHtml(body.label.trim()) : existing.label,
          description: body.description !== undefined ? nullIfEmpty(stripHtml(body.description)) : existing.description,
          isEnabled: body.isEnabled !== undefined ? Boolean(body.isEnabled) : existing.isEnabled,
          recipientType: body.recipientType !== undefined ? body.recipientType : existing.recipientType,
          templateBody: body.templateBody !== undefined ? stripHtml(body.templateBody.trim()) : existing.templateBody,
        },
      });

      // Activity log with SMS-Notification-Trigger module token
      await logUserActivity({
        tx,
        action: 'UPDATE',
        module: 'SMS-Notification-Trigger',
        recordId: record.id,
        recordLabel: record.code,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          code: record.code,
          eventType: record.eventType,
          label: record.label,
          isEnabled: record.isEnabled,
          recipientType: record.recipientType,
          updatedFields: Object.keys(body),
        }),
      });

      return record;
    });

    // Apply VAT Auditor masking
    const masked = maskForVatAuditorSms(
      item as Record<string, unknown>,
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsNotificationTriggers] PUT [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update notification trigger' },
      { status: 500 }
    );
  }
}

// DELETE /api/sms-notification-triggers/[id] — Soft delete (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsLogs', 'DELETE');
  if (!security.authorized) return security.response;

  // Admin only for delete
  if (security.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Delete access denied. Only Administrators can delete notification triggers.' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    await db.$transaction(async (tx) => {
      const record = await tx.smsNotificationTrigger.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');
      if (!record.isActive) throw new Error('Already deleted');

      // Cross-tenant validation
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Forbidden');
      }

      // Soft delete
      await tx.smsNotificationTrigger.update({
        where: { id },
        data: { isActive: false },
      });

      // Activity log with SMS-Notification-Trigger module token
      await logUserActivity({
        tx,
        action: 'DELETE',
        module: 'SMS-Notification-Trigger',
        recordId: record.id,
        recordLabel: record.code,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          code: record.code,
          eventType: record.eventType,
          label: record.label,
          softDelete: true,
        }),
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (error instanceof Error && error.message === 'Already deleted') {
      return NextResponse.json({ error: 'Already deleted' }, { status: 410 });
    }
    console.error('[SmsNotificationTriggers] DELETE [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete notification trigger' },
      { status: 500 }
    );
  }
}
