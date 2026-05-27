// ============================================================
// INVOICE TEMPLATES [ID] API — Individual Template CRUD
// GET / PUT / DELETE a single invoice template by ID
// Supports all 30+ toggle fields for dynamic invoice rendering
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, type UserRole } from '@/lib/api-security';

// Profit/cost placeholders that VAT Auditor must NOT see in bodyHtml
const PROFIT_PLACEHOLDERS = ['{{cost', '{{profit', '{{margin', '{{writeoff', '{{costPrice', '{{wholesalePrice', '{{dealerPrice}}'];

function containsProfitPlaceholders(html: string | null): boolean {
  if (!html) return false;
  return PROFIT_PLACEHOLDERS.some((p) => html.toLowerCase().includes(p.toLowerCase()));
}

// All toggle boolean field names
const ALL_BOOLEAN_FIELDS = [
  'showLogo', 'showBrandLogo', 'showMobile', 'showAddress',
  'showVatNumber', 'showTradeLicense',
  'showCustomerCode', 'showPrevDue', 'showTotalDue', 'showRemindDate',
  'showModel', 'showColor', 'showDescription', 'showMRP', 'showDiscountAmt', 'showUnitPrice',
  'showDiscountPct', 'showPPDiscount', 'showAdjustment', 'showDeliveryCost',
  'showPaymentDetails',
  'showCustomerSignature', 'showPreparedBy', 'showCheckedBy', 'showAuthorizedBy',
  'showPrintedBy', 'showSalesPerson', 'showPrintDate',
] as const;

// String nullable field names
const STRING_NULL_FIELDS = [
  'companyName', 'termsAndConditions', 'customFooterNote',
] as const;

// GET /api/invoice-templates/[id] — Get single template with all toggle fields
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'InvoiceTemplates', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const userRole = security.user.role as UserRole;
    const isVatAuditor = userRole === 'vat_auditor';

    const template = await db.invoiceTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json(
        { error: 'Invoice template not found.' },
        { status: 404 }
      );
    }

    // VAT Auditor: mask bodyHtml that contains cost/profit placeholders
    if (isVatAuditor && containsProfitPlaceholders(template.bodyHtml)) {
      return NextResponse.json({
        template: { ...template, bodyHtml: '<!-- Content masked for Audit Mode -->' },
      });
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error('InvoiceTemplates [id] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch invoice template' }, { status: 500 });
  }
}

// PUT /api/invoice-templates/[id] — Update template toggle fields
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'InvoiceTemplates', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.invoiceTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Invoice template not found.' },
        { status: 404 }
      );
    }

    const {
      name, templateType, subject, headerHtml, bodyHtml, footerHtml,
      cssStyles, paperSize, orientation, defaultPrinter, isActive,
    } = body;

    const updateData: Record<string, unknown> = {};

    // Core fields
    if (name !== undefined) updateData.name = name;
    if (templateType !== undefined) updateData.templateType = templateType;
    if (subject !== undefined) updateData.subject = subject;
    if (headerHtml !== undefined) updateData.headerHtml = headerHtml;
    if (bodyHtml !== undefined) updateData.bodyHtml = bodyHtml;
    if (footerHtml !== undefined) updateData.footerHtml = footerHtml;
    if (cssStyles !== undefined) updateData.cssStyles = cssStyles;
    if (paperSize !== undefined) updateData.paperSize = paperSize;
    if (orientation !== undefined) updateData.orientation = orientation;
    if (defaultPrinter !== undefined) updateData.defaultPrinter = defaultPrinter;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Toggle boolean fields
    for (const field of ALL_BOOLEAN_FIELDS) {
      if (body[field] !== undefined) {
        updateData[field] = Boolean(body[field]);
      }
    }

    // String nullable fields
    for (const field of STRING_NULL_FIELDS) {
      if (body[field] !== undefined) {
        updateData[field] = body[field] === null ? null : String(body[field]);
      }
    }

    const template = await db.invoiceTemplate.update({
      where: { id },
      data: updateData,
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        module: 'InvoiceTemplates',
        recordId: template.id,
        recordLabel: template.code,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({ changes: updateData }),
      },
    });

    return NextResponse.json({ template });
  } catch (error) {
    console.error('InvoiceTemplates [id] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update invoice template' }, { status: 500 });
  }
}

// DELETE /api/invoice-templates/[id] — Delete template (Admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'InvoiceTemplates', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const userRole = security.user.role as UserRole;

    // Admin only
    if (userRole !== 'admin') {
      return NextResponse.json(
        { error: 'Access denied. Only administrators can delete invoice templates.' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existing = await db.invoiceTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Invoice template not found.' },
        { status: 404 }
      );
    }

    await db.invoiceTemplate.delete({ where: { id } });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'DELETE',
        module: 'InvoiceTemplates',
        recordId: existing.id,
        recordLabel: existing.code,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({ name: existing.name, templateType: existing.templateType }),
      },
    });

    return NextResponse.json({ success: true, deleted: existing.code });
  } catch (error) {
    console.error('InvoiceTemplates [id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete invoice template' }, { status: 500 });
  }
}
