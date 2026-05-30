// ============================================================
// COMPANY BRANDING API — Active Company Profile for Invoice Generation
// Returns the first active company's branding data (logo, name,
// address, phone, mobile, etc.) used by invoice-engine.ts to
// dynamically populate invoice headers.
// Read-only public endpoint for PDF generation — no auth required.
// ============================================================

import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/company-branding
// Returns the first active company's branding data for invoice generation
export async function GET() {
  try {
    const company = await db.company.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        mobile: true,
        email: true,
        website: true,
        logo: true,
        brandLogo: true,
        logoData: true,
        logoWidth: true,
        logoHeight: true,
        vatNumber: true,
        tradeLicense: true,
        binNumber: true,
        currencySymbol: true,
        invoicePrefix: true,
        thankYouMsg: true,
        systemNote: true,
        showBarcode: true,
        showPayInWord: true,
      },
    });

    if (!company) {
      return NextResponse.json(
        { error: 'No active company profile found. Please configure company settings.' },
        { status: 404 }
      );
    }

    // Return company branding data matching CompanyProfile interface
    return NextResponse.json({
      company: {
        id: company.id,
        name: company.name,
        address: company.address,
        phone: company.phone,
        mobile: company.mobile,
        email: company.email,
        website: company.website,
        logo: company.logo,
        brandLogo: company.brandLogo,
        logoData: company.logoData,
        logoWidth: company.logoWidth,
        logoHeight: company.logoHeight,
        vatNumber: company.vatNumber,
        tradeLicense: company.tradeLicense,
        binNumber: company.binNumber,
        currencySymbol: company.currencySymbol,
        invoicePrefix: company.invoicePrefix,
        thankYouMsg: company.thankYouMsg,
        systemNote: company.systemNote,
        showBarcode: company.showBarcode,
        showPayInWord: company.showPayInWord,
      },
    });
  } catch (error) {
    console.error('CompanyBranding GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch company branding data' },
      { status: 500 }
    );
  }
}
