// ============================================================
// SMS INBOX API ROUTE
// Multi-tenant companyId isolation, RBAC, VAT Auditor masking,
// Activity logging with SMS-Inbox-Tracker module token
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskSmsArray,
  computeSmsSegments,
  formatFinancialField,
  stripHtml,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Valid status values
const VALID_STATUSES = ['Unread', 'Read', 'Archived', 'Flagged'] as const;

// Valid priority values
const VALID_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;

// Valid category values
const VALID_CATEGORIES = ['CustomerReply', 'SupplierNotice', 'SystemAlert', 'Spam', 'OptOut'] as const;

// Helper: auto-generate code INB-XXXXX (collision-safe: findMany + Math.max)
async function generateInboxCode(): Promise<string> {
  const allRecords = await db.smsInbox.findMany({ select: { code: true } });
  let maxNum = 0;
  for (const r of allRecords) {
    const match = r.code?.match(/INB-(\d+)/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  return `INB-${String(maxNum + 1).padStart(5, '0')}`;
}

// Helper: convert empty string to null
function nullIfEmpty(val: string | undefined | null): string | null {
  if (val === undefined || val === null || val.trim() === '') return null;
  return val;
}

// GET /api/sms-inbox — List all inbox messages for current tenant
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsInbox', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;
    const { searchParams } = new URL(request.url);

    const where: Record<string, unknown> = { isActive: true };
    if (companyId) {
      where.companyId = companyId;
    }

    // Optional filters
    const status = searchParams.get('status');
    if (status && VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      where.status = status;
    }

    const priority = searchParams.get('priority');
    if (priority && VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number])) {
      where.priority = priority;
    }

    const category = searchParams.get('category');
    if (category && VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
      where.category = category;
    }

    // Date range filters
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    if (dateFrom || dateTo) {
      const receivedAt: Record<string, Date> = {};
      if (dateFrom) receivedAt.gte = new Date(dateFrom);
      if (dateTo) receivedAt.lte = new Date(dateTo);
      where.receivedAt = receivedAt;
    }

    // Fetch inbox messages ordered by receivedAt desc
    const items = await db.smsInbox.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
    });

    // Compute unread count summary
    const unreadCount = items.filter((item) => item.status === 'Unread').length;
    const totalCount = items.length;
    const flaggedCount = items.filter((item) => item.status === 'Flagged').length;
    const highPriorityCount = items.filter((item) => item.priority === 'High' || item.priority === 'Urgent').length;

    // Apply VAT Auditor masking + format empty fields
    const masked = maskSmsArray(
      items.map((item) => ({
        ...item,
        relatedModule: formatFinancialField(item.relatedModule),
        relatedCode: formatFinancialField(item.relatedCode),
        tags: formatFinancialField(item.tags),
        notes: formatFinancialField(item.notes),
      })),
      security.user.role
    );

    return NextResponse.json({
      items: masked,
      summary: {
        total: totalCount,
        unread: unreadCount,
        flagged: flaggedCount,
        highPriority: highPriorityCount,
      },
    });
  } catch (error) {
    console.error('[SmsInbox] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch inbox messages' },
      { status: 500 }
    );
  }
}

// POST /api/sms-inbox — Create inbox message (simulates incoming SMS)
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsInbox', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    // Validate required fields
    const { sender, message } = body;
    if (!sender || typeof sender !== 'string' || sender.trim() === '') {
      return NextResponse.json(
        { error: 'Missing required field: sender' },
        { status: 400 }
      );
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json(
        { error: 'Missing required field: message' },
        { status: 400 }
      );
    }

    // Compute character count and Unicode detection
    const { charCount, isUnicode } = computeSmsSegments(message);

    // Validate status if provided
    const status = body.status || 'Unread';
    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate priority if provided
    const priority = body.priority || 'Normal';
    if (!VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number])) {
      return NextResponse.json(
        { error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate category if provided
    if (body.category && !VALID_CATEGORIES.includes(body.category as typeof VALID_CATEGORIES[number])) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 }
      );
    }

    // Auto-generate code
    const code = await generateInboxCode();

    const item = await db.$transaction(async (tx) => {
      const record = await tx.smsInbox.create({
        data: {
          code,
          sender: sender.trim(),
          message: message.trim(),
          charCount,
          isUnicode,
          status,
          priority,
          category: nullIfEmpty(body.category ? stripHtml(body.category) : undefined),
          relatedModule: nullIfEmpty(body.relatedModule ? stripHtml(body.relatedModule) : undefined),
          relatedId: nullIfEmpty(body.relatedId ? stripHtml(body.relatedId) : undefined),
          relatedCode: nullIfEmpty(body.relatedCode ? stripHtml(body.relatedCode) : undefined),
          receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
          tags: nullIfEmpty(body.tags ? stripHtml(body.tags) : undefined),
          notes: nullIfEmpty(body.notes ? stripHtml(body.notes) : undefined),
          ...(companyId && { companyId }),
        },
      });

      // Activity log with SMS-Inbox-Tracker module token
      await logUserActivity({
        tx,
        action: 'CREATE',
        module: 'SMS-Inbox-Tracker',
        recordId: record.id,
        recordLabel: record.code,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          code: record.code,
          sender: record.sender,
          charCount: record.charCount,
          isUnicode: record.isUnicode,
          status: record.status,
          priority: record.priority,
          category: record.category,
        }),
      });

      return record;
    });

    // Apply VAT Auditor masking
    const masked = maskSmsArray(
      [{
        ...item,
        relatedModule: formatFinancialField(item.relatedModule),
        relatedCode: formatFinancialField(item.relatedCode),
        tags: formatFinancialField(item.tags),
        notes: formatFinancialField(item.notes),
      }],
      security.user.role
    );

    return NextResponse.json(masked[0], { status: 201 });
  } catch (error) {
    console.error('[SmsInbox] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create inbox message' },
      { status: 500 }
    );
  }
}
