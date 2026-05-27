// ============================================================
// COMPANY PROFILE API — Dynamic Tenant Data for Invoice/Report PDF Engines
// Returns the first active company's complete branding data
// Used by the client-side invoice-engine.ts and export-utils.ts
// to dynamically populate PDF headers, footers, and company info
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  // Company profile is needed for PDF generation, so allow all authenticated users
  // We use 'Companies' module for security check but accept any authenticated role
  const security = await withApiSecurity(request, 'Companies', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    // Fetch the active company profile
    const whereClause: Record<string, unknown> = { isActive: true };
    if (companyId) {
      whereClause.id = companyId;
    }

    const company = await db.company.findFirst({
      where: whereClause,
      select: {
        id: true,
        code: true,
        name: true,
        address: true,
        phone: true,
        email: true,
        mobile: true,
        website: true,
        logo: true,
        brandLogo: true,
        logoWidth: true,
        logoHeight: true,
        vatNumber: true,
        tradeLicense: true,
        invoicePrefix: true,
        thankYouMsg: true,
        systemNote: true,
        showBarcode: true,
        showPayInWord: true,
      },
      orderBy: { createdAt: 'asc' }, // First company is default
    });

    if (!company) {
      return NextResponse.json(
        {
          error: 'No active company profile found. Please set up your company in System Settings > Company Settings.',
          profile: null,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ profile: company });
  } catch (error) {
    console.error('Company Profile fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch company profile' },
      { status: 500 }
    );
  }
}
