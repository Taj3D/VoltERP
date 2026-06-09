import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/sms-credit-balance - Return current SMS gateway credit balance for the tenant
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsSettings', 'GET');
  if (!security.authorized) return security.response;
  try {
    const companyId = security.user.companyId;

    // Load active SmsSetting for companyId
    const settingWhere: Record<string, unknown> = { isActive: true };
    if (companyId) {
      settingWhere.OR = [{ companyId }, { companyId: null }];
    }
    const activeSetting = await db.smsSetting.findFirst({
      where: settingWhere,
      orderBy: { createdAt: 'desc' },
    });

    if (!activeSetting) {
      return NextResponse.json({
        available: 0,
        used: 0,
        remaining: 0,
        creditBalanceLimit: 0,
        configured: false,
      });
    }

    // Count used SMS units for this company
    const usedWhere: Record<string, unknown> = { isActive: true };
    if (companyId) {
      usedWhere.OR = [{ companyId }, { companyId: null }];
    }
    const usedResult = await db.smsLog.aggregate({
      where: usedWhere,
      _sum: {
        smsSegmentCount: true,
      },
    });

    const used = usedResult._sum.smsSegmentCount || 0;
    const creditBalanceLimit = activeSetting.creditBalanceLimit || 0;
    const remaining = Math.max(0, creditBalanceLimit - used);

    return NextResponse.json({
      available: creditBalanceLimit,
      used,
      remaining,
      creditBalanceLimit,
      configured: true,
    });
  } catch (error) {
    console.error('Error fetching SMS credit balance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SMS credit balance' },
      { status: 500 }
    );
  }
}
