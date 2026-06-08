// ============================================================
// COMPANY BRANDING API — Active Company Profile for Invoice Generation
// Returns the first active company's branding data (logo, name,
// address, phone, mobile, etc.) used by invoice-engine.ts to
// dynamically populate invoice headers.
// GET: Public endpoint for PDF generation — no auth required.
// PUT: Admin-only endpoint for updating company branding.
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, validateImageFields, stripHtml } from '@/lib/api-security';

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
    });

    if (!company) {
      return NextResponse.json(
        { error: 'No active company profile found. Please configure company settings.' },
        { status: 404 }
      );
    }

    // Return company branding data matching InvoiceCompanyProfile interface
    return NextResponse.json({
      company: {
        id: company.id,
        name: company.name,
        address: company.address,
        phone: company.phone,
        mobile: company.mobile,
        email: company.email,
        logo: company.logo,
        brandLogo: company.brandLogo,
        logoWidth: company.logoWidth,
        logoHeight: company.logoHeight,
        vatNumber: company.vatNumber,
        tradeLicense: company.tradeLicense,
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

// PUT /api/company-branding
// Updates the first active company's branding data — Admin role required
export async function PUT(request: NextRequest) {
  const security = await withApiSecurity(request, 'Companies', 'PUT');
  if (!security.authorized) return security.response;

  // Enforce Admin-only access for company branding
  const userRole = (security.user as any)?.role;
  if (userRole !== 'admin') {
    return NextResponse.json(
      { error: 'Company branding can only be modified by Admin users.' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    // Sanitize text fields to prevent XSS
    if (body.name) body.name = stripHtml(body.name);
    if (body.address) body.address = stripHtml(body.address);
    if (body.phone) body.phone = stripHtml(body.phone);
    if (body.mobile) body.mobile = stripHtml(body.mobile);
    if (body.email) body.email = stripHtml(body.email);
    if (body.vatNumber) body.vatNumber = stripHtml(body.vatNumber);
    if (body.tradeLicense) body.tradeLicense = stripHtml(body.tradeLicense);
    if (body.invoicePrefix) body.invoicePrefix = stripHtml(body.invoicePrefix);
    if (body.thankYouMsg) body.thankYouMsg = stripHtml(body.thankYouMsg);
    if (body.systemNote) body.systemNote = stripHtml(body.systemNote);

    // Validate image fields
    const imgError = validateImageFields(body, ['logo', 'brandLogo']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });

    // Find the first active company
    const company = await db.company.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!company) {
      return NextResponse.json(
        { error: 'No active company profile found to update.' },
        { status: 404 }
      );
    }

    // Update the company branding fields
    const updated = await db.$transaction(async (tx) => {
      const record = await tx.company.update({
        where: { id: company.id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.address !== undefined && { address: body.address || null }),
          ...(body.phone !== undefined && { phone: body.phone || null }),
          ...(body.mobile !== undefined && { mobile: body.mobile || null }),
          ...(body.email !== undefined && { email: body.email || null }),
          ...(body.website !== undefined && { website: body.website || null }),
          ...(body.logo !== undefined && { logo: body.logo || null }),
          ...(body.brandLogo !== undefined && { brandLogo: body.brandLogo || null }),
          ...(body.logoWidth !== undefined && { logoWidth: parseFloat(String(body.logoWidth)) || 30 }),
          ...(body.logoHeight !== undefined && { logoHeight: parseFloat(String(body.logoHeight)) || 20 }),
          ...(body.vatNumber !== undefined && { vatNumber: body.vatNumber || null }),
          ...(body.tradeLicense !== undefined && { tradeLicense: body.tradeLicense || null }),
          ...(body.invoicePrefix !== undefined && { invoicePrefix: body.invoicePrefix || null }),
          ...(body.thankYouMsg !== undefined && { thankYouMsg: body.thankYouMsg || null }),
          ...(body.systemNote !== undefined && { systemNote: body.systemNote || null }),
          ...(body.showBarcode !== undefined && { showBarcode: body.showBarcode }),
          ...(body.showPayInWord !== undefined && { showPayInWord: body.showPayInWord }),
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'CompanyBranding',
          recordId: record.id,
          recordLabel: record.name || record.code || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ action: 'Company branding updated', name: record.name }),
        },
      });

      return record;
    });

    return NextResponse.json({
      company: {
        id: updated.id,
        name: updated.name,
        address: updated.address,
        phone: updated.phone,
        mobile: updated.mobile,
        email: updated.email,
        logo: updated.logo,
        brandLogo: updated.brandLogo,
        logoWidth: updated.logoWidth,
        logoHeight: updated.logoHeight,
        vatNumber: updated.vatNumber,
        tradeLicense: updated.tradeLicense,
        invoicePrefix: updated.invoicePrefix,
        thankYouMsg: updated.thankYouMsg,
        systemNote: updated.systemNote,
        showBarcode: updated.showBarcode,
        showPayInWord: updated.showPayInWord,
      },
    });
  } catch (error) {
    console.error('CompanyBranding PUT error:', error);
    return NextResponse.json(
      { error: 'Failed to update company branding data' },
      { status: 500 }
    );
  }
}
