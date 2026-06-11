// ============================================================
// AUDIT TRAIL API — Read-Only Timeline with Computed Fields
// Group 6: Core Performance Configurations & System Settings
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, type UserRole } from '@/lib/api-security';

// Compute relative time string (e.g., "2 hours ago", "3 days ago")
function timeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
  if (weeks < 5) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}

// Color code for timeline dot based on action type
function actionColor(action: string): string {
  switch (action.toUpperCase()) {
    case 'CREATE':
      return '#22c55e'; // green
    case 'UPDATE':
      return '#3b82f6'; // blue
    case 'DELETE':
      return '#ef4444'; // red
    case 'LOGIN':
      return '#8b5cf6'; // purple
    case 'LOGOUT':
      return '#6b7280'; // gray
    case 'EXPORT':
      return '#f59e0b'; // amber
    case 'IMPORT':
      return '#06b6d4'; // cyan
    default:
      return '#64748b'; // slate
  }
}

// Only mask truly profit-sensitive terms — VAT auditors need general financial data
function containsFinancialData(details: string | null): boolean {
  if (!details) return false;
  const lower = details.toLowerCase();
  return (
    lower.includes('profit') ||
    lower.includes('margin') ||
    lower.includes('costprice') ||
    lower.includes('wholesaleprice') ||
    lower.includes('dealerprice') ||
    lower.includes('writeoff')
  );
}

// GET /api/audit-trail — Read-only audit trail timeline
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'AuditTrail', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const userRole = security.user.role as UserRole;
    const isVatAuditor = userRole === 'vat_auditor';

    // Parse limit with bounds
    const rawLimit = parseInt(searchParams.get('limit') || '100', 10);
    const limit = Math.min(Math.max(1, rawLimit), 500);

    // Build where clause
    const where: Record<string, unknown> = {};

    // Module filter
    const moduleFilter = searchParams.get('module');
    if (moduleFilter) where.module = moduleFilter;

    // Action filter
    const actionFilter = searchParams.get('action');
    if (actionFilter) where.action = actionFilter;

    // User filter
    const userIdFilter = searchParams.get('userId');
    if (userIdFilter) where.userId = userIdFilter;

    // Date range filter
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    if (dateFrom || dateTo) {
      const createdAt: Record<string, Date> = {};
      if (dateFrom) createdAt.gte = new Date(dateFrom);
      if (dateTo) createdAt.lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
      where.createdAt = createdAt;
    }

    // Fuzzy search on recordLabel and details (case-insensitive for SQLite)
    const search = searchParams.get('search');
    if (search) {
      // SQLite doesn't support mode: 'insensitive' — use multiple OR conditions
      // with both lowercased search and original case
      const searchLower = search.toLowerCase();
      const searchUpper = search.toUpperCase();
      where.OR = [
        { recordLabel: { contains: search } },
        { recordLabel: { contains: searchLower } },
        { recordLabel: { contains: searchUpper } },
        { details: { contains: search } },
        { details: { contains: searchLower } },
        { details: { contains: searchUpper } },
        { userName: { contains: search } },
        { userName: { contains: searchLower } },
        { module: { contains: search } },
        { module: { contains: searchLower } },
      ];
    }

    // Fetch entries
    const [entries, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      db.auditLog.count({ where }),
    ]);

    // Compute enriched entries with timeAgo and actionColor
    const enriched = entries.map((entry: any) => {
      const result: Record<string, unknown> = {
        ...entry,
        timeAgo: timeAgo(entry.createdAt),
        actionColor: actionColor(entry.action),
      };

      // VAT Auditor: mask details containing financial data
      if (isVatAuditor && containsFinancialData(entry.details)) {
        result.details = 'N/A (Audit Mode)';
      }

      return result;
    });

    return NextResponse.json({
      entries: enriched,
      total,
      limit,
      filters: {
        module: moduleFilter || null,
        action: actionFilter || null,
        userId: userIdFilter || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        search: search || null,
      },
    });
  } catch (error) {
    console.error('AuditTrail GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch audit trail' }, { status: 500 });
  }
}

// No POST/PUT/DELETE — audit trail is immutable
