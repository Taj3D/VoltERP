-- ============================================================
-- Migration: 20250118000000_v3_0_0_initial
-- Version: 3.0.0
-- Name: add_feature_flags_and_migration_tracking
-- Description: Adds FeatureFlag and SchemaMigration tables for v3.0.0
--              Enables runtime feature toggles and database migration tracking
-- Date: 2025-01-18
-- Author: Z.ai Code
-- ============================================================

-- FeatureFlag table: stores per-company feature flag overrides
CREATE TABLE IF NOT EXISTS "FeatureFlag" (
    "id"              TEXT NOT NULL,
    "key"             TEXT NOT NULL,
    "isEnabled"       BOOLEAN NOT NULL DEFAULT false,
    "description"     TEXT,
    "category"        TEXT NOT NULL DEFAULT 'feature',
    "sinceVersion"    TEXT NOT NULL DEFAULT '3.0.0',
    "companyId"       TEXT,
    "updatedBy"       TEXT,
    "updatedByName"   TEXT,
    "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       DATETIME NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- Unique index on key (global flags)
CREATE UNIQUE INDEX IF NOT EXISTS "FeatureFlag_key_key" ON "FeatureFlag"("key");

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "FeatureFlag_companyId_idx" ON "FeatureFlag"("companyId");
CREATE INDEX IF NOT EXISTS "FeatureFlag_isEnabled_idx" ON "FeatureFlag"("isEnabled");

-- Foreign key to Company (nullable — null means global flag)
-- Note: Added separately to allow per-company overrides without breaking global flags

-- ============================================================

-- SchemaMigration table: tracks which migrations have been applied
CREATE TABLE IF NOT EXISTS "SchemaMigration" (
    "id"            TEXT NOT NULL,
    "version"       TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "checksum"      TEXT,
    "appliedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedBy"     TEXT,
    "executionMs"   INTEGER NOT NULL DEFAULT 0,
    "success"       BOOLEAN NOT NULL DEFAULT true,
    "rollbackSql"   TEXT,
    "notes"         TEXT,

    CONSTRAINT "SchemaMigration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SchemaMigration_version_key" ON "SchemaMigration"("version");
CREATE INDEX IF NOT EXISTS "SchemaMigration_appliedAt_idx" ON "SchemaMigration"("appliedAt");

-- ============================================================

-- Seed default feature flags (all set to their default values)
-- These can be overridden via /api/feature-flags or environment variables

INSERT OR IGNORE INTO "FeatureFlag" ("id", "key", "isEnabled", "description", "category", "sinceVersion", "createdAt", "updatedAt") VALUES
  (lower(hex(randomblob(16))), 'new_dashboard', true, 'Enhanced dashboard with analytics charts and KPI cards', 'ui', '3.0.0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'enhanced_pdf', true, 'PDF generation with company logo, branding, and English digits', 'feature', '3.0.0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'sidebar_collapse_fix', true, 'Fixed sidebar collapse/expand behavior on desktop', 'ui', '3.0.0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'audit_trail_enhanced', true, 'Enhanced audit trail with IP, user agent, and geo-location', 'security', '3.0.0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'sms_auto_trigger', false, 'Auto SMS on purchase, payment receipt, godown receipt, employee joining', 'feature', '3.1.0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'password_hashing', false, 'Use bcrypt/argon2 for password storage', 'security', '3.1.0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'jwt_auth', false, 'JWT session tokens', 'security', '3.1.0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'httponly_cookies', false, 'Store auth token in httpOnly cookie', 'security', '3.1.0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'photo_upload_blob', false, 'Use Vercel Blob for photo/logo upload', 'feature', '3.1.0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'bengali_digits_pdf', false, 'Use Bengali digits in PDF', 'ui', '3.0.0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'role_based_access', false, 'Enforce role-based access control', 'security', '3.1.0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'pos_terminal', false, 'POS terminal with barcode scanning', 'feature', '3.2.0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'multi_branch_consolidation', false, 'Multi-branch consolidation reports', 'feature', '3.2.0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'advance_search_v2', false, 'Advanced search v2 with saved queries', 'feature', '3.2.0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (lower(hex(randomblob(16))), 'realtime_notifications', false, 'Real-time notifications via WebSocket', 'performance', '3.2.0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ============================================================

-- Record this migration in SchemaMigration table
INSERT OR IGNORE INTO "SchemaMigration" ("id", "version", "name", "checksum", "appliedAt", "appliedBy", "executionMs", "success", "rollbackSql", "notes") VALUES
  (lower(hex(randomblob(16))), '3.0.0', 'add_feature_flags_and_migration_tracking',
   'sha256:v3_0_0_initial_migration_2025_01_18',
   CURRENT_TIMESTAMP, 'system', 0, 1,
   'DROP TABLE IF EXISTS "FeatureFlag"; DROP TABLE IF EXISTS "SchemaMigration";',
   'Initial v3.0.0 migration — adds feature flags and migration tracking tables');

-- ============================================================
-- END Migration: 20250118000000_v3_0_0_initial
-- ============================================================
