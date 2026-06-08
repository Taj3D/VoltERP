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
  smsAlertOnPurchase: false,
  smsAlertOnCollection: false,
  smsAlertOnStockReceive: false,
  smsAlertOnHrLifecycle: false,
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
    const companyId = security.user.companyId;

    // Extract boolean toggles with safe defaults
    const smsAlertOnPurchase = Boolean(body.smsAlertOnPurchase ?? false);
    const smsAlertOnCollection = Boolean(body.smsAlertOnCollection ?? false);
    const smsAlertOnStockReceive = Boolean(body.smsAlertOnStockReceive ?? false);
    const smsAlertOnHrLifecycle = Boolean(body.smsAlertOnHrLifecycle ?? false);

    const record = await db.$transaction(async (tx) => {
      const created = await tx.smsAutomationConfig.create({
        data: {
          smsAlertOnPurchase,
          smsAlertOnCollection,
          smsAlertOnStockReceive,
          smsAlertOnHrLifecycle,
          isActive: true,
          ...(companyId && { companyId }),
        },
      });

      // Activity log with Comm-SMS-Marketing module token
      await logUserActivity({
        action: 'CREATE',
        module: 'Comm-SMS-Marketing',
        recordId: created.id,
        recordLabel: `SMS Automation Config`,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          smsAlertOnPurchase: created.smsAlertOnPurchase,
          smsAlertOnCollection: created.smsAlertOnCollection,
          smsAlertOnStockReceive: created.smsAlertOnStockReceive,
          smsAlertOnHrLifecycle: created.smsAlertOnHrLifecycle,
          companyId: created.companyId,
        }),
      });

      return created;
    });

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
    const smsAlertOnPurchase = Boolean(body.smsAlertOnPurchase ?? false);
    const smsAlertOnCollection = Boolean(body.smsAlertOnCollection ?? false);
    const smsAlertOnStockReceive = Boolean(body.smsAlertOnStockReceive ?? false);
    const smsAlertOnHrLifecycle = Boolean(body.smsAlertOnHrLifecycle ?? false);

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
          smsAlertOnPurchase,
          smsAlertOnCollection,
          smsAlertOnStockReceive,
          smsAlertOnHrLifecycle,
        },
      });
    } else {
      // Create new config (upsert pattern — not found, so create one)
      result = await db.smsAutomationConfig.create({
        data: {
          smsAlertOnPurchase,
          smsAlertOnCollection,
          smsAlertOnStockReceive,
          smsAlertOnHrLifecycle,
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
        smsAlertOnPurchase: result.smsAlertOnPurchase,
        smsAlertOnCollection: result.smsAlertOnCollection,
        smsAlertOnStockReceive: result.smsAlertOnStockReceive,
        smsAlertOnHrLifecycle: result.smsAlertOnHrLifecycle,
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
