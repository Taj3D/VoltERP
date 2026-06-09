import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, needsRehash } from '@/lib/password-utils';

export async function POST() {
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
