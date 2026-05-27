import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, validateImageFields } from '@/lib/api-security';

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
  try {
    const body = await request.json();
    const imgError = validateImageFields(body, ['logo', 'brandLogo']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });
    const item = await db.$transaction(async (tx) => {
      // Auto-generate code
      const count = await tx.company.count();
      const code = `COM-${String(count + 1).padStart(5, '0')}`;

      const record = await tx.company.create({
        data: {
          code,
          name: body.name,
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
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 });
  }
}
