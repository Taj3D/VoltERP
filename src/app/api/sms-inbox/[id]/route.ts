// ============================================================
// SMS INBOX [id] API ROUTE
// Multi-tenant companyId isolation, RBAC, VAT Auditor masking,
// Activity logging with SMS-Inbox-Tracker module token
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskForVatAuditorSms,
  formatFinancialField,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Valid status values
const VALID_STATUSES = ['Unread', 'Read', 'Archived', 'Flagged'] as const;

// Valid priority values
const VALID_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;

// Valid category values
const VALID_CATEGORIES = ['CustomerReply', 'SupplierNotice', 'SystemAlert', 'Spam', 'OptOut'] as const;

// Helper: convert empty string to null
function nullIfEmpty(val: string | undefined | null): string | null {
  if (val === undefined || val === null || val.trim() === '') return null;
  return val;
}

// GET /api/sms-inbox/[id] — Get single inbox message
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsLogs', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const item = await db.smsInbox.findUnique({ where: { id } });
    if (!item || !item.isActive) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Apply VAT Auditor masking
    const masked = maskForVatAuditorSms(
      {
        ...item,
        relatedModule: formatFinancialField(item.relatedModule),
        relatedCode: formatFinancialField(item.relatedCode),
        tags: formatFinancialField(item.tags),
        notes: formatFinancialField(item.notes),
      },
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsInbox] GET [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch inbox message' },
      { status: 500 }
    );
  }
}

// PUT /api/sms-inbox/[id] — Update inbox message
// Mark as read, change status/priority/category, add notes
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
    const existing = await db.smsInbox.findUnique({ where: { id } });
    if (!existing || !existing.isActive) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Validate status if provided
    if (body.status !== undefined && !VALID_STATUSES.includes(body.status as typeof VALID_STATUSES[number])) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate priority if provided
    if (body.priority !== undefined && !VALID_PRIORITIES.includes(body.priority as typeof VALID_PRIORITIES[number])) {
      return NextResponse.json(
        { error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate category if provided
    if (body.category !== undefined && body.category !== null && !VALID_CATEGORIES.includes(body.category as typeof VALID_CATEGORIES[number])) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 }
      );
    }

    // Determine new status
    const newStatus = body.status !== undefined ? body.status : existing.status;

    // When marking as Read, set readAt and readBy
    let readAt = existing.readAt;
    let readBy = existing.readBy;
    if (newStatus === 'Read' && existing.status !== 'Read') {
      readAt = new Date();
      readBy = security.user.id;
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.smsInbox.update({
        where: { id },
        data: {
          status: newStatus,
          priority: body.priority !== undefined ? body.priority : existing.priority,
          category: body.category !== undefined ? (body.category === null ? null : body.category) : existing.category,
          notes: body.notes !== undefined ? nullIfEmpty(body.notes) : existing.notes,
          tags: body.tags !== undefined ? nullIfEmpty(body.tags) : existing.tags,
          readAt,
          readBy,
        },
      });

      // Activity log with SMS-Inbox-Tracker module token
      await logUserActivity({
        tx,
        action: 'UPDATE',
        module: 'SMS-Inbox-Tracker',
        recordId: record.id,
        recordLabel: record.code,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          code: record.code,
          sender: record.sender,
          status: record.status,
          priority: record.priority,
          category: record.category,
          readAt: record.readAt,
          readBy: record.readBy,
          updatedFields: Object.keys(body),
        }),
      });

      return record;
    });

    // Apply VAT Auditor masking
    const masked = maskForVatAuditorSms(
      {
        ...item,
        relatedModule: formatFinancialField(item.relatedModule),
        relatedCode: formatFinancialField(item.relatedCode),
        tags: formatFinancialField(item.tags),
        notes: formatFinancialField(item.notes),
      },
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsInbox] PUT [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update inbox message' },
      { status: 500 }
    );
  }
}

// DELETE /api/sms-inbox/[id] — Soft delete (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsLogs', 'DELETE');
  if (!security.authorized) return security.response;

  // Admin only for delete
  if (security.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Delete access denied. Only Administrators can delete inbox messages.' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    await db.$transaction(async (tx) => {
      const record = await tx.smsInbox.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');
      if (!record.isActive) throw new Error('Already deleted');

      // Cross-tenant validation
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Forbidden');
      }

      // Soft delete
      await tx.smsInbox.update({
        where: { id },
        data: { isActive: false },
      });

      // Activity log with SMS-Inbox-Tracker module token
      await logUserActivity({
        tx,
        action: 'DELETE',
        module: 'SMS-Inbox-Tracker',
        recordId: record.id,
        recordLabel: record.code,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          code: record.code,
          sender: record.sender,
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
    console.error('[SmsInbox] DELETE [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete inbox message' },
      { status: 500 }
    );
  }
}
