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
      autoSmsOnPurchase: config?.autoSmsOnPurchase ?? false,
      autoSmsOnReceipt: config?.autoSmsOnReceipt ?? false,
      autoSmsOnStockReceive: config?.autoSmsOnStockReceive ?? false,
      autoSmsOnEmployeeEvent: config?.autoSmsOnEmployeeEvent ?? false,
      autoSmsOnPaymentReceive: config?.autoSmsOnPaymentReceive ?? false,
      autoSmsOnGodownReceive: config?.autoSmsOnGodownReceive ?? false,
      autoSmsOnEmployeeJoin: config?.autoSmsOnEmployeeJoin ?? false,
      autoSmsOnEmployeeExam: config?.autoSmsOnEmployeeExam ?? false,
    });
  } catch (error) {
    console.error('[SmsAutomationConfig] GET error:', error);
    return NextResponse.json(
      {
        autoSmsOnPurchase: false,
        autoSmsOnReceipt: false,
        autoSmsOnStockReceive: false,
        autoSmsOnEmployeeEvent: false,
        autoSmsOnPaymentReceive: false,
        autoSmsOnGodownReceive: false,
        autoSmsOnEmployeeJoin: false,
        autoSmsOnEmployeeExam: false,
      },
      { status: 200 } // Graceful fallback — never block UI on config fetch failure
    );
  }
}
