// ============================================================
// Expense/Income Heads API — Multi-tenant CompanyId Isolation
// Module Token: Fin-Expense-Head
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/expense-income-heads — List all active heads filtered by companyId
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'ExpenseIncomeHeads', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const items = await db.expenseIncomeHead.findMany({
      where: companyId ? { companyId, isActive: true } : { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching expense/income heads:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expense/income heads' },
      { status: 500 }
    );
  }
}

// POST /api/expense-income-heads — Create single or batch with companyId enforcement
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'ExpenseIncomeHeads', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const body = await request.json();

    // ── Batch mode support ──
    if (body.batchMode === true && Array.isArray(body.data)) {
      const records = await db.$transaction(
        body.data.map((item: { name?: string; type?: string; isActive?: boolean }) =>
          db.expenseIncomeHead.create({
            data: {
              name: item.name,
              type: item.type,
              isActive: item.isActive ?? true,
              ...(companyId && { companyId }),
            },
          })
        )
      );

      // Single audit log entry for the batch
      await db.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Fin-Expense-Head',
          recordId: 'BATCH',
          recordLabel: `Batch import: ${records.length} expense/income head(s)`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            count: records.length,
            names: records.map((r: { name: string }) => r.name),
            companyId,
          }),
        },
      });

      return NextResponse.json(
        { success: true, count: records.length, data: records },
        { status: 201 }
      );
    }

    // ── Single record creation ──
    const item = await db.$transaction(async (tx) => {
      const record = await tx.expenseIncomeHead.create({
        data: {
          name: body.name,
          type: body.type,
          isActive: body.isActive ?? true,
          ...(companyId && { companyId }),
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Fin-Expense-Head',
          recordId: record.id,
          recordLabel: record.name || record.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ name: record.name, type: record.type, companyId }),
        },
      });

      return record;
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('Error creating expense/income head:', error);
    return NextResponse.json(
      { error: 'Failed to create expense/income head' },
      { status: 500 }
    );
  }
}
