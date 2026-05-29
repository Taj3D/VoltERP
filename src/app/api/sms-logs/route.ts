// ============================================================
// SMS LOGS API ROUTE — Stage 11 Rebuild
// Multi-tenant companyId isolation, RBAC, VAT Auditor masking,
// SMS character computation (computeSmsSegments), Activity logging
// with SMS-Gateway-Dispatch (single) / SMS-Campaign-Marketing (bulk)
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskSmsArray,
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

// GET /api/sms-logs — List all active SMS logs for current tenant
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsLogs', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;
    const where: Record<string, unknown> = { isActive: true };
    if (companyId) {
      where.companyId = companyId;
    }

    const items = await db.smsLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor masking + format empty fields
    const masked = maskSmsArray(
      items.map((item) => ({
        ...item,
        gatewayResponse: formatFinancialField(item.gatewayResponse),
        campaignName: formatFinancialField(item.campaignName),
      })),
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsLogs] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SMS logs' },
      { status: 500 }
    );
  }
}

// POST /api/sms-logs — Create SMS log (single or bulk)
// SR can dispatch individual SMS (not blocked by WRITE_DENY for SmsLogs)
// Bulk mode uses SMS-Campaign-Marketing module token
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsLogs', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    // Bulk mode: array of recipients with same message
    if (body.batchMode && Array.isArray(body.recipients)) {
      const message: string = body.message || '';
      const campaignName = nullIfEmpty(body.campaignName);

      if (!message || body.recipients.length === 0) {
        return NextResponse.json(
          { error: 'Missing required fields: message, recipients (non-empty array)' },
          { status: 400 }
        );
      }

      // Get tenant's active SmsSetting for rate calculation
      let ratePerSms = 0;
      let unicodeRate = 0;
      const activeSetting = await db.smsSetting.findFirst({
        where: {
          isActive: true,
          ...(companyId ? { companyId } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
      if (activeSetting) {
        ratePerSms = activeSetting.ratePerSms;
        unicodeRate = activeSetting.unicodeRate;
      }

      // Compute SMS segments
      const { charCount, isUnicode, segmentCount } = computeSmsSegments(message);
      const applicableRate = isUnicode ? unicodeRate : ratePerSms;
      const costPerRecipient = safeFinancialRound(segmentCount * applicableRate);

      const createdRecords = await db.$transaction(async (tx) => {
        const records = [];

        for (const recipient of body.recipients) {
          if (!recipient || typeof recipient !== 'string') continue;

          const record = await tx.smsLog.create({
            data: {
              recipient: recipient.trim(),
              message,
              charCount,
              smsSegmentCount: segmentCount,
              isUnicode,
              status: body.status || 'Pending',
              gatewayResponse: nullIfEmpty(body.gatewayResponse),
              sentAt: body.sentAt ? new Date(body.sentAt) : new Date(),
              cost: costPerRecipient,
              campaignName,
              isActive: body.isActive ?? true,
              ...(companyId && { companyId }),
            },
          });
          records.push(record);
        }

        // Activity log with SMS-Campaign-Marketing module token for bulk
        await logUserActivity({
          action: 'CREATE',
          module: 'SMS-Campaign-Marketing',
          recordId: 'BATCH',
          recordLabel: campaignName || `Bulk: ${records.length} recipients`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            batchMode: true,
            recipientCount: records.length,
            campaignName,
            charCount,
            isUnicode,
            segmentCount,
            costPerRecipient,
            totalCost: safeFinancialRound(records.length * costPerRecipient),
          }),
        });

        return records;
      });

      // Apply VAT Auditor masking
      const masked = maskSmsArray(
        createdRecords.map((item) => ({
          ...item,
          gatewayResponse: formatFinancialField(item.gatewayResponse),
          campaignName: formatFinancialField(item.campaignName),
        })),
        security.user.role
      );

      return NextResponse.json(masked, { status: 201 });
    }

    // Single SMS dispatch mode
    const { recipient, message } = body;
    if (!recipient || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: recipient, message' },
        { status: 400 }
      );
    }

    // Get tenant's active SmsSetting for rate calculation
    let ratePerSms = 0;
    let unicodeRate = 0;
    const activeSetting = await db.smsSetting.findFirst({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    if (activeSetting) {
      ratePerSms = activeSetting.ratePerSms;
      unicodeRate = activeSetting.unicodeRate;
    }

    // Compute SMS segments
    const { charCount, isUnicode, segmentCount } = computeSmsSegments(message);
    const applicableRate = isUnicode ? unicodeRate : ratePerSms;
    const cost = safeFinancialRound(segmentCount * applicableRate);

    const item = await db.$transaction(async (tx) => {
      const record = await tx.smsLog.create({
        data: {
          recipient,
          message,
          charCount,
          smsSegmentCount: segmentCount,
          isUnicode,
          status: body.status || 'Pending',
          gatewayResponse: nullIfEmpty(body.gatewayResponse),
          sentAt: body.sentAt ? new Date(body.sentAt) : new Date(),
          cost,
          campaignName: nullIfEmpty(body.campaignName),
          isActive: body.isActive ?? true,
          ...(companyId && { companyId }),
        },
      });

      // Activity log with SMS-Gateway-Dispatch module token for single dispatch
      await logUserActivity({
        action: 'CREATE',
        module: 'SMS-Gateway-Dispatch',
        recordId: record.id,
        recordLabel: record.recipient || record.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          recipient: record.recipient,
          charCount,
          isUnicode,
          segmentCount,
          cost: record.cost,
          status: record.status,
        }),
      });

      return record;
    });

    // Apply VAT Auditor masking on response
    const masked = maskSmsArray(
      [
        {
          ...item,
          gatewayResponse: formatFinancialField(item.gatewayResponse),
          campaignName: formatFinancialField(item.campaignName),
        },
      ],
      security.user.role
    );

    return NextResponse.json(masked[0], { status: 201 });
  } catch (error) {
    console.error('[SmsLogs] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create SMS log' },
      { status: 500 }
    );
  }
}
