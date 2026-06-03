// ============================================================
// Godowns Routing Status API — Warehouse Routing Parameter Matrix
// Module Token: Sys-Structure-Matrix
// GET /api/godowns/routing-status — Returns routing parameters
// for all warehouses in the current company
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/godowns/routing-status — Warehouse routing status matrix
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Godowns', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    // Fetch all active godowns for the company
    const godowns = await db.godown.findMany({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { code: 'asc' },
      include: {
        _count: { select: { products: true } },
      },
    });

    // For each godown, count pending operations in parallel
    const routingStatus = await Promise.all(
      godowns.map(async (godown) => {
        const godownId = godown.id;

        // Pending Purchase Orders: status != "Received" and status != "Cancelled"
        const pendingPurchaseOrders = await db.purchaseOrder.count({
          where: {
            godownId,
            isActive: true,
            status: { notIn: ['Received', 'Cancelled'] },
            ...(companyId ? { companyId } : {}),
          },
        });

        // Pending Sales Orders: status != "Delivered" and status != "Cancelled"
        const pendingSalesOrders = await db.salesOrder.count({
          where: {
            godownId,
            isActive: true,
            status: { notIn: ['Delivered', 'Cancelled'] },
            ...(companyId ? { companyId } : {}),
          },
        });

        // Pending Hire Sales: currentStatus != "Completed" and currentStatus != "Cancelled"
        const pendingHireSales = await db.hireSales.count({
          where: {
            godownId,
            isActive: true,
            currentStatus: { notIn: ['Completed', 'Cancelled'] },
            ...(companyId ? { companyId } : {}),
          },
        });

        // Pending Stock Transfers FROM or TO this godown:
        // status != "Completed" and status != "Cancelled"
        const [pendingTransfersFrom, pendingTransfersTo] = await Promise.all([
          db.stockTransfer.count({
            where: {
              fromGodownId: godownId,
              isActive: true,
              status: { notIn: ['Completed', 'Cancelled'] },
            },
          }),
          db.stockTransfer.count({
            where: {
              toGodownId: godownId,
              isActive: true,
              status: { notIn: ['Completed', 'Cancelled'] },
            },
          }),
        ]);

        const pendingTransfers = pendingTransfersFrom + pendingTransfersTo;

        return {
          id: godown.id,
          code: godown.code,
          name: godown.name,
          status: godown.status,
          productCount: godown._count.products,
          pendingPurchaseOrders,
          pendingSalesOrders,
          pendingHireSales,
          pendingTransfers,
          isReceivable: godown.status === 'ACTIVE',
          isDispatchable: godown.status === 'ACTIVE',
        };
      })
    );

    return NextResponse.json(routingStatus);
  } catch (error) {
    console.error(
      'Error fetching godown routing status:',
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: 'Failed to fetch godown routing status' },
      { status: 500 }
    );
  }
}
