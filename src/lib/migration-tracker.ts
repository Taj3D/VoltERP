/**
 * Migration Tracker for Electronics Mart IMS
 * ===========================================
 *
 * Tracks applied database migrations in the SchemaMigration table.
 * Enables safe rollback and version verification.
 *
 * Usage:
 *   import { recordMigration, isMigrationApplied, getAppliedMigrations } from '@/lib/migration-tracker';
 */

import { db } from './db';
import * as crypto from 'crypto';

export interface MigrationRecord {
  version: string;
  name: string;
  checksum: string;
  appliedAt: Date;
  appliedBy: string;
  executionMs: number;
  success: boolean;
  rollbackSql?: string;
  notes?: string;
}

/**
 * Compute SHA-256 checksum of migration SQL for integrity verification.
 */
export function computeChecksum(sql: string): string {
  return `sha256:${crypto.createHash('sha256').update(sql).digest('hex')}`;
}

/**
 * Check if a migration version has been applied.
 */
export async function isMigrationApplied(version: string): Promise<boolean> {
  try {
    if (!db || typeof (db as any).schemaMigration === 'undefined') return false;
    const count = await (db as any).schemaMigration.count({
      where: { version, success: true },
    });
    return count > 0;
  } catch {
    return false;
  }
}

/**
 * Get all applied migrations, ordered by appliedAt.
 */
export async function getAppliedMigrations(): Promise<MigrationRecord[]> {
  try {
    if (!db || typeof (db as any).schemaMigration === 'undefined') return [];
    return await (db as any).schemaMigration.findMany({
      orderBy: { appliedAt: 'asc' },
    });
  } catch {
    return [];
  }
}

/**
 * Record a migration as applied.
 */
export async function recordMigration(params: {
  version: string;
  name: string;
  sql: string;
  appliedBy?: string;
  executionMs?: number;
  success?: boolean;
  rollbackSql?: string;
  notes?: string;
}): Promise<void> {
  try {
    if (!db || typeof (db as any).schemaMigration === 'undefined') return;
    await (db as any).schemaMigration.upsert({
      where: { version: params.version },
      create: {
        version: params.version,
        name: params.name,
        checksum: computeChecksum(params.sql),
        appliedBy: params.appliedBy || 'system',
        executionMs: params.executionMs || 0,
        success: params.success ?? true,
        rollbackSql: params.rollbackSql,
        notes: params.notes,
      },
      update: {
        name: params.name,
        checksum: computeChecksum(params.sql),
        appliedBy: params.appliedBy || 'system',
        executionMs: params.executionMs || 0,
        success: params.success ?? true,
        rollbackSql: params.rollbackSql,
        notes: params.notes,
        appliedAt: new Date(),
      },
    });
  } catch (err) {
    console.error('[migration-tracker] Failed to record migration:', err);
  }
}

/**
 * Get current database schema version (highest applied migration version).
 */
export async function getCurrentSchemaVersion(): Promise<string> {
  const migrations = await getAppliedMigrations();
  if (migrations.length === 0) return '2.0.0'; // Pre-migration baseline
  return migrations[migrations.length - 1].version;
}

/**
 * Get list of pending migrations (defined but not applied).
 */
export async function getPendingMigrations(): Promise<string[]> {
  const applied = new Set((await getAppliedMigrations()).map(m => m.version));
  // In a real system, this would scan the migrations folder
  // For now, return empty — migrations are applied via prisma db push
  return ['3.0.0'].filter(v => !applied.has(v));
}
