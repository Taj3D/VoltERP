// ============================================================
// ADMIN SCHEMA MIGRATION ENDPOINT
// One-time endpoint to add missing columns to production Turso DB
// when Prisma schema has fields that haven't been pushed yet.
// Admin-only. Safe to run multiple times (uses IF NOT EXISTS where supported).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SystemConfig', 'POST');
  if (!security.authorized) return security.response;

  if (security.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only administrators can run schema migrations.' },
      { status: 403 }
    );
  }

  const results: Array<{ table: string; column: string; status: string; error?: string }> = [];

  // List of columns that need to exist based on current Prisma schema
  // Each entry: [table, column, columnDef]
  const migrations: Array<[string, string, string]> = [
    // Employee exam fields (for SMS triggers)
    ['Employee', 'examDate', 'DateTime'],
    ['Employee', 'examTime', 'String'],
    ['Employee', 'examVenue', 'String'],
    // Customer/InvestmentHead logoUrl (added in master audit)
    ['Customer', 'logoUrl', 'String'],
    ['InvestmentHead', 'logoUrl', 'String'],
    // Company logoUrl/brandLogoUrl (from Vercel Blob migration)
    ['Company', 'logoUrl', 'String'],
    ['Company', 'brandLogoUrl', 'String'],
  ];

  for (const [table, column, type] of migrations) {
    try {
      // Try to select the column; if it fails, it doesn't exist
      try {
        await (db as any).$queryRaw`SELECT ${column} FROM ${table} LIMIT 1`;
        results.push({ table, column, status: 'already_exists' });
      } catch {
        // Column doesn't exist — add it
        // Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN,
        // but we catch the error if it already exists
        try {
          await (db as any).$executeRawUnsafe(
            `ALTER TABLE "${table}" ADD COLUMN "${column}" ${type === 'DateTime' ? 'DATETIME' : type}`
          );
          results.push({ table, column, status: 'added' });
        } catch (addError: any) {
          if (addError?.message?.includes('duplicate column') || addError?.message?.includes('already exists')) {
            results.push({ table, column, status: 'already_exists' });
          } else {
            results.push({ table, column, status: 'error', error: addError?.message });
          }
        }
      }
    } catch (err: any) {
      results.push({ table, column, status: 'error', error: err?.message });
    }
  }

  const added = results.filter(r => r.status === 'added').length;
  const existing = results.filter(r => r.status === 'already_exists').length;
  const errors = results.filter(r => r.status === 'error').length;

  return NextResponse.json({
    success: true,
    summary: { added, alreadyExists: existing, errors, total: results.length },
    details: results,
  });
}
