// ============================================================
// SMS SETTINGS API ROUTE — Block 12 (Domain 19) Audit Rewrite
// Multi-tenant companyId isolation, RBAC, VAT Auditor masking,
// Input field trim (Directive 1), credit balance fields,
// Activity logging with Comm-SMS-Marketing module token,
// safe financial arithmetic
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskSmsArray,
  maskForVatAuditorSms,
  checkSmsSettingsWritePermission,
  safeFinancialRound,
  formatFinancialField,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Helper: convert empty string to null, trim whitespace/line breaks (Directive 1)
function trimAndNullIfEmpty(val: string | undefined | null): string | null {
  if (val === undefined || val === null) return null;
  const trimmed = val.trim().replace(/[\r\n]+$/g, '');
  return trimmed === '' ? null : trimmed;
}

// Helper: trim string fields (Directive 1 — strip trailing spaces/line breaks)
function trimField(val: string | undefined | null): string {
  if (val === undefined || val === null) return '';
  return val.trim().replace(/[\r\n]+$/g, '');
}

// GET /api/sms-settings — List all active SMS settings for current tenant
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsSettings', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;
    const where: Record<string, unknown> = { isActive: true };
    if (companyId) {
      where.companyId = companyId;
    }

    const items = await db.smsSetting.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor masking
    const masked = maskSmsArray(
      items.map((item) => ({
        ...item,
        maskingName: formatFinancialField(item.maskingName),
        maskingRegId: formatFinancialField(item.maskingRegId),
        gatewayName: formatFinancialField(item.gatewayName),
      })),
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsSettings] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SMS settings' },
      { status: 500 }
    );
  }
}

// POST /api/sms-settings — Create SMS setting (admin only)
// Directive 1: All text fields are trimmed of trailing spaces/line breaks
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsSettings', 'POST');
  if (!security.authorized) return security.response;

  // RBAC: Only admin can modify SMS gateway API keys/settings
  const writeDenied = checkSmsSettingsWritePermission(security.user.role);
  if (writeDenied) return writeDenied;

  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    // Directive 1: Trim all input fields — strip trailing spaces/line breaks
    const apiUrl = trimField(body.apiUrl);
    const apiKey = trimField(body.apiKey);
    const senderId = trimField(body.senderId);
    const maskingName = trimAndNullIfEmpty(body.maskingName);
    const maskingRegId = trimAndNullIfEmpty(body.maskingRegId);
    const gatewayName = trimAndNullIfEmpty(body.gatewayName);

    // Validate required fields after trimming
    if (!apiUrl || !apiKey || !senderId) {
      return NextResponse.json(
        { error: 'Missing required fields: apiUrl, apiKey, senderId' },
        { status: 400 }
      );
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.smsSetting.create({
        data: {
          apiUrl,
          apiKey,
          senderId,
          maskingName,
          maskingRegId,
          gatewayName,
          ratePerSms: safeFinancialRound(Number(body.ratePerSms) || 0),
          unicodeRate: safeFinancialRound(Number(body.unicodeRate) || 0),
          setupCost: safeFinancialRound(Number(body.setupCost) || 0),
          creditBalanceLimit: safeFinancialRound(Number(body.creditBalanceLimit) || 0),
          lastKnownCreditBalance: safeFinancialRound(Number(body.lastKnownCreditBalance) || 0),
          isActive: body.isActive ?? true,
          ...(companyId && { companyId }),
        },
      });

      // Activity log with Comm-SMS-Marketing module token (Directive 4)
      await logUserActivity({
        action: 'CREATE',
        module: 'Comm-SMS-Marketing',
        recordId: record.id,
        recordLabel: record.senderId || record.apiUrl || record.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          apiUrl: record.apiUrl,
          senderId: record.senderId,
          gatewayName: record.gatewayName,
          ratePerSms: record.ratePerSms,
          creditBalanceLimit: record.creditBalanceLimit,
        }),
      });

      return record;
    });

    // Apply VAT Auditor masking on response
    const masked = maskForVatAuditorSms(
      {
        ...item,
        maskingName: formatFinancialField(item.maskingName),
        maskingRegId: formatFinancialField(item.maskingRegId),
        gatewayName: formatFinancialField(item.gatewayName),
      },
      security.user.role
    );

    return NextResponse.json(masked, { status: 201 });
  } catch (error) {
    console.error('[SmsSettings] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create SMS setting' },
      { status: 500 }
    );
  }
}
