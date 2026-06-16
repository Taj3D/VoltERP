// ============================================================
// DB Test API — Admin-only database connectivity check
// SECURED: Requires admin authentication via withApiSecurity
// Removes sensitive data (URLs, stack traces) from response
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  // Auth check: Only admin can test DB connectivity
  const security = await withApiSecurity(request, 'SystemConfig', 'GET');
  if (!security.authorized) return security.response;

  if (security.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Access denied. Only administrators can test database connectivity.' },
      { status: 403 }
    );
  }

  const DATABASE_URL = process.env.DATABASE_URL || '';
  const DATABASE_AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN || '';

  try {
    const IS_TURSO = DATABASE_URL.startsWith('libsql://') || DATABASE_URL.startsWith('wss://');

    if (IS_TURSO) {
      const adapter = new PrismaLibSQL({
        url: DATABASE_URL,
        authToken: DATABASE_AUTH_TOKEN || undefined,
      });
      const prisma = new PrismaClient({ adapter, log: ['error'] });
      const userCount = await prisma.user.count();
      await prisma.$disconnect();

      return NextResponse.json({
        status: 'connected',
        dbType: 'Turso (libSQL)',
        prismaUserCount: userCount,
        // Sanitized: no URL prefix or auth token info exposed
      });
    }

    return NextResponse.json({
      status: 'error',
      error: 'Database is not configured for Turso',
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: 'Database connection failed',
      // No stack trace or URL info in response
    }, { status: 500 });
  }
}
