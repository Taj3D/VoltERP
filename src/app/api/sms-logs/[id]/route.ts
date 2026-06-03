// ============================================================
// SMS LOGS [id] API ROUTE — Stage 11 Rebuild
// Multi-tenant companyId isolation, RBAC, VAT Auditor masking,
// SMS character computation, Activity logging with module tokens
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskForVatAuditorSms,
  computeSmsSegments,
  safeFinancialRound,
  formatFinancialField,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Helper: convert empty string to null
function nullIfEmpty(val: string | undefined | null): string | null {
  if (val === undefined || val === null || val.trim() === '') return null;
  return val;
}

// GET /api/sms-logs/[id] — Get single SMS log
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsLogs', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const item = await db.smsLog.findUnique({ where: { id } });
    if (!item) {
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
        gatewayResponse: formatFinancialField(item.gatewayResponse),
        campaignName: formatFinancialField(item.campaignName),
      },
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsLogs] GET [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SMS log' },
      { status: 500 }
    );
  }
}

// PUT /api/sms-logs/[id] — Update SMS log (status updates, gateway response)
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
    const existing = await db.smsLog.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // If message is being updated, recompute segments and cost
    let charCount = existing.charCount;
    let isUnicode = existing.isUnicode;
    let segmentCount = existing.smsSegmentCount;
    let cost = existing.cost;
    const newMessage = body.message !== undefined ? body.message : existing.message;

    if (body.message !== undefined && body.message !== existing.message) {
      const computed = computeSmsSegments(newMessage);
      charCount = computed.charCount;
      isUnicode = computed.isUnicode;
      segmentCount = computed.segmentCount;

      // Recompute cost using tenant's active SmsSetting
      const activeSetting = await db.smsSetting.findFirst({
        where: {
          isActive: true,
          ...(companyId ? { companyId } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
      if (activeSetting) {
        const applicableRate = isUnicode ? activeSetting.unicodeRate : activeSetting.ratePerSms;
        cost = safeFinancialRound(segmentCount * applicableRate);
      }
    } else if (body.cost !== undefined) {
      cost = safeFinancialRound(Number(body.cost) || 0);
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.smsLog.update({
        where: { id },
        data: {
          recipient: body.recipient !== undefined ? body.recipient : existing.recipient,
          message: newMessage,
          charCount,
          smsSegmentCount: segmentCount,
          isUnicode,
          status: body.status !== undefined ? body.status : existing.status,
          gatewayResponse: body.gatewayResponse !== undefined ? nullIfEmpty(body.gatewayResponse) : existing.gatewayResponse,
          sentAt: body.sentAt !== undefined ? new Date(body.sentAt) : existing.sentAt,
          cost,
          campaignName: body.campaignName !== undefined ? nullIfEmpty(body.campaignName) : existing.campaignName,
          isActive: body.isActive !== undefined ? body.isActive : existing.isActive,
        },
      });

      // Activity log with SMS-Gateway-Dispatch module token
      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'SMS-Gateway-Dispatch',
        recordId: record.id,
        recordLabel: record.recipient || record.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          recipient: record.recipient,
          status: record.status,
          charCount,
          isUnicode,
          segmentCount,
          cost: record.cost,
        }),
      });

      return record;
    });

    // Apply VAT Auditor masking on response
    const masked = maskForVatAuditorSms(
      {
        ...item,
        gatewayResponse: formatFinancialField(item.gatewayResponse),
        campaignName: formatFinancialField(item.campaignName),
      },
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsLogs] PUT [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update SMS log' },
      { status: 500 }
    );
  }
}

// DELETE /api/sms-logs/[id] — Soft delete SMS log
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsLogs', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    await db.$transaction(async (tx) => {
      const record = await tx.smsLog.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // Cross-tenant validation
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Forbidden');
      }

      // Soft delete
      await tx.smsLog.update({
        where: { id },
        data: { isActive: false },
      });

      // Activity log with SMS-Gateway-Dispatch module token
      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'SMS-Gateway-Dispatch',
        recordId: record.id,
        recordLabel: record.recipient || record.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          recipient: record.recipient,
          softDelete: true,
        }),
      });

      return record;
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('[SmsLogs] DELETE [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete SMS log' },
      { status: 500 }
    );
  }
}
