import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor, safeFinancialRound } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const nullIfEmpty = (v: string | undefined | null) => (!v || !v.trim()) ? null : v.trim();

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Designations', 'GET');
  if (!security.authorized) return security.response;
  try {
    const companyId = security.user.companyId;
    const items = await db.designation.findMany({
      where: { ...(companyId ? { companyId, isActive: true } : { isActive: true }) },
      orderBy: { createdAt: 'desc' },
      include: { department: true, _count: { select: { employees: true } } },
    });

    // VAT Auditor masking: hide salary band values
    const maskedItems = items.map(item => {
      if (security.user.role === 'vat_auditor') {
        return maskForVatAuditor(item, security.user.role, ['salaryBandMin', 'salaryBandMax']);
      }
      return item;
    });

    return NextResponse.json(maskedItems);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch designations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Designations', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const companyId = security.user.companyId;
    const userId = security.user.id;
    const userName = security.user.name;

    // Batch mode support for CSV import
    if (body.batchMode === true && Array.isArray(body.data)) {
      const results: unknown[] = [];
      const errors: string[] = [];

      for (let i = 0; i < body.data.length; i++) {
        const row = body.data[i];
        try {
          // Validate salaryBandMax >= salaryBandMin
          if (row.salaryBandMax !== undefined && row.salaryBandMin !== undefined &&
              Number(row.salaryBandMax) < Number(row.salaryBandMin)) {
            errors.push(`Row ${i + 1}: salaryBandMax must be >= salaryBandMin`);
            continue;
          }

          const record = await db.$transaction(async (tx) => {
            // Auto-generate DSG-XXXXX code
            let code = row.code;
            if (!code) {
              const allRecords = await tx.designation.findMany({ select: { code: true } });
              let nextNum = 1;
              for (const r of allRecords) {
                const match = r.code?.match(/DSG-(\d+)/);
                if (match) nextNum = Math.max(nextNum, parseInt(match[1]) + 1);
              }
              code = `DSG-${String(nextNum).padStart(5, '0')}`;
            }

            const created = await tx.designation.create({
              data: {
                code,
                name: row.name,
                departmentId: row.departmentId,
                gradeLevel: nullIfEmpty(row.gradeLevel),
                salaryBandMin: safeFinancialRound(Number(row.salaryBandMin ?? 0)),
                salaryBandMax: safeFinancialRound(Number(row.salaryBandMax ?? 0)),
                description: nullIfEmpty(row.description),
                isActive: row.isActive ?? true,
                ...(companyId && { companyId }),
              },
              include: { department: true, _count: { select: { employees: true } } },
            });

            return created;
          });

          results.push(record);
        } catch (err) {
          errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // Single batch activity log
      await logUserActivity({
        action: 'IMPORT',
        module: 'HR-Personnel-Core',
        recordId: 'BATCH',
        recordLabel: `Batch import: ${results.length} designations`,
        userId,
        userName,
        details: JSON.stringify({ total: body.data.length, created: results.length, errors: errors.length }),
      });

      return NextResponse.json({ created: results, errors }, { status: 201 });
    }

    // Single mode: Validate salaryBandMax >= salaryBandMin
    if (body.salaryBandMax !== undefined && body.salaryBandMin !== undefined &&
        Number(body.salaryBandMax) < Number(body.salaryBandMin)) {
      return NextResponse.json(
        { error: 'salaryBandMax must be greater than or equal to salaryBandMin' },
        { status: 400 }
      );
    }

    const item = await db.$transaction(async (tx) => {
      // Auto-generate DSG-XXXXX code
      let code = body.code;
      if (!code) {
        const allRecords = await tx.designation.findMany({ select: { code: true } });
        let nextNum = 1;
        for (const r of allRecords) {
          const match = r.code?.match(/DSG-(\d+)/);
          if (match) nextNum = Math.max(nextNum, parseInt(match[1]) + 1);
        }
        code = `DSG-${String(nextNum).padStart(5, '0')}`;
      }

      const record = await tx.designation.create({
        data: {
          code,
          name: body.name,
          departmentId: body.departmentId,
          gradeLevel: nullIfEmpty(body.gradeLevel),
          salaryBandMin: safeFinancialRound(Number(body.salaryBandMin ?? 0)),
          salaryBandMax: safeFinancialRound(Number(body.salaryBandMax ?? 0)),
          description: nullIfEmpty(body.description),
          isActive: body.isActive ?? true,
          ...(companyId && { companyId }),
        },
        include: { department: true, _count: { select: { employees: true } } },
      });

      await logUserActivity({
          tx: tx,
        action: 'CREATE',
        module: 'HR-Personnel-Core',
        recordId: record.id,
        recordLabel: `${record.code} - ${record.name}`,
        userId,
        userName,
        details: JSON.stringify({
          code: record.code,
          name: record.name,
          departmentId: record.departmentId,
          gradeLevel: record.gradeLevel,
          salaryBandMin: record.salaryBandMin,
          salaryBandMax: record.salaryBandMax,
        }),
      });

      return record;
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create designation' }, { status: 500 });
  }
}
