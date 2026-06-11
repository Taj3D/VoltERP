import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

export async function GET() {
  const DATABASE_URL = process.env.DATABASE_URL || '';
  const DATABASE_AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN || '';

  try {
    const IS_TURSO = DATABASE_URL.startsWith('libsql://') || DATABASE_URL.startsWith('wss://');

    if (IS_TURSO) {
      // Use PrismaLibSQL with config object (correct adapter pattern)
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
        urlPrefix: DATABASE_URL.substring(0, 35) + '...',
        hasAuthToken: !!DATABASE_AUTH_TOKEN,
      });
    }

    return NextResponse.json({
      status: 'error',
      error: 'Not a Turso URL',
      urlPrefix: DATABASE_URL.substring(0, 35) + '...',
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.substring(0, 800) : undefined,
      urlPrefix: DATABASE_URL.substring(0, 35) + '...',
      hasAuthToken: !!DATABASE_AUTH_TOKEN,
      urlType: typeof DATABASE_URL,
      urlLength: DATABASE_URL.length,
    }, { status: 500 });
  }
}
