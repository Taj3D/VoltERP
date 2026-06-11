import { db, DB_TYPE } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

const IS_TURSO = DB_TYPE.includes('Turso');

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SystemConfig', 'GET');
  if (!security.authorized) return security.response;

  try {
    if (IS_TURSO) {
      // ── Turso health check (no PRAGMA/sqlite_master support) ──
      const keyTableCounts = await Promise.all([
        db.product.count({ where: { isActive: true } }),
        db.customer.count({ where: { isActive: true } }),
        db.supplier.count({ where: { isActive: true } }),
        db.salesOrder.count({ where: { isActive: true } }),
        db.purchaseOrder.count({ where: { isActive: true } }),
        db.employee.count({ where: { isActive: true } }),
      ]);

      return NextResponse.json({
        status: 'connected',
        dbType: DB_TYPE,
        dbSizeMB: 'N/A (cloud)',
        dbSizeBytes: 0,
        tableCount: 'N/A (cloud)',
        integrity: 'ok',
        journalMode: 'N/A (cloud)',
        busyTimeoutMs: 0,
        keyRecords: {
          products: keyTableCounts[0],
          customers: keyTableCounts[1],
          suppliers: keyTableCounts[2],
          salesOrders: keyTableCounts[3],
          purchaseOrders: keyTableCounts[4],
          employees: keyTableCounts[5],
        },
        checkedAt: new Date().toISOString(),
      });
    }

    // ── Local SQLite health check (with PRAGMA support) ──
    const [
      tableCountResult,
      dbSizeResult,
      integrityCheck,
      walMode,
      activeConnections,
    ] = await Promise.all([
      db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_migrations'
      `,
      db.$queryRaw<Array<{ page_count: bigint; page_size: bigint }>>`
        SELECT page_count, page_size FROM pragma_page_count(), pragma_page_size()
      `,
      db.$queryRaw<Array<{ integrity_check: string }>>`
        PRAGMA integrity_check
      `,
      db.$queryRaw<Array<{ journal_mode: string }>>`
        PRAGMA journal_mode
      `,
      db.$queryRaw<Array<{ busy_timeout: bigint }>>`
        PRAGMA busy_timeout
      `,
    ]);

    const tableCount = Number(tableCountResult[0]?.count ?? 0);
    const pageCount = Number(dbSizeResult[0]?.page_count ?? 0);
    const pageSize = Number(dbSizeResult[0]?.page_size ?? 0);
    const dbSizeBytes = pageCount * pageSize;
    const dbSizeMB = (dbSizeBytes / (1024 * 1024)).toFixed(2);
    const isHealthy = integrityCheck[0]?.integrity_check === 'ok';
    const journalMode = walMode[0]?.journal_mode ?? 'unknown';
    const busyTimeout = Number(activeConnections[0]?.busy_timeout ?? 0);

    const keyTableCounts = await Promise.all([
      db.product.count({ where: { isActive: true } }),
      db.customer.count({ where: { isActive: true } }),
      db.supplier.count({ where: { isActive: true } }),
      db.salesOrder.count({ where: { isActive: true } }),
      db.purchaseOrder.count({ where: { isActive: true } }),
      db.employee.count({ where: { isActive: true } }),
    ]);

    return NextResponse.json({
      status: isHealthy ? 'connected' : 'degraded',
      dbType: DB_TYPE,
      dbSizeMB: `${dbSizeMB} MB`,
      dbSizeBytes,
      tableCount,
      integrity: isHealthy ? 'ok' : 'issues detected',
      journalMode,
      busyTimeoutMs: busyTimeout,
      pageCount,
      pageSize,
      keyRecords: {
        products: keyTableCounts[0],
        customers: keyTableCounts[1],
        suppliers: keyTableCounts[2],
        salesOrders: keyTableCounts[3],
        purchaseOrders: keyTableCounts[4],
        employees: keyTableCounts[5],
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[SystemHealth] Error:', error);
    return NextResponse.json({
      status: 'error',
      dbType: DB_TYPE,
      error: error instanceof Error ? error.message : 'Unknown error',
      checkedAt: new Date().toISOString(),
    }, { status: 500 });
  }
}
