// ============================================================
// SMS SETTINGS [id] API ROUTE — Block 12 (Domain 19) Audit Rewrite
// Multi-tenant companyId isolation, RBAC, VAT Auditor masking,
// Input field trim (Directive 1), credit balance fields,
// Activity logging with Comm-SMS-Marketing module token,
// safe financial arithmetic
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
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

// GET /api/sms-settings/[id] — Get single SMS setting
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsSettings', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const item = await db.smsSetting.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation (Directive 1 — absolute multi-tenant isolation)
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Apply VAT Auditor masking
    const masked = maskForVatAuditorSms(
      {
        ...item,
        maskingName: formatFinancialField(item.maskingName),
        maskingRegId: formatFinancialField(item.maskingRegId),
        gatewayName: formatFinancialField(item.gatewayName),
      },
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsSettings] GET [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SMS setting' },
      { status: 500 }
    );
  }
}

// PUT /api/sms-settings/[id] — Update SMS setting (admin only)
// Directive 1: All text fields are trimmed of trailing spaces/line breaks
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsSettings', 'PUT');
  if (!security.authorized) return security.response;

  // RBAC: Only admin can modify SMS gateway API keys/settings
  const writeDenied = checkSmsSettingsWritePermission(security.user.role);
  if (writeDenied) return writeDenied;

  try {
    const { id } = await params;
    const body = await request.json();
    const companyId = security.user.companyId;

    // Cross-tenant validation (Directive 1)
    const existing = await db.smsSetting.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Directive 1: Trim all string inputs — strip trailing spaces/line breaks
    const trimmedApiUrl = body.apiUrl !== undefined ? trimField(body.apiUrl) : existing.apiUrl;
    const trimmedApiKey = body.apiKey !== undefined ? trimField(body.apiKey) : existing.apiKey;
    const trimmedSenderId = body.senderId !== undefined ? trimField(body.senderId) : existing.senderId;

    const item = await db.$transaction(async (tx) => {
      const record = await tx.smsSetting.update({
        where: { id },
        data: {
          apiUrl: trimmedApiUrl,
          apiKey: trimmedApiKey,
          senderId: trimmedSenderId,
          maskingName: body.maskingName !== undefined ? trimAndNullIfEmpty(body.maskingName) : existing.maskingName,
          maskingRegId: body.maskingRegId !== undefined ? trimAndNullIfEmpty(body.maskingRegId) : existing.maskingRegId,
          gatewayName: body.gatewayName !== undefined ? trimAndNullIfEmpty(body.gatewayName) : existing.gatewayName,
          ratePerSms: body.ratePerSms !== undefined ? safeFinancialRound(Number(body.ratePerSms) || 0) : existing.ratePerSms,
          unicodeRate: body.unicodeRate !== undefined ? safeFinancialRound(Number(body.unicodeRate) || 0) : existing.unicodeRate,
          setupCost: body.setupCost !== undefined ? safeFinancialRound(Number(body.setupCost) || 0) : existing.setupCost,
          creditBalanceLimit: body.creditBalanceLimit !== undefined ? safeFinancialRound(Number(body.creditBalanceLimit) || 0) : existing.creditBalanceLimit,
          lastKnownCreditBalance: body.lastKnownCreditBalance !== undefined ? safeFinancialRound(Number(body.lastKnownCreditBalance) || 0) : existing.lastKnownCreditBalance,
          isActive: body.isActive !== undefined ? body.isActive : existing.isActive,
        },
      });

      // Activity log with Comm-SMS-Marketing module token (Directive 4)
      await logUserActivity({
        action: 'UPDATE',
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

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsSettings] PUT [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update SMS setting' },
      { status: 500 }
    );
  }
}

// DELETE /api/sms-settings/[id] — Soft delete SMS setting (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsSettings', 'DELETE');
  if (!security.authorized) return security.response;

  // RBAC: Only admin can delete SMS gateway settings
  const writeDenied = checkSmsSettingsWritePermission(security.user.role);
  if (writeDenied) return writeDenied;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    await db.$transaction(async (tx) => {
      const record = await tx.smsSetting.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // Cross-tenant validation (Directive 1)
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Forbidden');
      }

      // SmsSetting has no external FK references, safe to soft-delete
      await tx.smsSetting.update({
        where: { id },
        data: { isActive: false },
      });

      // Activity log with Comm-SMS-Marketing module token (Directive 4)
      await logUserActivity({
        action: 'DELETE',
        module: 'Comm-SMS-Marketing',
        recordId: record.id,
        recordLabel: record.senderId || record.apiUrl || record.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          apiUrl: record.apiUrl,
          senderId: record.senderId,
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
    console.error('[SmsSettings] DELETE [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete SMS setting' },
      { status: 500 }
    );
  }
}
