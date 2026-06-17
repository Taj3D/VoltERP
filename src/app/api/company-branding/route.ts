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
import { cachedFetch, invalidateByPrefix } from '@/lib/server-cache';
import {
  uploadImageToBlob,
  deleteBlobByUrl,
  logoBlobPath,
  brandLogoBlobPath,
  detectExtension,
  detectContentType,
  isBlobConfigured,
} from '@/lib/blob-storage';

// GET /api/company-branding
// Returns the first active company's branding data for invoice generation.
// RBAC: Requires 'system-config' group access (admin, manager, vat_auditor).
//
// PERFORMANCE: Cached server-side for 300s (5 min).
// When logoUrl is set (Vercel Blob), response is ~2KB instead of ~192KB.
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SystemConfig', 'GET');
  if (!security.authorized) return security.response;

  const companyId = (security.user as any)?.companyId;
  const cacheKey = `company-branding:${companyId || 'default'}`;

  try {
    const company = await cachedFetch(cacheKey, 300, async () => {
      return await db.company.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
          address: true,
          phone: true,
          mobile: true,
          email: true,
          logoUrl: true,
          brandLogoUrl: true,
          // PERF: Only select legacy base64 logo/brandLogo when Blob is NOT configured.
          // When Blob IS configured, response is ~2KB (just URLs).
          // When Blob is NOT configured, response is ~192KB (base64) but needed for
          // client-side PDF generation and Company Settings preview.
          ...(isBlobConfigured() ? {} : { logo: true, brandLogo: true }),
          logoWidth: true,
          logoHeight: true,
          vatNumber: true,
          tradeLicense: true,
          invoicePrefix: true,
          thankYouMsg: true,
          systemNote: true,
          showBarcode: true,
          showPayInWord: true,
          website: true,
        },
      });
    });

    if (!company) {
      return NextResponse.json(
        { error: 'No active company profile found. Please configure company settings.' },
        { status: 404 }
      );
    }

    const blobReady = isBlobConfigured();
    // Ensure base64 logos have the data: URL prefix so <img src> works in the browser.
    // The DB stores raw base64 (without prefix) as a space optimization.
    const normalizeBase64 = (val: string | null): string | null => {
      if (!val) return null;
      if (val.startsWith('data:')) return val;
      // Detect format from header bytes (JPEG: /9j/, PNG: iVBOR, GIF: R0lGOD, WebP: UklGR)
      let mime = 'image/png';
      if (val.startsWith('/9j/')) mime = 'image/jpeg';
      else if (val.startsWith('iVBOR')) mime = 'image/png';
      else if (val.startsWith('R0lGOD')) mime = 'image/gif';
      else if (val.startsWith('UklGR')) mime = 'image/webp';
      return `data:${mime};base64,${val}`;
    };
    return NextResponse.json({
      company: {
        id: company.id,
        code: company.code,
        name: company.name,
        address: company.address,
        phone: company.phone,
        mobile: company.mobile,
        email: company.email,
        // Return CDN URLs (preferred) — frontend fetches image directly from Vercel edge
        logoUrl: company.logoUrl,
        brandLogoUrl: company.brandLogoUrl,
        // When Blob is configured: omit base64 (perf).
        // When Blob is NOT configured: include base64 (with data: prefix) so client-side
        // PDF engine and Company Settings preview can render the logo.
        logo: blobReady ? null : normalizeBase64(company.logo as string | null),
        brandLogo: blobReady ? null : normalizeBase64(company.brandLogo as string | null),
        logoWidth: company.logoWidth,
        logoHeight: company.logoHeight,
        vatNumber: company.vatNumber,
        tradeLicense: company.tradeLicense,
        invoicePrefix: company.invoicePrefix,
        thankYouMsg: company.thankYouMsg,
        systemNote: company.systemNote,
        showBarcode: company.showBarcode,
        showPayInWord: company.showPayInWord,
        website: company.website,
        blobConfigured: blobReady,
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

    // Validate image fields (still accept base64 from frontend — we upload to Blob below)
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

    // ── Upload logos to Vercel Blob (if base64 provided) ──────────────────
    // When Blob is configured: upload → store CDN URL in logoUrl, clear base64 logo
    // When Blob NOT configured: store base64 in logo (legacy behavior, fallback)
    let logoUrlValue: string | null | undefined = undefined;
    let brandLogoUrlValue: string | null | undefined = undefined;
    let logoBase64Value: string | null | undefined = undefined;
    let brandLogoBase64Value: string | null | undefined = undefined;

    if (body.logo !== undefined) {
      if (body.logo && String(body.logo).startsWith('data:image')) {
        // New logo uploaded — try Blob first
        const ext = detectExtension(body.logo);
        const contentType = detectContentType(body.logo);
        const result = await uploadImageToBlob(body.logo, logoBlobPath(company.id, ext), contentType);
        if (result.storedInBlob) {
          logoUrlValue = result.url;
          logoBase64Value = null; // clear legacy base64 to save DB space
          // Delete previous blob if it existed
          if (company.logoUrl) await deleteBlobByUrl(company.logoUrl);
        } else {
          // Fallback: store base64
          logoBase64Value = result.base64;
          logoUrlValue = null;
        }
      } else if (body.logo === '' || body.logo === null) {
        // Logo cleared by user
        logoUrlValue = null;
        logoBase64Value = null;
        if (company.logoUrl) await deleteBlobByUrl(company.logoUrl);
      }
    }

    if (body.brandLogo !== undefined) {
      if (body.brandLogo && String(body.brandLogo).startsWith('data:image')) {
        const ext = detectExtension(body.brandLogo);
        const contentType = detectContentType(body.brandLogo);
        const result = await uploadImageToBlob(body.brandLogo, brandLogoBlobPath(company.id, ext), contentType);
        if (result.storedInBlob) {
          brandLogoUrlValue = result.url;
          brandLogoBase64Value = null;
          if (company.brandLogoUrl) await deleteBlobByUrl(company.brandLogoUrl);
        } else {
          brandLogoBase64Value = result.base64;
          brandLogoUrlValue = null;
        }
      } else if (body.brandLogo === '' || body.brandLogo === null) {
        brandLogoUrlValue = null;
        brandLogoBase64Value = null;
        if (company.brandLogoUrl) await deleteBlobByUrl(company.brandLogoUrl);
      }
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
          ...(logoBase64Value !== undefined && { logo: logoBase64Value }),
          ...(brandLogoBase64Value !== undefined && { brandLogo: brandLogoBase64Value }),
          ...(logoUrlValue !== undefined && { logoUrl: logoUrlValue }),
          ...(brandLogoUrlValue !== undefined && { brandLogoUrl: brandLogoUrlValue }),
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
          details: JSON.stringify({
            action: 'Company branding updated',
            name: record.name,
            logoStoredIn: logoUrlValue !== undefined && logoUrlValue !== null ? 'vercel-blob' : (logoBase64Value ? 'base64' : 'unchanged'),
          }),
        },
      });

      return record;
    });

    // Invalidate branding cache so next GET fetches fresh data
    invalidateByPrefix('company-branding:');

    return NextResponse.json({
      company: {
        id: updated.id,
        code: updated.code,
        name: updated.name,
        address: updated.address,
        phone: updated.phone,
        mobile: updated.mobile,
        email: updated.email,
        logoUrl: updated.logoUrl,
        brandLogoUrl: updated.brandLogoUrl,
        logo: null, // don't return base64 in response (perf)
        brandLogo: null,
        logoWidth: updated.logoWidth,
        logoHeight: updated.logoHeight,
        vatNumber: updated.vatNumber,
        tradeLicense: updated.tradeLicense,
        invoicePrefix: updated.invoicePrefix,
        thankYouMsg: updated.thankYouMsg,
        systemNote: updated.systemNote,
        showBarcode: updated.showBarcode,
        showPayInWord: updated.showPayInWord,
        website: updated.website,
        blobConfigured: isBlobConfigured(),
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
