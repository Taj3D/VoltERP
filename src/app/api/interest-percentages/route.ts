// ============================================================
// Interest Percentages API — Multi-tenant CompanyId Isolation
// Module Token: Sys-Interest-Amortization
// Auto-code IP-XXXXX, text sanitization, percentage/type/range validation,
// active-rate lookup, batch mode
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const VALID_TYPES = ['HIRE_PURCHASE', 'TERM_LOAN', 'OVERDRAFT', 'CUSTOM'] as const;

function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')           // Strip HTML/XSS tags
    .replace(/javascript:/gi, '')       // Strip javascript: URIs
    .replace(/on\w+=/gi, '')           // Strip event handler attributes (onclick=, etc.)
    .replace(/\r\n/g, '\n')            // Normalize line breaks
    .replace(/\n{3,}/g, '\n\n')        // Collapse excessive newlines
    .replace(/  +/g, ' ')              // Collapse double spaces
    .trim();
}

// GET /api/interest-percentages — List all active interest rates filtered by companyId
// Special mode: ?mode=active-rate&type=X&amount=Y&duration=Z — best-matching active rate
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'InterestPercentages', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;
  const { searchParams } = new URL(request.url);

  try {
    // ── Active-rate lookup mode ──
    const mode = searchParams.get('mode');
    if (mode === 'active-rate') {
      const type = searchParams.get('type') || 'HIRE_PURCHASE';
      const amountStr = searchParams.get('amount');
      const durationStr = searchParams.get('duration');

      if (!amountStr || !durationStr) {
        return NextResponse.json(
          { error: 'amount and duration are required for active-rate mode' },
          { status: 400 }
        );
      }

      const amount = parseFloat(amountStr);
      const duration = parseInt(durationStr, 10);

      if (isNaN(amount) || isNaN(duration) || amount < 0 || duration < 0) {
        return NextResponse.json(
          { error: 'Invalid amount or duration parameter' },
          { status: 400 }
        );
      }

      const now = new Date();

      const bestRate = await db.interestPercentage.findFirst({
        where: {
          isActive: true,
          ...(companyId ? { companyId } : {}),
          type,
          effectiveDate: { lte: now },
          OR: [
            { expiryDate: null },
            { expiryDate: { gt: now } },
          ],
          minimumAmount: { lte: amount },
          AND: [
            {
              OR: [
                { maximumAmount: 0 },
                { maximumAmount: { gte: amount } },
              ],
            },
            {
              OR: [
                { durationMonthsMin: { lte: duration } },
              ],
            },
          ],
          durationMonthsMin: { lte: duration },
        },
        orderBy: { effectiveDate: 'desc' },
      });

      // Additional filter: durationMonthsMax check (0 = unlimited)
      let result = bestRate;
      if (bestRate && bestRate.durationMonthsMax > 0 && bestRate.durationMonthsMax < duration) {
        // The best match failed the max duration check, try broader search
        const candidates = await db.interestPercentage.findMany({
          where: {
            isActive: true,
            ...(companyId ? { companyId } : {}),
            type,
            effectiveDate: { lte: now },
            OR: [
              { expiryDate: null },
              { expiryDate: { gt: now } },
            ],
            minimumAmount: { lte: amount },
            durationMonthsMin: { lte: duration },
          },
          orderBy: { effectiveDate: 'desc' },
        });

        result = candidates.find((c) => {
          const amountOk = c.maximumAmount === 0 || c.maximumAmount >= amount;
          const durationOk = c.durationMonthsMax === 0 || c.durationMonthsMax >= duration;
          return amountOk && durationOk;
        }) || null;
      }

      if (!result) {
        return NextResponse.json(
          { error: 'No active interest rate found matching the specified criteria' },
          { status: 404 }
        );
      }

      return NextResponse.json(result);
    }

    // ── Standard list mode ──
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const items = await db.interestPercentage.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        company: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching interest percentages:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to fetch interest percentages' },
      { status: 500 }
    );
  }
}

// POST /api/interest-percentages — Create single or batch with companyId enforcement
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'InterestPercentages', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const body = await request.json();

    // ── Batch mode support ──
    if (body.batchMode === true && Array.isArray(body.data)) {
      const results = await db.$transaction(async (tx) => {
        const records: any[] = [];

        for (const item of body.data as Array<{
          percentage?: number;
          type?: string;
          effectiveDate?: string;
          expiryDate?: string;
          minimumAmount?: number;
          maximumAmount?: number;
          durationMonthsMin?: number;
          durationMonthsMax?: number;
          description?: string;
          isActive?: boolean;
        }>) {
          // Validate percentage
          if (item.percentage === undefined || item.percentage === null || item.percentage < 0 || item.percentage > 100) {
            continue; // Skip invalid percentage in batch
          }

          // Validate type
          const type = item.type || 'HIRE_PURCHASE';
          if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
            continue;
          }

          // Validate effectiveDate
          const effectiveDate = item.effectiveDate ? new Date(item.effectiveDate) : new Date();
          if (isNaN(effectiveDate.getTime())) {
            continue;
          }

          // Amount range validation
          const minimumAmount = item.minimumAmount ?? 0;
          const maximumAmount = item.maximumAmount ?? 0;
          if (minimumAmount > 0 && maximumAmount > 0 && minimumAmount > maximumAmount) {
            continue;
          }

          // Duration range validation
          const durationMonthsMin = item.durationMonthsMin ?? 0;
          const durationMonthsMax = item.durationMonthsMax ?? 0;
          if (durationMonthsMin > 0 && durationMonthsMax > 0 && durationMonthsMin > durationMonthsMax) {
            continue;
          }

          const sanitizedDescription = item.description ? sanitizeText(item.description) : null;

          // Auto-generate code with uniqueness check
          let code: string;
          let codeExists = true;
          let counter = await tx.interestPercentage.count();

          while (codeExists) {
            counter++;
            code = `IP-${String(counter).padStart(5, '0')}`;
            const existingCode = await tx.interestPercentage.findFirst({
              where: {
                code,
              },
            });
            if (!existingCode) {
              codeExists = false;
            }
          }

          const record = await tx.interestPercentage.create({
            data: {
              code: code!,
              percentage: item.percentage,
              type,
              effectiveDate,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
              minimumAmount,
              maximumAmount,
              durationMonthsMin,
              durationMonthsMax,
              description: sanitizedDescription,
              isActive: item.isActive ?? true,
              ...(companyId && { companyId }),
            },
          });

          records.push(record);
        }

        // Single audit log entry for the batch
        await logUserActivity({
          tx: tx,
          action: 'CREATE',
          module: 'Sys-Interest-Amortization',
          recordId: 'BATCH',
          recordLabel: `Batch import: ${records.length} interest rate(s)`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            count: records.length,
            types: records.map((r) => r.type),
            companyId,
          }),
        });

        return records;
      });

      return NextResponse.json(
        { success: true, count: results.length, data: results },
        { status: 201 }
      );
    }

    // ── Single record creation ──

    // Parse percentage (handle string input from forms)
    const percentage = parseFloat(String(body.percentage));
    if (body.percentage === undefined || body.percentage === null || isNaN(percentage) || percentage < 0 || percentage > 100) {
      return NextResponse.json(
        { error: 'Percentage must be between 0 and 100' },
        { status: 400 }
      );
    }

    // Validate type
    const type = body.type || 'HIRE_PURCHASE';
    if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
      return NextResponse.json(
        { error: `Type must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate effectiveDate
    const effectiveDate = body.effectiveDate ? new Date(body.effectiveDate) : new Date();
    if (isNaN(effectiveDate.getTime())) {
      return NextResponse.json(
        { error: 'effectiveDate must be a valid date' },
        { status: 400 }
      );
    }

    // Amount range validation (parse strings to numbers for safe comparison)
    const minimumAmount = parseFloat(String(body.minimumAmount ?? 0)) || 0;
    const maximumAmount = parseFloat(String(body.maximumAmount ?? 0)) || 0;
    if (minimumAmount > 0 && maximumAmount > 0 && minimumAmount > maximumAmount) {
      return NextResponse.json(
        { error: 'minimumAmount must be less than or equal to maximumAmount' },
        { status: 400 }
      );
    }

    // Duration range validation (parse strings to numbers for safe comparison)
    const durationMonthsMin = parseInt(String(body.durationMonthsMin ?? 0), 10) || 0;
    const durationMonthsMax = parseInt(String(body.durationMonthsMax ?? 0), 10) || 0;
    if (durationMonthsMin > 0 && durationMonthsMax > 0 && durationMonthsMin > durationMonthsMax) {
      return NextResponse.json(
        { error: 'durationMonthsMin must be less than or equal to durationMonthsMax' },
        { status: 400 }
      );
    }

    const sanitizedDescription = body.description ? sanitizeText(body.description) : null;

    const item = await db.$transaction(async (tx) => {
      // Auto-generate code with uniqueness check
      let code: string;
      let codeExists = true;
      let counter = await tx.interestPercentage.count();

      while (codeExists) {
        counter++;
        code = `IP-${String(counter).padStart(5, '0')}`;
        const existingCode = await tx.interestPercentage.findFirst({
          where: {
            code,
          },
        });
        if (!existingCode) {
          codeExists = false;
        }
      }

      const record = await tx.interestPercentage.create({
        data: {
          code: code!,
          percentage: percentage,
          type,
          effectiveDate,
          expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
          minimumAmount,
          maximumAmount,
          durationMonthsMin,
          durationMonthsMax,
          description: sanitizedDescription,
          isActive: body.isActive ?? true,
          ...(companyId && { companyId }),
        },
      });

      await logUserActivity({
          tx: tx,
        action: 'CREATE',
        module: 'Sys-Interest-Amortization',
        recordId: record.id,
        recordLabel: record.code || record.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          code: record.code,
          percentage: record.percentage,
          type: record.type,
          effectiveDate: record.effectiveDate,
          minimumAmount: record.minimumAmount,
          maximumAmount: record.maximumAmount,
          durationMonthsMin: record.durationMonthsMin,
          durationMonthsMax: record.durationMonthsMax,
          companyId,
        }),
      });

      return record;
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('Error creating interest percentage:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to create interest percentage' },
      { status: 500 }
    );
  }
}
