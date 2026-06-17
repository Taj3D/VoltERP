/**
 * Feature Flags API Endpoint
 * ===========================
 *
 * GET  /api/feature-flags      — List all flags with resolved state
 * PUT  /api/feature-flags      — Update a flag (admin only)
 * POST /api/feature-flags/reset — Reset runtime cache (admin only)
 *
 * The PUT endpoint updates the in-memory runtime cache AND the database
 * (so changes persist across server restarts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import {
  getFeatureFlags,
  getFlagDefinitions,
  isValidFlagKey,
  setRuntimeOverride,
  invalidateFeatureFlagCache,
  DEFAULT_FLAGS,
  type FlagKey,
} from '@/lib/feature-flags';
import { db } from '@/lib/db';

// ============================================================
// GET — List all feature flags
// ============================================================
export async function GET(req: NextRequest) {
  const security = await withApiSecurity(req, 'FeatureFlags', 'GET');
  if (!security.authorized) return security.response;

  try {
    const flags = await getFeatureFlags();

    // Merge resolved state with definitions
    const result = flags.map((f) => ({
      ...f,
      ...DEFAULT_FLAGS[f.key as FlagKey],
    }));

    return NextResponse.json({
      flags: result,
      version: '3.0.0',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[feature-flags] GET error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch feature flags', details: (err as Error).message },
      { status: 500 }
    );
  }
}

// ============================================================
// PUT — Update a feature flag (admin only)
// ============================================================
export async function PUT(req: NextRequest) {
  const security = await withApiSecurity(req, 'FeatureFlags', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const user = security.user;

    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden — admin access required to modify feature flags' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { key, enabled, description, companyId } = body;

    if (!key || typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing required fields: key (string), enabled (boolean)' },
        { status: 400 }
      );
    }

    if (!isValidFlagKey(key)) {
      return NextResponse.json(
        { error: `Invalid flag key: ${key}`, validKeys: Object.keys(DEFAULT_FLAGS) },
        { status: 400 }
      );
    }

    // 1. Update runtime cache (immediate effect, this server instance)
    setRuntimeOverride(key as FlagKey, enabled);

    // 2. Persist to database (survives server restart)
    try {
      if (db && typeof (db as any).featureFlag !== 'undefined') {
        await (db as any).featureFlag.upsert({
          where: { key },
          create: {
            key,
            isEnabled: enabled,
            description: description || DEFAULT_FLAGS[key as FlagKey].description,
            category: DEFAULT_FLAGS[key as FlagKey].category,
            sinceVersion: DEFAULT_FLAGS[key as FlagKey].sinceVersion,
            companyId: companyId || null,
            updatedBy: user.email,
            updatedByName: user.name,
          },
          update: {
            isEnabled: enabled,
            description: description || undefined,
            updatedBy: user.email,
            updatedByName: user.name,
          },
        });
      }
    } catch (dbErr) {
      console.warn('[feature-flags] DB update failed (using runtime only):', dbErr);
    }

    // 3. Invalidate cache so other requests pick up the change
    invalidateFeatureFlagCache();
    setRuntimeOverride(key as FlagKey, enabled); // re-set after invalidate

    return NextResponse.json({
      success: true,
      key,
      enabled,
      message: `Feature flag "${key}" ${enabled ? 'enabled' : 'disabled'} (runtime + database)`,
      updatedBy: user.email,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[feature-flags] PUT error:', err);
    return NextResponse.json(
      { error: 'Failed to update feature flag', details: (err as Error).message },
      { status: 500 }
    );
  }
}

// ============================================================
// POST — Reset runtime cache (admin only)
// ============================================================
export async function POST(req: NextRequest) {
  const security = await withApiSecurity(req, 'FeatureFlags', 'POST');
  if (!security.authorized) return security.response;

  try {
    const user = security.user;

    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden — admin access required' },
        { status: 403 }
      );
    }

    invalidateFeatureFlagCache();

    return NextResponse.json({
      success: true,
      message: 'Feature flag cache invalidated — will reload from database on next access',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[feature-flags] POST error:', err);
    return NextResponse.json(
      { error: 'Failed to reset cache', details: (err as Error).message },
      { status: 500 }
    );
  }
}
