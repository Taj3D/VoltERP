/**
 * Feature Flag System for Electronics Mart IMS
 * =============================================
 *
 * Three-tier flag resolution (highest priority first):
 *   1. Runtime overrides (in-memory cache, set via /api/feature-flags)
 *   2. Database flags (FeatureFlag table, per-company)
 *   3. Environment variables (NEXT_PUBLIC_FEATURE_* / FEATURE_*)
 *   4. Default values (defined in DEFAULT_FLAGS)
 *
 * Usage (server-side):
 *   import { isFeatureEnabled, getFeatureFlags } from '@/lib/feature-flags';
 *   if (await isFeatureEnabled('new_dashboard')) { ... }
 *
 * Usage (client-side):
 *   import { useFeatureFlag } from '@/components/erp/feature-flags-provider';
 *   const enabled = useFeatureFlag('new_dashboard');
 *
 * Adding a new flag:
 *   1. Add entry to DEFAULT_FLAGS below
 *   2. (Optional) Set env var: FEATURE_NEW_DASHBOARD=true
 *   3. (Optional) Create DB row in FeatureFlag table
 *   4. (Optional) Toggle at runtime via /api/feature-flags
 */

import { db } from './db';

// ============================================================
// TYPES
// ============================================================

export type FlagKey =
  | 'new_dashboard'
  | 'enhanced_pdf'
  | 'sms_auto_trigger'
  | 'password_hashing'
  | 'jwt_auth'
  | 'httponly_cookies'
  | 'photo_upload_blob'
  | 'bengali_digits_pdf'
  | 'sidebar_collapse_fix'
  | 'role_based_access'
  | 'pos_terminal'
  | 'multi_branch_consolidation'
  | 'advance_search_v2'
  | 'realtime_notifications'
  | 'audit_trail_enhanced';

export interface FlagDefinition {
  key: FlagKey;
  description: string;
  defaultValue: boolean;
  category: 'security' | 'ui' | 'feature' | 'performance' | 'experimental';
  sinceVersion: string;
}

export interface ResolvedFlag {
  key: FlagKey;
  enabled: boolean;
  source: 'runtime' | 'database' | 'env' | 'default';
}

// ============================================================
// FLAG DEFINITIONS
// ============================================================

export const DEFAULT_FLAGS: Record<FlagKey, FlagDefinition> = {
  new_dashboard: {
    key: 'new_dashboard',
    description: 'Enhanced dashboard with analytics charts and KPI cards',
    defaultValue: true,
    category: 'ui',
    sinceVersion: '3.0.0',
  },
  enhanced_pdf: {
    key: 'enhanced_pdf',
    description: 'PDF generation with company logo, branding, and English digits',
    defaultValue: true,
    category: 'feature',
    sinceVersion: '3.0.0',
  },
  sms_auto_trigger: {
    key: 'sms_auto_trigger',
    description: 'Auto SMS on purchase, payment receipt, godown receipt, employee joining',
    defaultValue: false,
    category: 'feature',
    sinceVersion: '3.1.0',
  },
  password_hashing: {
    key: 'password_hashing',
    description: 'Use bcrypt/argon2 for password storage (migration from plaintext)',
    defaultValue: false,
    category: 'security',
    sinceVersion: '3.1.0',
  },
  jwt_auth: {
    key: 'jwt_auth',
    description: 'JWT session tokens (replaces X-User-Email header)',
    defaultValue: false,
    category: 'security',
    sinceVersion: '3.1.0',
  },
  httponly_cookies: {
    key: 'httponly_cookies',
    description: 'Store auth token in httpOnly cookie (replaces localStorage)',
    defaultValue: false,
    category: 'security',
    sinceVersion: '3.1.0',
  },
  photo_upload_blob: {
    key: 'photo_upload_blob',
    description: 'Use Vercel Blob for photo/logo upload (requires BLOB_READ_WRITE_TOKEN)',
    defaultValue: false,
    category: 'feature',
    sinceVersion: '3.1.0',
  },
  bengali_digits_pdf: {
    key: 'bengali_digits_pdf',
    description: 'Use Bengali digits in PDF (disabled = all English digits)',
    defaultValue: false,
    category: 'ui',
    sinceVersion: '3.0.0',
  },
  sidebar_collapse_fix: {
    key: 'sidebar_collapse_fix',
    description: 'Fixed sidebar collapse/expand behavior on desktop',
    defaultValue: true,
    category: 'ui',
    sinceVersion: '3.0.0',
  },
  role_based_access: {
    key: 'role_based_access',
    description: 'Enforce role-based access control (Admin, Manager, SR, Dealer, VAT)',
    defaultValue: false,
    category: 'security',
    sinceVersion: '3.1.0',
  },
  pos_terminal: {
    key: 'pos_terminal',
    description: 'POS terminal with barcode scanning and quick checkout',
    defaultValue: false,
    category: 'feature',
    sinceVersion: '3.2.0',
  },
  multi_branch_consolidation: {
    key: 'multi_branch_consolidation',
    description: 'Multi-branch consolidation reports and dashboards',
    defaultValue: false,
    category: 'feature',
    sinceVersion: '3.2.0',
  },
  advance_search_v2: {
    key: 'advance_search_v2',
    description: 'Advanced search v2 with saved queries and filters',
    defaultValue: false,
    category: 'feature',
    sinceVersion: '3.2.0',
  },
  realtime_notifications: {
    key: 'realtime_notifications',
    description: 'Real-time notifications via WebSocket (socket.io)',
    defaultValue: false,
    category: 'performance',
    sinceVersion: '3.2.0',
  },
  audit_trail_enhanced: {
    key: 'audit_trail_enhanced',
    description: 'Enhanced audit trail with IP, user agent, and geo-location',
    defaultValue: true,
    category: 'security',
    sinceVersion: '3.0.0',
  },
};

// ============================================================
// RUNTIME CACHE (in-memory, per-server-instance)
// ============================================================

const runtimeOverrides = new Map<FlagKey, boolean>();
let runtimeCacheLoaded = false;
let runtimeCacheLoadPromise: Promise<void> | null = null;

/**
 * Load runtime overrides from database on first access.
 * Safe to call multiple times — uses single-flight promise.
 */
async function loadRuntimeCache(): Promise<void> {
  if (runtimeCacheLoaded) return;
  if (runtimeCacheLoadPromise) return runtimeCacheLoadPromise;

  runtimeCacheLoadPromise = (async () => {
    try {
      const rows = await (db as any).featureFlag.findMany({
        where: { isEnabled: true },
        select: { key: true },
      });
      for (const row of rows) {
        if (row.key in DEFAULT_FLAGS) {
          runtimeOverrides.set(row.key as FlagKey, true);
        }
      }
    } catch (err) {
      // Table might not exist yet — fail silently, use defaults
      console.warn('[feature-flags] Could not load from DB:', (err as Error).message);
    } finally {
      runtimeCacheLoaded = true;
    }
  })();

  return runtimeCacheLoadPromise;
}

/**
 * Invalidate the runtime cache (call after DB flag updates).
 */
export function invalidateFeatureFlagCache(): void {
  runtimeOverrides.clear();
  runtimeCacheLoaded = false;
  runtimeCacheLoadPromise = null;
}

/**
 * Set a runtime override (in-memory only, per server instance).
 * Use the /api/feature-flags endpoint for persistent changes.
 */
export function setRuntimeOverride(key: FlagKey, enabled: boolean): void {
  runtimeOverrides.set(key, enabled);
}

// ============================================================
// FLAG RESOLUTION
// ============================================================

/**
 * Resolve a single flag with priority:
 *   runtime > database > env > default
 */
export async function isFeatureEnabled(key: FlagKey): Promise<boolean> {
  await loadRuntimeCache();

  // 1. Runtime override (highest priority)
  if (runtimeOverrides.has(key)) {
    return runtimeOverrides.get(key)!;
  }

  // 2. Environment variable
  const envKey = `FEATURE_${key.toUpperCase()}`;
  const envValue = process.env[envKey];
  if (envValue !== undefined) {
    return envValue === 'true' || envValue === '1' || envValue === 'yes';
  }

  // 3. Default value
  return DEFAULT_FLAGS[key]?.defaultValue ?? false;
}

/**
 * Synchronous version — uses cached runtime overrides + env only.
 * Does NOT hit the database. Use this in hot paths.
 */
export function isFeatureEnabledSync(key: FlagKey): boolean {
  // 1. Runtime override
  if (runtimeOverrides.has(key)) {
    return runtimeOverrides.get(key)!;
  }

  // 2. Environment variable
  const envKey = `FEATURE_${key.toUpperCase()}`;
  const envValue = process.env[envKey];
  if (envValue !== undefined) {
    return envValue === 'true' || envValue === '1' || envValue === 'yes';
  }

  // 3. Default value
  return DEFAULT_FLAGS[key]?.defaultValue ?? false;
}

/**
 * Resolve all flags with their source information.
 */
export async function getFeatureFlags(): Promise<ResolvedFlag[]> {
  await loadRuntimeCache();

  return Promise.all(
    Object.keys(DEFAULT_FLAGS).map(async (key) => {
      const flagKey = key as FlagKey;
      let source: ResolvedFlag['source'] = 'default';
      let enabled = DEFAULT_FLAGS[flagKey].defaultValue;

      if (runtimeOverrides.has(flagKey)) {
        source = 'runtime';
        enabled = runtimeOverrides.get(flagKey)!;
      } else {
        const envKey = `FEATURE_${flagKey.toUpperCase()}`;
        const envValue = process.env[envKey];
        if (envValue !== undefined) {
          source = 'env';
          enabled = envValue === 'true' || envValue === '1' || envValue === 'yes';
        }
      }

      return { key: flagKey, enabled, source };
    })
  );
}

/**
 * Get all flag definitions (for UI display).
 */
export function getFlagDefinitions(): FlagDefinition[] {
  return Object.values(DEFAULT_FLAGS);
}

/**
 * Check if a flag key is valid.
 */
export function isValidFlagKey(key: string): key is FlagKey {
  return key in DEFAULT_FLAGS;
}
