// ============================================================
// SMS SETTINGS [id] API ROUTE — Stage 11 Rebuild
// Multi-tenant companyId isolation, RBAC, VAT Auditor masking,
// Activity logging with module tokens, safe financial arithmetic
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

// Helper: convert empty string to null
function nullIfEmpty(val: string | undefined | null): string | null {
  if (val === undefined || val === null || val.trim() === '') return null;
  return val;
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

    // Cross-tenant validation
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

    // Cross-tenant validation
    const existing = await db.smsSetting.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.smsSetting.update({
        where: { id },
        data: {
          apiUrl: body.apiUrl !== undefined ? body.apiUrl : existing.apiUrl,
          apiKey: body.apiKey !== undefined ? body.apiKey : existing.apiKey,
          senderId: body.senderId !== undefined ? body.senderId : existing.senderId,
          maskingName: body.maskingName !== undefined ? nullIfEmpty(body.maskingName) : existing.maskingName,
          maskingRegId: body.maskingRegId !== undefined ? nullIfEmpty(body.maskingRegId) : existing.maskingRegId,
          gatewayName: body.gatewayName !== undefined ? nullIfEmpty(body.gatewayName) : existing.gatewayName,
          ratePerSms: body.ratePerSms !== undefined ? safeFinancialRound(Number(body.ratePerSms) || 0) : existing.ratePerSms,
          unicodeRate: body.unicodeRate !== undefined ? safeFinancialRound(Number(body.unicodeRate) || 0) : existing.unicodeRate,
          setupCost: body.setupCost !== undefined ? safeFinancialRound(Number(body.setupCost) || 0) : existing.setupCost,
          isActive: body.isActive !== undefined ? body.isActive : existing.isActive,
        },
      });

      // Activity log with SMS-Gateway-Dispatch module token
      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
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

      // Cross-tenant validation
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Forbidden');
      }

      // SmsSetting has no external FK references, safe to soft-delete
      await tx.smsSetting.update({
        where: { id },
        data: { isActive: false },
      });

      // Activity log with SMS-Gateway-Dispatch module token
      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'SMS-Gateway-Dispatch',
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
