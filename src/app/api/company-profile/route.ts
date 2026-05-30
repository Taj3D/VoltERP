// ============================================================
// COMPANY PROFILE CRUD API — Admin-Only Mutable Endpoint
// GET:   Returns the first active company profile (full fields incl. logoData) — admin only
// PUT:   Updates the company profile — admin only
// POST:  Creates initial company profile if none exists — admin only
//
// The public read-only endpoint is /api/company-branding (no auth).
// This route is the MUTABLE admin-only endpoint with RBAC enforcement.
// Audit logging uses module token "Sys-Branding-Setup".
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { sanitizeError } from '@/lib/exception-sanitizer';

// Maximum base64 string length for logoData (~2MB file = ~2,666,666 chars in base64)
const MAX_LOGO_DATA_LENGTH = 2_666_666;

// Mutable fields accepted by PUT and POST
const MUTABLE_FIELDS = [
  'name', 'address', 'phone', 'email', 'logo', 'brandLogo', 'logoData',
  'mobile', 'website', 'vatNumber', 'tradeLicense', 'binNumber',
  'currencySymbol', 'invoicePrefix', 'thankYouMsg', 'systemNote',
  'showBarcode', 'showPayInWord', 'logoWidth', 'logoHeight',
] as const;

type MutableField = typeof MUTABLE_FIELDS[number];

/**
 * Generate a short company code from the company name.
 * E.g., "ELECTRONICS MART" → "EM", "ACME Corp" → "AC"
 */
function generateCodeFromName(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return words.slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('');
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Validate that a string is valid base64 data URL format.
 * Accepts data URLs (data:image/...;base64,...) and plain base64 strings.
 */
function isValidBase64(value: string): boolean {
  // If it's a data URL, check the base64 portion
  if (value.startsWith('data:')) {
    const commaIndex = value.indexOf(',');
    if (commaIndex === -1) return false;
    const base64Part = value.substring(commaIndex + 1);
    if (base64Part.length === 0) return true; // Empty data URL is technically valid
    return /^[A-Za-z0-9+/]*={0,2}$/.test(base64Part);
  }
  // Plain base64 string
  if (value.length === 0) return true;
  return /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}

/**
 * Extract mutable fields from the request body, ignoring unknown keys.
 */
function extractMutableFields(body: Record<string, unknown>): Partial<Record<MutableField, unknown>> {
  const result: Partial<Record<MutableField, unknown>> = {};
  for (const field of MUTABLE_FIELDS) {
    if (field in body) {
      result[field] = body[field];
    }
  }
  return result;
}

// ============================================================
// GET /api/company-profile — Returns the first active company profile (admin only)
// ============================================================
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Companies', 'GET');
  if (!security.authorized) return security.response;

  try {
    // Admin-only access — non-admin roles get 403
    if (security.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Access denied. Only Administrators can view the full company profile with logo data.' },
        { status: 403 }
      );
    }

    const company = await db.company.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!company) {
      return NextResponse.json(
        { error: 'No active company profile found. Create one using POST.', profile: null },
        { status: 404 }
      );
    }

    return NextResponse.json({ profile: company });
  } catch (error) {
    const sanitized = sanitizeError(error, 'company-profile GET');
    return NextResponse.json(
      { error: sanitized.userMessage, errorCode: sanitized.errorCode },
      { status: sanitized.statusCode }
    );
  }
}

// ============================================================
// PUT /api/company-profile — Updates the company profile (admin only)
// ============================================================
export async function PUT(request: NextRequest) {
  const security = await withApiSecurity(request, 'Companies', 'PUT');
  if (!security.authorized) return security.response;

  try {
    // Admin-only access — non-admin roles get 403
    if (security.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Access denied. Only Administrators can modify the company profile.' },
        { status: 403 }
      );
    }

    const body: Record<string, unknown> = await request.json();
    const updates = extractMutableFields(body);

    // Validate: name is required
    if ('name' in updates && (!updates.name || typeof updates.name !== 'string' || updates.name.trim() === '')) {
      return NextResponse.json(
        { error: 'Company name is required and cannot be empty.' },
        { status: 400 }
      );
    }

    // Validate: logoData must be valid base64 if provided
    if (updates.logoData !== undefined && updates.logoData !== null && typeof updates.logoData === 'string') {
      if (updates.logoData.length > 0 && !isValidBase64(updates.logoData)) {
        return NextResponse.json(
          { error: 'logoData must be a valid base64 string or data URL.' },
          { status: 400 }
        );
      }
      // Validate: logoData max size (~2MB = ~2,666,666 chars)
      if (updates.logoData.length > MAX_LOGO_DATA_LENGTH) {
        return NextResponse.json(
          { error: `logoData exceeds maximum allowed size (2MB). Current size: ${(updates.logoData.length / 1_333_333).toFixed(1)}MB. Please compress the image and try again.` },
          { status: 400 }
        );
      }
    }

    // Validate: logo and brandLogo base64 if provided
    if (updates.logo !== undefined && updates.logo !== null && typeof updates.logo === 'string') {
      if (updates.logo.length > MAX_LOGO_DATA_LENGTH) {
        return NextResponse.json(
          { error: 'Logo image exceeds maximum allowed size (2MB). Please compress the image and try again.' },
          { status: 400 }
        );
      }
    }
    if (updates.brandLogo !== undefined && updates.brandLogo !== null && typeof updates.brandLogo === 'string') {
      if (updates.brandLogo.length > MAX_LOGO_DATA_LENGTH) {
        return NextResponse.json(
          { error: 'Brand logo image exceeds maximum allowed size (2MB). Please compress the image and try again.' },
          { status: 400 }
        );
      }
    }

    // Find the active company profile
    const existing = await db.company.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'No active company profile found. Create one using POST first.' },
        { status: 404 }
      );
    }

    // Build the update data object with proper types
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      updateData[key] = value;
    }

    // Perform the update
    const updated = await db.company.update({
      where: { id: existing.id },
      data: updateData,
    });

    // Audit log
    await logUserActivity({
      action: 'UPDATE',
      module: 'Sys-Branding-Setup',
      recordId: updated.id,
      recordLabel: updated.name,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        updatedFields: Object.keys(updateData),
        companyName: updated.name,
      }),
    });

    return NextResponse.json({ profile: updated });
  } catch (error) {
    const sanitized = sanitizeError(error, 'company-profile PUT');
    return NextResponse.json(
      { error: sanitized.userMessage, errorCode: sanitized.errorCode },
      { status: sanitized.statusCode }
    );
  }
}

// ============================================================
// POST /api/company-profile — Creates initial company profile (admin only)
// ============================================================
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Companies', 'POST');
  if (!security.authorized) return security.response;

  try {
    // Admin-only access — non-admin roles get 403
    if (security.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Access denied. Only Administrators can create the company profile.' },
        { status: 403 }
      );
    }

    const body: Record<string, unknown> = await request.json();

    // Validate: name is required for creation
    if (!body.name || typeof body.name !== 'string' || (body.name as string).trim() === '') {
      return NextResponse.json(
        { error: 'Company name is required to create a company profile.' },
        { status: 400 }
      );
    }

    // Validate: logoData must be valid base64 if provided
    if (body.logoData !== undefined && body.logoData !== null && typeof body.logoData === 'string') {
      if ((body.logoData as string).length > 0 && !isValidBase64(body.logoData as string)) {
        return NextResponse.json(
          { error: 'logoData must be a valid base64 string or data URL.' },
          { status: 400 }
        );
      }
      if ((body.logoData as string).length > MAX_LOGO_DATA_LENGTH) {
        return NextResponse.json(
          { error: `logoData exceeds maximum allowed size (2MB). Current size: ${((body.logoData as string).length / 1_333_333).toFixed(1)}MB. Please compress the image and try again.` },
          { status: 400 }
        );
      }
    }

    // Validate: logo and brandLogo base64 if provided
    if (body.logo !== undefined && body.logo !== null && typeof body.logo === 'string') {
      if ((body.logo as string).length > MAX_LOGO_DATA_LENGTH) {
        return NextResponse.json(
          { error: 'Logo image exceeds maximum allowed size (2MB). Please compress the image and try again.' },
          { status: 400 }
        );
      }
    }
    if (body.brandLogo !== undefined && body.brandLogo !== null && typeof body.brandLogo === 'string') {
      if ((body.brandLogo as string).length > MAX_LOGO_DATA_LENGTH) {
        return NextResponse.json(
          { error: 'Brand logo image exceeds maximum allowed size (2MB). Please compress the image and try again.' },
          { status: 400 }
        );
      }
    }

    // Check if an active company already exists
    const existing = await db.company.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'An active company profile already exists. Use PUT to update the existing profile.', existingId: existing.id },
        { status: 409 }
      );
    }

    // Auto-generate code from name
    const companyName = (body.name as string).trim();
    const autoCode = generateCodeFromName(companyName);

    // Ensure code is unique — if collision, append a number
    let code = autoCode;
    let suffix = 1;
    while (await db.company.findUnique({ where: { code } })) {
      code = `${autoCode}${suffix}`;
      suffix++;
    }

    // Extract mutable fields for creation
    const fields = extractMutableFields(body);

    // Build the create data object
    const createData: Record<string, unknown> = {
      code,
      name: companyName,
    };

    // Add optional fields if provided
    for (const [key, value] of Object.entries(fields)) {
      if (key === 'name') continue; // Already handled
      if (value === undefined) continue;
      createData[key] = value;
    }

    // Create the company profile
    const created = await db.company.create({
      data: createData,
    });

    // Audit log
    await logUserActivity({
      action: 'CREATE',
      module: 'Sys-Branding-Setup',
      recordId: created.id,
      recordLabel: created.name,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        companyName: created.name,
        code: created.code,
      }),
    });

    return NextResponse.json({ profile: created }, { status: 201 });
  } catch (error) {
    const sanitized = sanitizeError(error, 'company-profile POST');
    return NextResponse.json(
      { error: sanitized.userMessage, errorCode: sanitized.errorCode },
      { status: sanitized.statusCode }
    );
  }
}
