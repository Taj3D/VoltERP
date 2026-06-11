import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const results: Record<string, unknown> = {};

  // Test 1: Check env vars
  results.DATABASE_URL = process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 40) + '...' : 'NOT SET';
  results.JWT_SECRET = process.env.JWT_SECRET ? 'SET (' + process.env.JWT_SECRET.length + ' chars)' : 'NOT SET';
  results.DATABASE_AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN ? 'SET' : 'NOT SET';

  // Test 2: Try importing db
  try {
    const { db } = await import('@/lib/db');
    results.dbImport = 'OK';

    // Test 3: Try a simple query
    try {
      const count = await db.user.count();
      results.dbQuery = `OK (user count: ${count})`;
    } catch (queryErr: unknown) {
      results.dbQuery = `FAILED: ${queryErr instanceof Error ? queryErr.message : String(queryErr)}`;
      results.dbQueryStack = queryErr instanceof Error ? queryErr.stack?.substring(0, 500) : undefined;
    }
  } catch (dbErr: unknown) {
    results.dbImport = `FAILED: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`;
    results.dbImportStack = dbErr instanceof Error ? dbErr.stack?.substring(0, 800) : undefined;
  }

  // Test 4: Try importing api-security
  try {
    const security = await import('@/lib/api-security');
    results.apiSecurityImport = 'OK';
    results.withApiSecurity = typeof security.withApiSecurity;
  } catch (secErr: unknown) {
    results.apiSecurityImport = `FAILED: ${secErr instanceof Error ? secErr.message : String(secErr)}`;
    results.apiSecurityImportStack = secErr instanceof Error ? secErr.stack?.substring(0, 800) : undefined;
  }

  // Test 5: Try importing jwt-utils
  try {
    const jwt = await import('@/lib/jwt-utils');
    results.jwtUtilsImport = 'OK';
  } catch (jwtErr: unknown) {
    results.jwtUtilsImport = `FAILED: ${jwtErr instanceof Error ? jwtErr.message : String(jwtErr)}`;
    results.jwtUtilsImportStack = jwtErr instanceof Error ? jwtErr.stack?.substring(0, 800) : undefined;
  }

  return NextResponse.json(results, { status: 200 });
}
