// ============================================================
// Companies API — Multi-tenant CompanyId Isolation
// Module Token: Sys-Catalog-Core
// Phase 8: companyId filtering, case-insensitive unique check,
//          text sanitizer, batchMode support
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, validateImageFields } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ── Text Sanitizer ──
function sanitizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  let cleaned = value.trim();
  cleaned = cleaned.replace(/<[^>]*>/g, ''); // Strip HTML tags
  cleaned = cleaned.replace(/\s{2,}/g, ' '); // Collapse double/triple spaces
  return cleaned;
}

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Companies', 'GET');
  if (!security.authorized) return security.response;

  try {
    const items = await db.company.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { products: true, orderSheets: true } },
      },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Companies', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId; // Used for audit logging only; Company is a root entity

  try {
    const body = await request.json();
    const imgError = validateImageFields(body, ['logo', 'brandLogo']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });

    // ── Batch mode support ──
    if (body.batchMode === true && Array.isArray(body.data)) {
      const records = await db.$transaction(async (tx) => {
        const created: any[] = [];

        for (const item of body.data) {
          const sanitizedName = sanitizeText(item.name);

          if (!sanitizedName) {
            throw new Error('DUPLICATE_NAME: Company name cannot be empty after sanitization.');
          }

          // Case-insensitive unique check (SQLite-compatible)
          const existingNames = await tx.company.findMany({
            where: { isActive: true },
            select: { id: true, name: true },
          });
          const existing = existingNames.find(e => e.name.toLowerCase() === sanitizedName.toLowerCase());

          if (existing) {
            throw new Error(`DUPLICATE_NAME: A company with the name "${sanitizedName}" already exists.`);
          }

          // Auto-generate code (find max code across ALL records including soft-deleted)
          const allCompanies = await tx.company.findMany({
            select: { code: true },
          });
          let maxNum = 0;
          for (const comp of allCompanies) {
            const match = comp.code.match(/COM-(\d+)/);
            if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
          }
          const code = `COM-${String(maxNum + 1 + created.length).padStart(5, '0')}`;

          const record = await tx.company.create({
            data: {
              code,
              name: sanitizedName,
              address: item.address || null,
              phone: item.phone || null,
              email: item.email || null,
              logo: item.logo || null,
              brandLogo: item.brandLogo || null,
              mobile: item.mobile || null,
              website: item.website || null,
              vatNumber: item.vatNumber || null,
              tradeLicense: item.tradeLicense || null,
              invoicePrefix: item.invoicePrefix || null,
              thankYouMsg: item.thankYouMsg || null,
              systemNote: item.systemNote || null,
              showBarcode: item.showBarcode !== undefined ? item.showBarcode : true,
              showPayInWord: item.showPayInWord !== undefined ? item.showPayInWord : true,
              logoWidth: item.logoWidth ? parseFloat(String(item.logoWidth)) : 30,
              logoHeight: item.logoHeight ? parseFloat(String(item.logoHeight)) : 20,
              isActive: item.isActive ?? true,
            },
          });

          created.push(record);
        }

        return created;
      });

      // Single audit log entry for the batch
      await logUserActivity({
        action: 'CREATE',
        module: 'Sys-Catalog-Core',
        recordId: 'BATCH',
        recordLabel: `Batch import: ${records.length} compan(y/ies)`,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          count: records.length,
          names: records.map((r: any) => r.name),
          companyId,
        }),
      });

      return NextResponse.json(
        { success: true, count: records.length, data: records },
        { status: 201 }
      );
    }

    // ── Single record creation ──
    const sanitizedName = sanitizeText(body.name);

    if (!sanitizedName) {
      return NextResponse.json(
        { error: 'Company name cannot be empty after sanitization.' },
        { status: 400 }
      );
    }

    const item = await db.$transaction(async (tx) => {
      // Case-insensitive unique check (SQLite-compatible)
      const existingNames = await tx.company.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });
      const existing = existingNames.find(e => e.name.toLowerCase() === sanitizedName.toLowerCase());

      if (existing) {
        throw new Error(`DUPLICATE_NAME: A company with the name "${sanitizedName}" already exists.`);
      }

      // Auto-generate code if not provided (find max code across ALL records including soft-deleted)
      let code = body.code;
      if (!code) {
        const allCompanies = await tx.company.findMany({
          select: { code: true },
        });
        let maxNum = 0;
        for (const comp of allCompanies) {
          const match = comp.code.match(/COM-(\d+)/);
          if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
        }
        code = `COM-${String(maxNum + 1).padStart(5, '0')}`;
      }

      const record = await tx.company.create({
        data: {
          code,
          name: sanitizedName,
          address: body.address || null,
          phone: body.phone || null,
          email: body.email || null,
          logo: body.logo || null,
          brandLogo: body.brandLogo || null,
          mobile: body.mobile || null,
          website: body.website || null,
          vatNumber: body.vatNumber || null,
          tradeLicense: body.tradeLicense || null,
          invoicePrefix: body.invoicePrefix || null,
          thankYouMsg: body.thankYouMsg || null,
          systemNote: body.systemNote || null,
          showBarcode: body.showBarcode !== undefined ? body.showBarcode : true,
          showPayInWord: body.showPayInWord !== undefined ? body.showPayInWord : true,
          logoWidth: body.logoWidth ? parseFloat(String(body.logoWidth)) : 30,
          logoHeight: body.logoHeight ? parseFloat(String(body.logoHeight)) : 20,
          isActive: body.isActive ?? true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Companies',
          recordId: record.id,
          recordLabel: record.name || record.code || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ code: record.code, name: record.name }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    if (error instanceof Error && error.message.startsWith('DUPLICATE_NAME')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create company' }, { status: 500 });
  }
}
