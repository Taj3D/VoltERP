// ============================================================
// SMS AUTOMATION CONFIG — Read-only endpoint for frontend
// status badges. Returns toggle flags for the current tenant.
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsAutomation', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;

    const config = await db.smsAutomationConfig.findFirst({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      smsAlertOnPurchase: config?.smsAlertOnPurchase ?? false,
      smsAlertOnCollection: config?.smsAlertOnCollection ?? false,
      smsAlertOnStockReceive: config?.smsAlertOnStockReceive ?? false,
      smsAlertOnHrLifecycle: config?.smsAlertOnHrLifecycle ?? false,
    });
  } catch (error) {
    console.error('[SmsAutomationConfig] GET error:', error);
    return NextResponse.json(
      {
        smsAlertOnPurchase: false,
        smsAlertOnCollection: false,
        smsAlertOnStockReceive: false,
        smsAlertOnHrLifecycle: false,
      },
      { status: 200 } // Graceful fallback — never block UI on config fetch failure
    );
  }
}
