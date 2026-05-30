// ============================================================
// SMS GATEWAY BALANCE API ROUTE — Block 12 (Domain 19)
// Directive 2: Campaign Balance Shield — async pull of gateway credits
// Returns the last known credit balance for the tenant's active SMS gateway
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskForVatAuditorSms,
  safeFinancialRound,
} from '@/lib/api-security';

// GET /api/sms-gateway/balance — Get current SMS gateway credit balance
// Directive 1: Absolute multi-tenant isolation — only returns balance for current tenant's gateway
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsGateway', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;

    // Directive 1: Multi-tenant isolation — only fetch this tenant's active gateway
    const where: Record<string, unknown> = { isActive: true };
    if (companyId) {
      where.companyId = companyId;
    }

    const activeSetting = await db.smsSetting.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (!activeSetting) {
      return NextResponse.json({
        configured: false,
        creditBalance: 0,
        creditBalanceLimit: 0,
        gatewayName: null,
        senderId: null,
        isLowBalance: false,
      });
    }

    const creditBalance = safeFinancialRound(activeSetting.lastKnownCreditBalance || 0);
    const creditBalanceLimit = safeFinancialRound(activeSetting.creditBalanceLimit || 0);
    const isLowBalance = creditBalanceLimit > 0 && creditBalance < creditBalanceLimit;

    // Apply VAT Auditor masking for balance info
    const result: Record<string, unknown> = {
      configured: true,
      creditBalance: security.user.role === 'vat_auditor' ? 'N/A (Audit Mode)' : creditBalance,
      creditBalanceLimit: security.user.role === 'vat_auditor' ? 'N/A (Audit Mode)' : creditBalanceLimit,
      gatewayName: activeSetting.gatewayName || '—',
      senderId: activeSetting.senderId || '—',
      isLowBalance,
      ratePerSms: security.user.role === 'vat_auditor' ? 'N/A (Audit Mode)' : safeFinancialRound(activeSetting.ratePerSms),
      unicodeRate: security.user.role === 'vat_auditor' ? 'N/A (Audit Mode)' : safeFinancialRound(activeSetting.unicodeRate),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[SmsGateway] Balance GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SMS gateway balance' },
      { status: 500 }
    );
  }
}

// PUT /api/sms-gateway/balance — Update credit balance (admin only)
// Used to manually top-up or adjust the known credit balance
export async function PUT(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsGateway', 'PUT');
  if (!security.authorized) return security.response;

  // Only admin can modify gateway balance
  if (security.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only administrators can update SMS gateway credit balance' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    if (body.creditBalance === undefined || body.creditBalance === null) {
      return NextResponse.json(
        { error: 'Missing required field: creditBalance' },
        { status: 400 }
      );
    }

    const newBalance = safeFinancialRound(Number(body.creditBalance));
    if (newBalance < 0) {
      return NextResponse.json(
        { error: 'Credit balance cannot be negative' },
        { status: 400 }
      );
    }

    // Directive 1: Multi-tenant isolation
    const where: Record<string, unknown> = { isActive: true };
    if (companyId) {
      where.companyId = companyId;
    }

    const activeSetting = await db.smsSetting.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (!activeSetting) {
      return NextResponse.json(
        { error: 'No active SMS gateway configuration found for your tenant' },
        { status: 404 }
      );
    }

    await db.smsSetting.update({
      where: { id: activeSetting.id },
      data: { lastKnownCreditBalance: newBalance },
    });

    return NextResponse.json({
      success: true,
      creditBalance: newBalance,
      creditBalanceLimit: safeFinancialRound(activeSetting.creditBalanceLimit || 0),
    });
  } catch (error) {
    console.error('[SmsGateway] Balance PUT error:', error);
    return NextResponse.json(
      { error: 'Failed to update SMS gateway credit balance' },
      { status: 500 }
    );
  }
}
