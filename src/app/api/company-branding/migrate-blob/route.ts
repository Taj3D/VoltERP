// ============================================================
// POST /api/company-branding/migrate-blob
// Admin-only: migrates existing base64 logos in Turso to Vercel Blob.
//
// After running this once, the company-branding GET response drops
// from ~192KB to ~2KB because it returns a CDN URL instead of base64.
//
// Prerequisites:
//   - BLOB_READ_WRITE_TOKEN env var must be set in Vercel
//   - Admin role required
//
// Returns: { migrated: number, skipped: number, companies: [...] }
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import {
  uploadImageToBlob,
  logoBlobPath,
  brandLogoBlobPath,
  detectExtension,
  detectContentType,
  isBlobConfigured,
} from '@/lib/blob-storage';
import { invalidateByPrefix } from '@/lib/server-cache';

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Companies', 'POST');
  if (!security.authorized) return security.response;

  // Admin only
  const userRole = (security.user as any)?.role;
  if (userRole !== 'admin') {
    return NextResponse.json(
      { error: 'Only Admin can run blob migration.' },
      { status: 403 }
    );
  }

  if (!isBlobConfigured()) {
    return NextResponse.json(
      {
        error:
          'BLOB_READ_WRITE_TOKEN is not set. Configure Vercel Blob store first, then retry.',
        blobConfigured: false,
      },
      { status: 400 }
    );
  }

  try {
    // Find all companies with base64 logos but no blob URL yet
    const companies = await db.company.findMany({
      where: {
        OR: [
          { logoUrl: null, NOT: { logo: null } },
          { brandLogoUrl: null, NOT: { brandLogo: null } },
        ],
      },
      select: {
        id: true,
        code: true,
        name: true,
        logo: true,
        brandLogo: true,
        logoUrl: true,
        brandLogoUrl: true,
      },
    });

    let migrated = 0;
    let skipped = 0;
    const results: any[] = [];

    for (const company of companies) {
      let logoMigrated = false;
      let brandLogoMigrated = false;
      const updateData: any = {};

      // Migrate main logo
      if (!company.logoUrl && company.logo && company.logo.startsWith('data:image')) {
        try {
          const ext = detectExtension(company.logo);
          const contentType = detectContentType(company.logo);
          const result = await uploadImageToBlob(
            company.logo,
            logoBlobPath(company.id, ext),
            contentType
          );
          if (result.storedInBlob) {
            updateData.logoUrl = result.url;
            updateData.logo = null; // clear base64 to save DB space
            logoMigrated = true;
          }
        } catch (e) {
          console.warn(`[migrate-blob] Failed to migrate logo for ${company.code}:`, e);
        }
      }

      // Migrate brand logo
      if (!company.brandLogoUrl && company.brandLogo && company.brandLogo.startsWith('data:image')) {
        try {
          const ext = detectExtension(company.brandLogo);
          const contentType = detectContentType(company.brandLogo);
          const result = await uploadImageToBlob(
            company.brandLogo,
            brandLogoBlobPath(company.id, ext),
            contentType
          );
          if (result.storedInBlob) {
            updateData.brandLogoUrl = result.url;
            updateData.brandLogo = null;
            brandLogoMigrated = true;
          }
        } catch (e) {
          console.warn(`[migrate-blob] Failed to migrate brandLogo for ${company.code}:`, e);
        }
      }

      if (logoMigrated || brandLogoMigrated) {
        await db.company.update({
          where: { id: company.id },
          data: updateData,
        });
        migrated++;
        results.push({
          id: company.id,
          code: company.code,
          name: company.name,
          logoMigrated,
          brandLogoMigrated,
        });
      } else {
        skipped++;
      }
    }

    // Invalidate branding cache
    invalidateByPrefix('company-branding:');

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'MIGRATE',
        module: 'CompanyBranding',
        recordId: 'bulk-migration',
        recordLabel: `Blob migration: ${migrated} migrated, ${skipped} skipped`,
        userId: security.user?.id || 'system',
        userName: security.user?.name || 'System',
        details: JSON.stringify({ migrated, skipped }),
      },
    });

    return NextResponse.json({
      success: true,
      migrated,
      skipped,
      total: companies.length,
      companies: results,
    });
  } catch (error) {
    console.error('Blob migration error:', error);
    return NextResponse.json(
      { error: 'Blob migration failed: ' + (error instanceof Error ? error.message : 'unknown') },
      { status: 500 }
    );
  }
}
