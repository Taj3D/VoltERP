// ============================================================
// SMS AUTOMATION CONFIG API ROUTE — Block 12 (Domain 19)
// CRUD for SmsAutomationConfig with:
// - Multi-tenant companyId isolation
// - RBAC enforcement via withApiSecurity
// - Admin-only write operations
// - VAT Auditor masking
// - Activity logging with Comm-SMS-Marketing module token
// - Upsert pattern on PUT
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskForVatAuditorSms,
  safeFinancialRound,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Default automation config returned when no active config exists for the tenant
const DEFAULT_AUTOMATION_CONFIG = {
  id: null,
  autoSmsOnPurchase: false,
  autoSmsOnReceipt: false,
  autoSmsOnStockReceive: false,
  autoSmsOnEmployeeEvent: false,
  autoSmsOnPaymentReceive: false,
  autoSmsOnGodownReceive: false,
  autoSmsOnEmployeeJoin: false,
  autoSmsOnEmployeeExam: false,
  companyId: null,
  isActive: true,
  createdAt: null,
  updatedAt: null,
};

// ─────────────────────────────────────────────────────────────
// GET /api/sms-automation — Fetch active SmsAutomationConfig
// ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const security = await withApiSecurity(request, 'SmsAutomation', 'GET');
    if (!security.authorized) return security.response;

    const companyId = security.user.companyId;

    const config = await db.smsAutomationConfig.findFirst({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    // If no config exists, return default values (all toggles false)
    if (!config) {
      return NextResponse.json({
        ...DEFAULT_AUTOMATION_CONFIG,
        companyId,
      });
    }

    // Apply VAT Auditor masking
    const masked = maskForVatAuditorSms(
      { ...config },
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsAutomation] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SMS automation config', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/sms-automation — Create SmsAutomationConfig (admin only)
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsAutomation', 'POST');
  if (!security.authorized) return security.response;

  // RBAC: Only admin can modify automation settings
  // DIRECTIVE 4: Explicit SR and Dealer block — these roles must NEVER
  // manipulate transactional auto-SMS toggles, even via manual API fetch
  const role = security.user.role;
  if (role === 'sr' || role === 'dealer') {
    return NextResponse.json(
      {
        error: `Access denied. SR and Dealer roles are strictly prohibited from modifying SMS automation configurations.`,
        code: 'ROLE_FORBIDDEN',
      },
      { status: 403 }
    );
  }
  if (role !== 'admin') {
    return NextResponse.json(
      {
        error: `Access denied. Only Administrators can create SMS automation configurations. Your role (${role}) does not have write permission for automation settings.`,
        code: 'ROLE_FORBIDDEN',
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    // Validate: at least one toggle must be specified
    const hasAnyToggle = [
      body.autoSmsOnPurchase, body.autoSmsOnReceipt, body.autoSmsOnStockReceive,
      body.autoSmsOnEmployeeEvent, body.autoSmsOnPaymentReceive, body.autoSmsOnGodownReceive,
      body.autoSmsOnEmployeeJoin, body.autoSmsOnEmployeeExam,
    ].some(v => v !== undefined && v !== null);
    if (!hasAnyToggle) {
      return NextResponse.json({ error: 'At least one SMS automation toggle must be specified' }, { status: 400 });
    }

    const companyId = security.user.companyId;

    // Extract boolean toggles with safe defaults
    const autoSmsOnPurchase = Boolean(body.autoSmsOnPurchase ?? false);
    const autoSmsOnReceipt = Boolean(body.autoSmsOnReceipt ?? false);
    const autoSmsOnStockReceive = Boolean(body.autoSmsOnStockReceive ?? false);
    const autoSmsOnEmployeeEvent = Boolean(body.autoSmsOnEmployeeEvent ?? false);
    const autoSmsOnPaymentReceive = Boolean(body.autoSmsOnPaymentReceive ?? false);
    const autoSmsOnGodownReceive = Boolean(body.autoSmsOnGodownReceive ?? false);
    const autoSmsOnEmployeeJoin = Boolean(body.autoSmsOnEmployeeJoin ?? false);
    const autoSmsOnEmployeeExam = Boolean(body.autoSmsOnEmployeeExam ?? false);

    const record = await db.smsAutomationConfig.create({
      data: {
        autoSmsOnPurchase,
        autoSmsOnReceipt,
        autoSmsOnStockReceive,
        autoSmsOnEmployeeEvent,
        autoSmsOnPaymentReceive,
        autoSmsOnGodownReceive,
        autoSmsOnEmployeeJoin,
        autoSmsOnEmployeeExam,
        isActive: true,
        ...(companyId && { companyId }),
      },
    });

    // Fire-and-forget activity log (outside transaction to avoid timeout)
    logUserActivity({
      action: 'CREATE',
      module: 'Comm-SMS-Marketing',
      recordId: record.id,
      recordLabel: `SMS Automation Config`,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        autoSmsOnPurchase: record.autoSmsOnPurchase,
        autoSmsOnReceipt: record.autoSmsOnReceipt,
        autoSmsOnStockReceive: record.autoSmsOnStockReceive,
        autoSmsOnEmployeeEvent: record.autoSmsOnEmployeeEvent,
        autoSmsOnPaymentReceive: record.autoSmsOnPaymentReceive,
        autoSmsOnGodownReceive: record.autoSmsOnGodownReceive,
        autoSmsOnEmployeeJoin: record.autoSmsOnEmployeeJoin,
        autoSmsOnEmployeeExam: record.autoSmsOnEmployeeExam,
        companyId: record.companyId,
      }),
    }).catch(() => {});

    // Apply VAT Auditor masking on response
    const masked = maskForVatAuditorSms(
      { ...record },
      security.user.role
    );

    return NextResponse.json(masked, { status: 201 });
  } catch (error) {
    console.error('[SmsAutomation] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create SMS automation config' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// PUT /api/sms-automation — Update or create (upsert) SmsAutomationConfig (admin only)
// ─────────────────────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  let security;
  try {
    security = await withApiSecurity(request, 'SmsAutomation', 'PUT');
  } catch (e: any) {
    return NextResponse.json({ error: 'Auth check failed', detail: e.message }, { status: 500 });
  }
  if (!security.authorized) return security.response;

  // RBAC: Only admin can modify automation settings
  // DIRECTIVE 4: Explicit SR and Dealer block
  const role = security.user.role;
  if (role === 'sr' || role === 'dealer') {
    return NextResponse.json(
      {
        error: `Access denied. SR and Dealer roles are strictly prohibited from modifying SMS automation configurations.`,
        code: 'ROLE_FORBIDDEN',
      },
      { status: 403 }
    );
  }
  if (role !== 'admin') {
    return NextResponse.json(
      {
        error: `Access denied. Only Administrators can update SMS automation configurations. Your role (${role}) does not have write permission for automation settings.`,
        code: 'ROLE_FORBIDDEN',
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    // Extract boolean toggles with safe defaults
    const autoSmsOnPurchase = Boolean(body.autoSmsOnPurchase ?? false);
    const autoSmsOnReceipt = Boolean(body.autoSmsOnReceipt ?? false);
    const autoSmsOnStockReceive = Boolean(body.autoSmsOnStockReceive ?? false);
    const autoSmsOnEmployeeEvent = Boolean(body.autoSmsOnEmployeeEvent ?? false);
    const autoSmsOnPaymentReceive = Boolean(body.autoSmsOnPaymentReceive ?? false);
    const autoSmsOnGodownReceive = Boolean(body.autoSmsOnGodownReceive ?? false);
    const autoSmsOnEmployeeJoin = Boolean(body.autoSmsOnEmployeeJoin ?? false);
    const autoSmsOnEmployeeExam = Boolean(body.autoSmsOnEmployeeExam ?? false);

    // Find the existing active config for the current tenant
    const existingConfig = await db.smsAutomationConfig.findFirst({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    let result;
    if (existingConfig) {
      // Update existing config
      result = await db.smsAutomationConfig.update({
        where: { id: existingConfig.id },
        data: {
          autoSmsOnPurchase,
          autoSmsOnReceipt,
          autoSmsOnStockReceive,
          autoSmsOnEmployeeEvent,
          autoSmsOnPaymentReceive,
          autoSmsOnGodownReceive,
          autoSmsOnEmployeeJoin,
          autoSmsOnEmployeeExam,
        },
      });
    } else {
      // Create new config (upsert pattern — not found, so create one)
      result = await db.smsAutomationConfig.create({
        data: {
          autoSmsOnPurchase,
          autoSmsOnReceipt,
          autoSmsOnStockReceive,
          autoSmsOnEmployeeEvent,
          autoSmsOnPaymentReceive,
          autoSmsOnGodownReceive,
          autoSmsOnEmployeeJoin,
          autoSmsOnEmployeeExam,
          isActive: true,
          ...(companyId && { companyId }),
        },
      });
    }

    // Fire-and-forget activity log (outside transaction to avoid timeout)
    logUserActivity({
      action: existingConfig ? 'UPDATE' : 'CREATE',
      module: 'Comm-SMS-Marketing',
      recordId: result.id,
      recordLabel: `SMS Automation Config`,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        operation: existingConfig ? 'UPDATE' : 'CREATE_AS_UPSERT',
        autoSmsOnPurchase: result.autoSmsOnPurchase,
        autoSmsOnReceipt: result.autoSmsOnReceipt,
        autoSmsOnStockReceive: result.autoSmsOnStockReceive,
        autoSmsOnEmployeeEvent: result.autoSmsOnEmployeeEvent,
        autoSmsOnPaymentReceive: result.autoSmsOnPaymentReceive,
        autoSmsOnGodownReceive: result.autoSmsOnGodownReceive,
        autoSmsOnEmployeeJoin: result.autoSmsOnEmployeeJoin,
        autoSmsOnEmployeeExam: result.autoSmsOnEmployeeExam,
        companyId: result.companyId,
      }),
    }).catch(() => {});

    // Apply VAT Auditor masking on response
    const masked = maskForVatAuditorSms(
      { ...result },
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsAutomation] PUT error:', error);
    return NextResponse.json(
      { error: 'Failed to update SMS automation config', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
