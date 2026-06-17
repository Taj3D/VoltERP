import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { warmupBatchCache } from '@/app/api/dashboard-batch/route';

export const maxDuration = 60;

/**
 * Dashboard Cache Warmup Endpoint
 * ───────────────────────────────────────────────────────────────────────────
 * Called by Vercel Cron every 5 minutes. Pre-builds the dashboard-batch
 * cache for active admin/manager users so the first real user request hits
 * a warm cache instead of the ~8s cold path.
 *
 * Authentication: CRON_SECRET env var (set in Vercel project settings).
 * Falls back gracefully if no active users are found.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const warmedUsers: string[] = [];
  const errors: string[] = [];

  try {
    // Find active admin/manager users. Capped at 10 to keep warmup fast.
    // We warm for all active admins/managers because the cache is per-user
    // and we want the most common users to have instant dashboard loads.
    const activeUsers = await db.user.findMany({
      where: {
        isActive: true,
        role: { in: ['admin', 'manager'] },
      },
      select: { id: true, companyId: true, role: true },
      take: 10,
    });

    // Warm cache for each user in parallel
    await Promise.allSettled(
      activeUsers.map(async (user) => {
        try {
          await warmupBatchCache(
            user.id,
            user.companyId,
            user.role as 'admin' | 'manager',
            false, // non-VAT mode (most common)
          );
          warmedUsers.push(user.id);
        } catch (err) {
          errors.push(`${user.id}: ${err instanceof Error ? err.message : 'unknown'}`);
        }
      })
    );

    return NextResponse.json({
      success: true,
      warmed: warmedUsers.length,
      errors: errors.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Dashboard warmup error:', error);
    return NextResponse.json(
      { success: false, error: 'Warmup failed', details: errors },
      { status: 500 }
    );
  }
}
