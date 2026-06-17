// ============================================================
// SMS NOTIFICATION TRIGGERS API ROUTE
// Multi-tenant companyId isolation, RBAC, VAT Auditor masking,
// Activity logging with SMS-Notification-Trigger module token
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskSmsArray,
  safeFinancialRound,
  stripHtml,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Valid event types for notification triggers
// Includes all 8 event types supported by the SMS auto-trigger engine
const VALID_EVENT_TYPES = [
  'SalesConfirmation',
  'FinancialCollection',
  'InventoryIngestion',
  'HRLifecycle',
  'PaymentReceived',
  'PurchaseOrderReceived',
  'EmployeeJoined',
  'EmployeeExamDate',
] as const;

// Valid recipient types
const VALID_RECIPIENT_TYPES = [
  'Customer',
  'Dealer',
  'Supplier',
  'Employee',
  'Custom',
] as const;

// Helper: auto-generate code SNT-XXXXX (collision-safe: findMany + Math.max)
async function generateTriggerCode(): Promise<string> {
  const allRecords = await db.smsNotificationTrigger.findMany({ select: { code: true } });
  let maxNum = 0;
  for (const r of allRecords) {
    const match = r.code?.match(/SNT-(\d+)/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  return `SNT-${String(maxNum + 1).padStart(5, '0')}`;
}

// Helper: convert empty string to null
function nullIfEmpty(val: string | undefined | null): string | null {
  if (val === undefined || val === null || val.trim() === '') return null;
  return val;
}

// GET /api/sms-notification-triggers — List all active notification triggers for current tenant
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsNotificationTriggers', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;
    const { searchParams } = new URL(request.url);

    const where: Record<string, unknown> = { isActive: true };
    if (companyId) {
      where.companyId = companyId;
    }

    // Optional filter by eventType
    const eventType = searchParams.get('eventType');
    if (eventType && VALID_EVENT_TYPES.includes(eventType as typeof VALID_EVENT_TYPES[number])) {
      where.eventType = eventType;
    }

    // Optional filter by isEnabled
    const isEnabledParam = searchParams.get('isEnabled');
    if (isEnabledParam !== null) {
      where.isEnabled = isEnabledParam === 'true';
    }

    // Optional filter by recipientType
    const recipientType = searchParams.get('recipientType');
    if (recipientType && VALID_RECIPIENT_TYPES.includes(recipientType as typeof VALID_RECIPIENT_TYPES[number])) {
      where.recipientType = recipientType;
    }

    const items = await db.smsNotificationTrigger.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor masking
    const masked = maskSmsArray(items as Record<string, unknown>[], security.user.role);

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsNotificationTriggers] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notification triggers' },
      { status: 500 }
    );
  }
}

// POST /api/sms-notification-triggers — Create notification trigger
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsNotificationTriggers', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    // Validate required fields
    const { eventType, label, templateBody } = body;

    if (!eventType) {
      return NextResponse.json(
        { error: 'Missing required field: eventType' },
        { status: 400 }
      );
    }

    if (!VALID_EVENT_TYPES.includes(eventType)) {
      return NextResponse.json(
        { error: `Invalid eventType. Must be one of: ${VALID_EVENT_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    if (!label || typeof label !== 'string' || label.trim() === '') {
      return NextResponse.json(
        { error: 'Missing required field: label' },
        { status: 400 }
      );
    }

    if (!templateBody || typeof templateBody !== 'string' || templateBody.trim() === '') {
      return NextResponse.json(
        { error: 'Missing required field: templateBody. SMS template cannot be empty.' },
        { status: 400 }
      );
    }

    // Validate recipientType if provided
    const recipientType = body.recipientType || 'Customer';
    if (!VALID_RECIPIENT_TYPES.includes(recipientType)) {
      return NextResponse.json(
        { error: `Invalid recipientType. Must be one of: ${VALID_RECIPIENT_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Auto-generate code
    const code = await generateTriggerCode();

    const item = await db.$transaction(async (tx) => {
      const record = await tx.smsNotificationTrigger.create({
        data: {
          code,
          eventType,
          label: label.trim(),
          description: nullIfEmpty(body.description ? stripHtml(body.description) : undefined),
          isEnabled: body.isEnabled !== undefined ? Boolean(body.isEnabled) : true,
          recipientType,
          templateBody: stripHtml(templateBody.trim()),
          ...(companyId && { companyId }),
        },
      });

      // Activity log with SMS-Notification-Trigger module token
      await logUserActivity({
        tx,
        action: 'CREATE',
        module: 'SMS-Notification-Trigger',
        recordId: record.id,
        recordLabel: record.code,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          code: record.code,
          eventType: record.eventType,
          label: record.label,
          recipientType: record.recipientType,
          isEnabled: record.isEnabled,
        }),
      });

      return record;
    });

    // Apply VAT Auditor masking
    const masked = maskSmsArray([item as Record<string, unknown>], security.user.role);

    return NextResponse.json(masked[0], { status: 201 });
  } catch (error) {
    console.error('[SmsNotificationTriggers] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create notification trigger' },
      { status: 500 }
    );
  }
}
