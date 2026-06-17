/**
 * System Info API Endpoint
 * =========================
 *
 * GET /api/system-info
 *
 * Returns system version, schema version, database info, and feature flag summary.
 * Useful for health checks, dashboard display, and debugging.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { getCurrentSchemaVersion, getAppliedMigrations } from '@/lib/migration-tracker';
import { getFeatureFlags } from '@/lib/feature-flags';
import { db } from '@/lib/db';
import { DB_TYPE } from '@/lib/db';

export async function GET(req: NextRequest) {
  const security = await withApiSecurity(req, 'SystemInfo', 'GET');
  if (!security.authorized) return security.response;

  try {
    // Gather system info
    const [schemaVersion, migrations, flags] = await Promise.all([
      getCurrentSchemaVersion(),
      getAppliedMigrations(),
      getFeatureFlags(),
    ]);

    // Count enabled/disabled flags
    const enabledFlags = flags.filter(f => f.enabled).length;
    const disabledFlags = flags.length - enabledFlags;

    // Get table count (if db available)
    let tableCount: number | null = null;
    try {
      const result = await (db as any).$queryRawUnsafe(
        `SELECT count(*) as count FROM sqlite_master WHERE type='table'`
      );
      tableCount = Number((result[0] as any)?.count || 0);
    } catch {
      // Ignore — table count is optional
    }

    return NextResponse.json({
      version: '3.0.0',
      releaseName: 'Stability & Branding Release',
      releaseDate: '2025-01-18',
      schemaVersion,
      migrationCount: migrations.length,
      lastMigration: migrations[migrations.length - 1] || null,
      database: {
        type: DB_TYPE,
        tableCount,
      },
      featureFlags: {
        total: flags.length,
        enabled: enabledFlags,
        disabled: disabledFlags,
        categories: flags.reduce((acc, f) => {
          const cat = (f as any).category || 'feature';
          acc[cat] = (acc[cat] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      },
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[system-info] Error:', err);
    return NextResponse.json(
      { error: 'Failed to gather system info', details: (err as Error).message },
      { status: 500 }
    );
  }
}
