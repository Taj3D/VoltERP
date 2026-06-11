import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { db, DB_TYPE } = await import('@/lib/db');
    
    // Test basic query
    const userCount = await db.user.count();
    
    return NextResponse.json({
      status: 'connected',
      dbType: DB_TYPE,
      userCount,
      databaseUrl: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) + '...' : 'NOT SET',
      hasAuthToken: !!process.env.DATABASE_AUTH_TOKEN,
      nodeEnv: process.env.NODE_ENV,
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined,
      databaseUrl: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) + '...' : 'NOT SET',
      hasAuthToken: !!process.env.DATABASE_AUTH_TOKEN,
      nodeEnv: process.env.NODE_ENV,
    }, { status: 500 });
  }
}
