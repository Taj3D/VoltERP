import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  validateImageFields,
  safeFinancialRound,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const AUDIT_MODULE = 'Inv-Asset-Ledger';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;

    const items = await db.investmentHead.findMany({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { assets: true, liabilities: true } },
      },
    });

    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch investment heads' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    // ── Batch mode support ──
    if (body.batchMode && Array.isArray(body.data)) {
      const results = await db.$transaction(async (tx) => {
        const created: unknown[] = [];
        for (const item of body.data) {
          const imgError = validateImageFields(item, ['profileImage', 'nidFrontImage', 'nidBackImage']);
          if (imgError) throw new Error(imgError);

          // Validate financial fields
          if (item.openingBalance !== undefined && item.openingBalance !== null && Number(item.openingBalance) < 0) {
            throw new Error('openingBalance must be >= 0');
          }
          if (item.sharePercentage !== undefined && item.sharePercentage !== null) {
            const sp = Number(item.sharePercentage);
            if (sp <= 0 || sp > 100) {
              throw new Error('sharePercentage must be > 0 and <= 100');
            }
          }
          if (item.capitalValue !== undefined && item.capitalValue !== null) {
            const cv = Number(item.capitalValue);
            if (cv <= 0) {
              throw new Error('capitalValue must be > 0');
            }
          }

          const count = await tx.investmentHead.count();
          const code = `INVH-${String(count + 1).padStart(5, '0')}`;

          const record = await tx.investmentHead.create({
            data: {
              code,
              name: item.name,
              description: item.description || null,
              type: item.type || 'Liability',
              openingBalance: item.openingBalance !== undefined ? safeFinancialRound(Number(item.openingBalance)) : 0,
              openingType: item.openingType || '',
              sharePercentage: item.sharePercentage !== undefined && item.sharePercentage !== null ? safeFinancialRound(Number(item.sharePercentage)) : null,
              capitalValue: item.capitalValue !== undefined && item.capitalValue !== null ? safeFinancialRound(Number(item.capitalValue)) : null,
              profileImage: item.profileImage || null,
              nidFrontImage: item.nidFrontImage || null,
              nidBackImage: item.nidBackImage || null,
              isActive: item.isActive ?? true,
              ...(companyId && { companyId }),
            },
          });

          created.push(record);
        }

        await tx.auditLog.create({
          data: {
            action: 'CREATE',
            module: AUDIT_MODULE,
            recordId: 'BATCH',
            recordLabel: `Batch: ${created.length} investment heads`,
            userId: security.user.id,
            userName: security.user.name,
            details: JSON.stringify({ count: created.length, batchMode: true }),
          },
        });

        return created;
      });

      await logUserActivity({
        action: 'CREATE',
        module: AUDIT_MODULE,
        recordId: 'BATCH',
        recordLabel: `Batch: ${results.length} investment heads`,
        userId: security.user.id,
        userName: security.user.name,
        details: `Created ${results.length} investment heads in batch`,
      });

      return NextResponse.json(results, { status: 201 });
    }

    // ── Single mode ──
    const imgError = validateImageFields(body, ['profileImage', 'nidFrontImage', 'nidBackImage']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });

    // Validate financial fields
    if (body.openingBalance !== undefined && body.openingBalance !== null && Number(body.openingBalance) < 0) {
      return NextResponse.json({ error: 'openingBalance must be >= 0' }, { status: 400 });
    }
    if (body.sharePercentage !== undefined && body.sharePercentage !== null) {
      const sp = Number(body.sharePercentage);
      if (sp <= 0 || sp > 100) {
        return NextResponse.json({ error: 'sharePercentage must be > 0 and <= 100' }, { status: 400 });
      }
    }
    if (body.capitalValue !== undefined && body.capitalValue !== null) {
      const cv = Number(body.capitalValue);
      if (cv <= 0) {
        return NextResponse.json({ error: 'capitalValue must be > 0' }, { status: 400 });
      }
    }

    const item = await db.$transaction(async (tx) => {
      const count = await tx.investmentHead.count();
      const code = `INVH-${String(count + 1).padStart(5, '0')}`;

      const record = await tx.investmentHead.create({
        data: {
          code,
          name: body.name,
          description: body.description || null,
          type: body.type || 'Liability',
          openingBalance: body.openingBalance !== undefined ? safeFinancialRound(Number(body.openingBalance)) : 0,
          openingType: body.openingType || '',
          sharePercentage: body.sharePercentage !== undefined && body.sharePercentage !== null ? safeFinancialRound(Number(body.sharePercentage)) : null,
          capitalValue: body.capitalValue !== undefined && body.capitalValue !== null ? safeFinancialRound(Number(body.capitalValue)) : null,
          profileImage: body.profileImage || null,
          nidFrontImage: body.nidFrontImage || null,
          nidBackImage: body.nidBackImage || null,
          isActive: body.isActive ?? true,
          ...(companyId && { companyId }),
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: AUDIT_MODULE,
          recordId: record.id,
          recordLabel: record.name || record.code || record.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ code: record.code, name: record.name, type: record.type }),
        },
      });

      return record;
    });

    await logUserActivity({
      action: 'CREATE',
      module: AUDIT_MODULE,
      recordId: item.id,
      recordLabel: item.name || item.code || item.id,
      userId: security.user.id,
      userName: security.user.name,
      details: `Created investment head: ${item.name || item.code}`,
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('must be')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create investment head' }, { status: 500 });
  }
}
