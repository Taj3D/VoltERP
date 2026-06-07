import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SystemSettings', 'GET');
  if (!security.authorized) return security.response;
  if (security.user.role !== 'admin') {
    return NextResponse.json({ error: 'Access denied: Admin only' }, { status: 403 });
  }

  try {
    const logs = await db.stagingTestLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json(logs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
