import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, needsRehash } from '@/lib/password-utils';
import { withApiSecurity } from '@/lib/api-security';

export async function POST(request: NextRequest) {
  // RBAC: Only admin can trigger password migration
  // Note: Using 'SystemConfig' module (NOT 'Auth') because 'Auth' is in AUTH_EXEMPT_MODULES
  // which would bypass all authentication checks.
  const security = await withApiSecurity(request, 'SystemConfig', 'POST');
  if (!security.authorized) return security.response;

  // Additional check: only admin role can migrate passwords
  if (security.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only administrators can trigger password migration.' },
      { status: 403 }
    );
  }

  try {
    const users = await db.user.findMany({
      select: { id: true, email: true, password: true }
    });

    let migrated = 0;
    let skipped = 0;

    for (const user of users) {
      if (needsRehash(user.password)) {
        const hashedPassword = await hashPassword(user.password);
        await db.user.update({
          where: { id: user.id },
          data: { password: hashedPassword }
        });
        migrated++;
      } else {
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      migrated,
      skipped,
      total: users.length
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Migration failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
