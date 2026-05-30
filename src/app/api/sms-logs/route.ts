// ============================================================
// SMS LOGS API ROUTE — Block 12 (Domain 19) Audit Rewrite
// Multi-tenant companyId isolation, RBAC, VAT Auditor masking,
// SMS character computation (computeSmsSegments),
// Campaign Balance Shield (Directive 2),
// Activity logging with Comm-SMS-Marketing module token (Directive 4)
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
  return val.trim().replace(/[\r\n]+$/g, '');
}

// GET /api/sms-logs — List all active SMS logs for current tenant
// Directive 1: Absolute multi-tenant isolation
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
// Directive 2: Campaign Balance Shield — block dispatch if insufficient credits
// Directive 4: Activity logging with Comm-SMS-Marketing module token
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsLogs', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    // Get tenant's active SmsSetting for rate calculation and credit check
    const activeSetting = await db.smsSetting.findFirst({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    let ratePerSms = 0;
    let unicodeRate = 0;
    let availableCredits = 0;
    if (activeSetting) {
      ratePerSms = activeSetting.ratePerSms;
      unicodeRate = activeSetting.unicodeRate;
      availableCredits = activeSetting.lastKnownCreditBalance || 0;
    }

    // ─────────────────────────────────────────────────────
    // BULK MODE: array of recipients with same message
    // ─────────────────────────────────────────────────────
    if (body.batchMode && Array.isArray(body.recipients)) {
      const message: string = body.message || '';
      const campaignName = nullIfEmpty(body.campaignName);

      if (!message || body.recipients.length === 0) {
        return NextResponse.json(
          { error: 'Missing required fields: message, recipients (non-empty array)' },
          { status: 400 }
        );
      }

      // Compute SMS segments (Directive 2 — GSM 03.38)
      const { charCount, isUnicode, segmentCount } = computeSmsSegments(message);
      const applicableRate = isUnicode ? unicodeRate : ratePerSms;
      const costPerRecipient = safeFinancialRound(segmentCount * applicableRate);
      const totalRequiredCredits = safeFinancialRound(body.recipients.length * costPerRecipient);

      // ─── Directive 2: Campaign Balance Shield ───
      // Block dispatch if Total Recipients × SMS Units > Available Gateway Credits
      if (availableCredits > 0 && totalRequiredCredits > availableCredits) {
        return NextResponse.json(
          {
            error: `Action Blocked: Insufficient SMS API credits to dispatch this campaign. Required: ${totalRequiredCredits.toFixed(2)}, Available: ${availableCredits.toFixed(2)}`,
            code: 'INSUFFICIENT_SMS_CREDITS',
            required: totalRequiredCredits,
            available: availableCredits,
          },
          { status: 400 }
        );
      }

      // Check creditBalanceLimit alert threshold
      if (activeSetting && activeSetting.creditBalanceLimit > 0) {
        const remainingAfter = availableCredits - totalRequiredCredits;
        if (remainingAfter < activeSetting.creditBalanceLimit) {
          // Allow dispatch but log warning (not blocking, just alert threshold)
          await logUserActivity({
            action: 'CREATE',
            module: 'Comm-SMS-Marketing',
            recordId: 'CREDIT-ALERT',
            recordLabel: `Credit Balance Alert: ${remainingAfter.toFixed(2)} BDT remaining after campaign`,
            userId: security.user.id,
            userName: security.user.name,
            details: JSON.stringify({
              alertType: 'CREDIT_BALANCE_LOW',
              remainingAfter,
              creditBalanceLimit: activeSetting.creditBalanceLimit,
              campaignName,
            }),
          });
        }
      }

      const createdRecords = await db.$transaction(async (tx) => {
        const records: any[] = [];

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

        // Update lastKnownCreditBalance on the active setting
        if (activeSetting && availableCredits > 0) {
          const newBalance = Math.max(0, availableCredits - totalRequiredCredits);
          await tx.smsSetting.update({
            where: { id: activeSetting.id },
            data: { lastKnownCreditBalance: safeFinancialRound(newBalance) },
          });
        }

        // Activity log with Comm-SMS-Marketing module token for bulk (Directive 4)
        await logUserActivity({
          action: 'CREATE',
          module: 'Comm-SMS-Marketing',
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
            creditsBefore: availableCredits,
            creditsAfter: Math.max(0, availableCredits - totalRequiredCredits),
          }),
        });

        return records;
      });

      // Apply VAT Auditor masking
      const masked = maskSmsArray(
        createdRecords.map((item: any) => ({
          ...item,
          gatewayResponse: formatFinancialField(item.gatewayResponse),
          campaignName: formatFinancialField(item.campaignName),
        })),
        security.user.role
      );

      return NextResponse.json(masked, { status: 201 });
    }

    // ─────────────────────────────────────────────────────
    // SINGLE SMS DISPATCH MODE
    // ─────────────────────────────────────────────────────
    const { recipient, message } = body;
    if (!recipient || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: recipient, message' },
        { status: 400 }
      );
    }

    // Compute SMS segments (Directive 2 — GSM 03.38)
    const { charCount, isUnicode, segmentCount } = computeSmsSegments(message);
    const applicableRate = isUnicode ? unicodeRate : ratePerSms;
    const cost = safeFinancialRound(segmentCount * applicableRate);

    // ─── Directive 2: Campaign Balance Shield (single) ───
    if (availableCredits > 0 && cost > availableCredits) {
      return NextResponse.json(
        {
          error: `Action Blocked: Insufficient SMS API credits to dispatch this message. Required: ${cost.toFixed(2)}, Available: ${availableCredits.toFixed(2)}`,
          code: 'INSUFFICIENT_SMS_CREDITS',
          required: cost,
          available: availableCredits,
        },
        { status: 400 }
      );
    }

    const item = await db.$transaction(async (tx) => {
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
          cost,
          campaignName: nullIfEmpty(body.campaignName),
          isActive: body.isActive ?? true,
          ...(companyId && { companyId }),
        },
      });

      // Update lastKnownCreditBalance on the active setting
      if (activeSetting && availableCredits > 0) {
        const newBalance = Math.max(0, availableCredits - cost);
        await tx.smsSetting.update({
          where: { id: activeSetting.id },
          data: { lastKnownCreditBalance: safeFinancialRound(newBalance) },
        });
      }

      // Activity log with Comm-SMS-Marketing module token for single dispatch (Directive 4)
      await logUserActivity({
        action: 'CREATE',
        module: 'Comm-SMS-Marketing',
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
          creditsBefore: availableCredits,
          creditsAfter: Math.max(0, availableCredits - cost),
        }),
      });

      return record;
    });

    // Apply VAT Auditor masking on response
    const masked = maskSmsArray(
      [
        {
          ...(item as any),
          gatewayResponse: formatFinancialField((item as any).gatewayResponse),
          campaignName: formatFinancialField((item as any).campaignName),
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
