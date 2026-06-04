// ============================================================
// SMS SETTINGS API ROUTE — Stage 11 Rebuild
// Multi-tenant companyId isolation, RBAC, VAT Auditor masking,
// Activity logging with module tokens, safe financial arithmetic
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
  stripHtml,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Helper: convert empty string to null
function nullIfEmpty(val: string | undefined | null): string | null {
  if (val === undefined || val === null || val.trim() === '') return null;
  return val;
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
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsSettings', 'POST');
  if (!security.authorized) return security.response;

  // RBAC: Only admin can modify SMS gateway API keys/settings
  const writeDenied = checkSmsSettingsWritePermission(security.user.role);
  if (writeDenied) return writeDenied;

  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    // Validate required fields
    if (!body.apiUrl || !body.apiKey || !body.senderId) {
      return NextResponse.json(
        { error: 'Missing required fields: apiUrl, apiKey, senderId' },
        { status: 400 }
      );
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.smsSetting.create({
        data: {
          apiUrl: stripHtml(body.apiUrl),
          apiKey: body.apiKey, // API key: not stripped (may contain special chars)
          senderId: stripHtml(body.senderId),
          maskingName: nullIfEmpty(body.maskingName ? stripHtml(body.maskingName) : undefined),
          maskingRegId: nullIfEmpty(body.maskingRegId ? stripHtml(body.maskingRegId) : undefined),
          gatewayName: nullIfEmpty(body.gatewayName ? stripHtml(body.gatewayName) : undefined),
          ratePerSms: safeFinancialRound(Number(body.ratePerSms) || 0),
          unicodeRate: safeFinancialRound(Number(body.unicodeRate) || 0),
          setupCost: safeFinancialRound(Number(body.setupCost) || 0),
          isActive: body.isActive ?? true,
          ...(companyId && { companyId }),
        },
      });

      // Activity log with SMS-Gateway-Dispatch module token
      await logUserActivity({
          tx: tx,
        action: 'CREATE',
        module: 'SMS-Gateway-Dispatch',
        recordId: record.id,
        recordLabel: record.senderId || record.apiUrl || record.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          apiUrl: record.apiUrl,
          senderId: record.senderId,
          gatewayName: record.gatewayName,
          ratePerSms: record.ratePerSms,
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
