// ============================================================
// Expense/Income Heads API — Double-Entry CoA Alignment
// Module Token: Fin-Expense-Head
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskFinancialArray,
  safeFinancialRound,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// GET /api/expense-income-heads — List all active heads with CoA link, query filters, VAT masking
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'ExpenseIncomeHeads', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const chartOfAccountId = searchParams.get('chartOfAccountId');

    const whereClause: Record<string, unknown> = {
      isActive: true,
      ...(companyId ? { companyId } : {}),
      ...(type ? { type } : {}),
      ...(chartOfAccountId ? { chartOfAccountId } : {}),
    };

    const items = await db.expenseIncomeHead.findMany({
      where: whereClause,
      include: {
        chartOfAccount: true,
        company: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor financial masking
    const masked = maskFinancialArray(items as Record<string, unknown>[], role);

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching expense/income heads:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expense/income heads' },
      { status: 500 }
    );
  }
}

// POST /api/expense-income-heads — Create single or batch with companyId enforcement, CoA linking, code generation
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'ExpenseIncomeHeads', 'POST');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const body = await request.json();

    // ── Batch mode support ──
    if (body.batchMode === true && Array.isArray(body.data)) {
      const results: unknown[] = [];
      const errors: string[] = [];

      for (let i = 0; i < body.data.length; i++) {
        try {
          const item = body.data[i] as Record<string, unknown>;
          const record = await createSingleHead(item, userId, userName, companyId);
          results.push(record);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`Row ${i + 1}: ${msg}`);
        }
      }

      return NextResponse.json(
        {
          success: true,
          imported: results.length,
          failed: errors.length,
          errors: errors.length > 0 ? errors : undefined,
          data: results,
        },
        { status: 201 }
      );
    }

    // ── Single record creation ──
    const result = await createSingleHead(body, userId, userName, companyId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating expense/income head:', error);
    const message = error instanceof Error ? error.message : 'Failed to create expense/income head';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Shared helper: create a single ExpenseIncomeHead with code auto-generation and CoA linking
 */
async function createSingleHead(
  body: Record<string, unknown>,
  userId: string,
  userName: string,
  companyId: string | null
) {
  const { name, type, chartOfAccountId } = body;

  if (!name || !type) {
    throw new Error('name and type are required');
  }

  if (!['Expense', 'Income'].includes(String(type))) {
    throw new Error('type must be "Expense" or "Income"');
  }

  // Validate CoA link if provided
  const effectiveCoAId = chartOfAccountId ? String(chartOfAccountId) : null;
  if (effectiveCoAId) {
    const coa = await db.chartOfAccount.findUnique({
      where: { id: effectiveCoAId },
      select: { classification: true, isActive: true },
    });
    if (!coa || !coa.isActive) {
      throw new Error(`Chart of Account with id ${effectiveCoAId} not found or inactive`);
    }
    // Validate classification matches head type
    const expectedClassification = String(type) === 'Expense' ? 'Expense' : 'Income';
    if (coa.classification !== expectedClassification) {
      throw new Error(
        `CoA classification mismatch: Head type "${String(type)}" requires CoA classification "${expectedClassification}", but found "${coa.classification}"`
      );
    }
  }

  return await db.$transaction(async (tx) => {
    // Auto-generate code as EIH-XXXXX (5-digit zero-padded) — collision-safe
    const allHeads = await tx.expenseIncomeHead.findMany({
      select: { code: true },
    });
    let maxNum = 0;
    for (const h of allHeads) {
      if (h.code) {
        const match = h.code.match(/EIH-(\d+)/);
        if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
    }
    const code = `EIH-${String(maxNum + 1).padStart(5, '0')}`;

    const record = await tx.expenseIncomeHead.create({
      data: {
        code,
        name: String(name),
        type: String(type),
        chartOfAccountId: effectiveCoAId,
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      include: {
        chartOfAccount: true,
        company: true,
      },
    });

    await tx.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'Fin-Expense-Head',
        recordId: record.id,
        recordLabel: record.name || record.id,
        userId,
        userName,
        details: JSON.stringify({
          code,
          name: record.name,
          type: record.type,
          chartOfAccountId: effectiveCoAId,
          companyId,
        }),
      },
    });

    await logUserActivity({
          tx: tx,
      action: 'CREATE',
      module: 'Fin-Expense-Head',
      recordId: record.id,
      recordLabel: code,
      userId,
      userName,
      details: `Created ${String(type)} head: ${String(name)} (${code})`,
    });

    return record;
  });
}
