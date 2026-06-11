// ============================================================
// INVOICE TEMPLATES API — CRUD + Auto-Seed
// Group 6: Core Performance Configurations & System Settings
// Supports 30+ toggle fields for dynamic invoice rendering
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, type UserRole, stripHtml } from '@/lib/api-security';

// Inline code generator for TPL-XXXXX
async function generateTemplateCode(): Promise<string> {
  const latest = await db.invoiceTemplate.findFirst({
    where: { code: { startsWith: 'TPL-' } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  if (!latest) return 'TPL-00001';
  const num = parseInt(latest.code.replace('TPL-', ''), 10) || 0;
  return `TPL-${String(num + 1).padStart(5, '0')}`;
}

// Profit/cost placeholders that VAT Auditor must NOT see in bodyHtml
const PROFIT_PLACEHOLDERS = ['{{cost', '{{profit', '{{margin', '{{writeoff', '{{costPrice', '{{wholesalePrice', '{{dealerPrice}}'];

function containsProfitPlaceholders(html: string | null): boolean {
  if (!html) return false;
  return PROFIT_PLACEHOLDERS.some((p) => html.toLowerCase().includes(p.toLowerCase()));
}

// ── Toggle field definitions ──
// Boolean fields that default to true (most toggles)
const TOGGLE_TRUE_FIELDS = [
  'showLogo', 'showMobile', 'showAddress',
  'showCustomerCode', 'showPrevDue', 'showTotalDue', 'showRemindDate',
  'showModel', 'showColor', 'showDescription', 'showMRP', 'showDiscountAmt', 'showUnitPrice',
  'showDiscountPct', 'showPPDiscount', 'showAdjustment', 'showDeliveryCost',
  'showPaymentDetails',
  'showCustomerSignature', 'showPreparedBy', 'showCheckedBy', 'showAuthorizedBy',
  'showPrintedBy', 'showSalesPerson', 'showPrintDate',
] as const;

// Boolean fields that default to false
const TOGGLE_FALSE_FIELDS = [
  'showBrandLogo', 'showVatNumber', 'showTradeLicense',
] as const;

// String fields that default to null
const STRING_NULL_FIELDS = [
  'companyName', 'termsAndConditions', 'customFooterNote',
] as const;

// All toggle boolean field names for destructuring
const ALL_BOOLEAN_FIELDS = [...TOGGLE_TRUE_FIELDS, ...TOGGLE_FALSE_FIELDS] as const;

// Helper: build toggle data from request body with proper defaults
function extractToggleFields(body: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  for (const field of TOGGLE_TRUE_FIELDS) {
    if (body[field] !== undefined) {
      data[field] = Boolean(body[field]);
    }
  }

  for (const field of TOGGLE_FALSE_FIELDS) {
    if (body[field] !== undefined) {
      data[field] = Boolean(body[field]);
    }
  }

  for (const field of STRING_NULL_FIELDS) {
    if (body[field] !== undefined) {
      data[field] = body[field] === null ? null : String(body[field]);
    }
  }

  return data;
}

// Default templates to seed on first GET if table is empty
const DEFAULT_TEMPLATES = [
  {
    name: 'Sales Invoice',
    templateType: 'Invoice',
    isDefault: true,
    subject: 'Invoice {{invoiceNo}} from {{companyName}}',
    headerHtml: '<div style="text-align:center;"><h1>{{companyName}}</h1><p>{{companyAddress}} | {{companyPhone}}</p></div>',
    bodyHtml: '<h2>Invoice: {{invoiceNo}}</h2><p>Date: {{date}}</p><p>Customer: {{customerName}}</p><table>{{lineItems}}</table><p>Subtotal: {{subTotal}}</p><p>VAT ({{vatRate}}%): {{vatAmount}}</p><p>Grand Total: {{grandTotal}}</p>',
    footerHtml: '<p>Thank you for your purchase!</p><p>Terms: Payment due within 30 days.</p>',
    paperSize: 'A4',
    orientation: 'Portrait',
    // Header overrides — Sales Invoice: all show* = true (except showBrandLogo, showVatNumber, showTradeLicense = false)
    companyName: null,
    showLogo: true,
    showBrandLogo: false,
    showMobile: true,
    showAddress: true,
    showVatNumber: false,
    showTradeLicense: false,
    // Metadata grid
    showCustomerCode: true,
    showPrevDue: true,
    showTotalDue: true,
    showRemindDate: true,
    // Table columns
    showModel: true,
    showColor: true,
    showDescription: true,
    showMRP: true,
    showDiscountAmt: true,
    showUnitPrice: true,
    // Summary section
    showDiscountPct: true,
    showPPDiscount: true,
    showAdjustment: true,
    showDeliveryCost: true,
    // Payment details
    showPaymentDetails: true,
    // Footer signatures
    showCustomerSignature: true,
    showPreparedBy: true,
    showCheckedBy: true,
    showAuthorizedBy: true,
    showPrintedBy: true,
    showSalesPerson: true,
    showPrintDate: true,
    // Custom terms/notes
    termsAndConditions: null,
    customFooterNote: null,
  },
  {
    name: 'Purchase Invoice',
    templateType: 'Invoice',
    isDefault: false,
    subject: 'Purchase Order {{poNumber}}',
    headerHtml: '<div style="text-align:center;"><h1>{{companyName}}</h1><p>Purchase Order</p></div>',
    bodyHtml: '<h2>PO: {{poNumber}}</h2><p>Date: {{date}}</p><p>Supplier: {{supplierName}}</p><table>{{lineItems}}</table><p>Subtotal: {{subTotal}}</p><p>VAT ({{vatRate}}%): {{vatAmount}}</p><p>Grand Total: {{grandTotal}}</p>',
    footerHtml: '<p>Authorized by: {{companyName}}</p>',
    paperSize: 'A4',
    orientation: 'Portrait',
    // Purchase Invoice: supplier-oriented — no customer fields, minimal signatures
    companyName: null,
    showLogo: true,
    showBrandLogo: false,
    showMobile: true,
    showAddress: true,
    showVatNumber: true,   // Purchase invoices often need VAT
    showTradeLicense: false,
    // Metadata grid — supplier-oriented
    showCustomerCode: false,  // No customer code for purchase
    showPrevDue: false,       // No previous due for purchase
    showTotalDue: false,      // No total due for purchase
    showRemindDate: false,    // No remind date for purchase
    // Table columns
    showModel: true,
    showColor: true,
    showDescription: true,
    showMRP: false,           // MRP not relevant for purchase
    showDiscountAmt: true,
    showUnitPrice: true,
    // Summary section
    showDiscountPct: true,
    showPPDiscount: false,    // PP discount not typical for purchase
    showAdjustment: true,
    showDeliveryCost: true,
    // Payment details
    showPaymentDetails: true,
    // Footer — purchase has fewer signature requirements
    showCustomerSignature: false,  // No customer signature for purchase
    showPreparedBy: true,
    showCheckedBy: true,
    showAuthorizedBy: true,
    showPrintedBy: true,
    showSalesPerson: false,   // No sales person for purchase
    showPrintDate: true,
    // Custom terms/notes
    termsAndConditions: 'Goods are subject to supplier terms and conditions.',
    customFooterNote: null,
  },
  {
    name: 'Hire Receipt',
    templateType: 'Receipt',
    isDefault: true,
    subject: 'Hire Purchase Receipt {{invoiceNo}}',
    headerHtml: '<div style="text-align:center;"><h1>{{companyName}}</h1><p>Hire Purchase Receipt</p></div>',
    bodyHtml: '<h2>Receipt: {{invoiceNo}}</h2><p>Date: {{date}}</p><p>Customer: {{customerName}}</p><p>Down Payment: {{downPayment}}</p><p>Installment: {{installmentAmount}} x {{duration}} months</p><p>Total: {{grandTotal}}</p>',
    footerHtml: '<p>Installment terms apply. Late payment charges may occur.</p>',
    paperSize: 'A4',
    orientation: 'Portrait',
    // Hire Receipt: hire-specific fields
    companyName: null,
    showLogo: true,
    showBrandLogo: false,
    showMobile: true,
    showAddress: true,
    showVatNumber: false,
    showTradeLicense: false,
    // Metadata grid
    showCustomerCode: true,
    showPrevDue: true,       // Previous due important for hire
    showTotalDue: true,      // Total due important for hire
    showRemindDate: true,    // Remind date important for hire installments
    // Table columns
    showModel: true,
    showColor: true,
    showDescription: true,
    showMRP: true,
    showDiscountAmt: true,
    showUnitPrice: true,
    // Summary section
    showDiscountPct: true,
    showPPDiscount: false,   // PP discount not typical for hire
    showAdjustment: true,
    showDeliveryCost: false, // Delivery cost not typical for hire
    // Payment details
    showPaymentDetails: true,
    // Footer — hire needs all signatures
    showCustomerSignature: true,
    showPreparedBy: true,
    showCheckedBy: true,
    showAuthorizedBy: true,
    showPrintedBy: true,
    showSalesPerson: true,
    showPrintDate: true,
    // Custom terms/notes
    termsAndConditions: 'Hire purchase terms: Late payment charges may apply. Ownership transfers after full payment.',
    customFooterNote: null,
  },
  {
    name: 'Email Notification',
    templateType: 'Email',
    isDefault: true,
    subject: 'Notification from {{companyName}}',
    headerHtml: '',
    bodyHtml: '<p>Dear {{customerName}},</p><p>{{message}}</p><p>Thank you for choosing {{companyName}}.</p>',
    footerHtml: '<p>{{companyName}} | {{companyEmail}} | {{companyPhone}}</p>',
    paperSize: 'A4',
    orientation: 'Portrait',
    // Email Notification: minimal toggles — no signatures, no barcode, no detailed columns
    companyName: null,
    showLogo: true,
    showBrandLogo: false,
    showMobile: true,
    showAddress: true,
    showVatNumber: false,
    showTradeLicense: false,
    // Metadata grid — minimal for email
    showCustomerCode: false,
    showPrevDue: false,
    showTotalDue: false,
    showRemindDate: false,
    // Table columns — minimal for email
    showModel: false,
    showColor: false,
    showDescription: true,   // Description still useful in email
    showMRP: false,
    showDiscountAmt: false,
    showUnitPrice: false,
    // Summary section — minimal for email
    showDiscountPct: false,
    showPPDiscount: false,
    showAdjustment: false,
    showDeliveryCost: false,
    // Payment details — not for email
    showPaymentDetails: false,
    // Footer — no signatures for email notifications
    showCustomerSignature: false,
    showPreparedBy: false,
    showCheckedBy: false,
    showAuthorizedBy: false,
    showPrintedBy: false,
    showSalesPerson: false,
    showPrintDate: false,
    // Custom terms/notes
    termsAndConditions: null,
    customFooterNote: null,
  },
  {
    name: 'Mushok 6.3 (VAT Return)',
    templateType: 'Mushok63',
    isDefault: true,
    subject: 'Mushok 6.3 - VAT Return {{invoiceNo}}',
    headerHtml: '<div style="text-align:center;"><h2>মুশক ৬.৩</h2><p>{{companyName}} | BIN: {{vatNumber}}</p></div>',
    bodyHtml: '<h3>VAT Return: {{invoiceNo}}</h3><p>Date: {{date}}</p><p>Supplier: {{supplierName}}</p><table>{{lineItems}}</table><p>VAT Amount: {{vatAmount}}</p>',
    footerHtml: '<p>This is a system generated VAT return document as per NBR regulations.</p>',
    paperSize: 'A4',
    orientation: 'Portrait',
    companyName: null,
    showLogo: true,
    showBrandLogo: false,
    showMobile: true,
    showAddress: true,
    showVatNumber: true,
    showTradeLicense: true,
    showCustomerCode: false,
    showPrevDue: false,
    showTotalDue: false,
    showRemindDate: false,
    showModel: true,
    showColor: false,
    showDescription: true,
    showMRP: true,
    showDiscountAmt: false,
    showUnitPrice: true,
    showDiscountPct: false,
    showPPDiscount: false,
    showAdjustment: false,
    showDeliveryCost: false,
    showPaymentDetails: false,
    showCustomerSignature: false,
    showPreparedBy: true,
    showCheckedBy: true,
    showAuthorizedBy: true,
    showPrintedBy: false,
    showSalesPerson: false,
    showPrintDate: true,
    termsAndConditions: 'This document is prepared as per National Board of Revenue (NBR) regulations.',
    customFooterNote: 'Mushok 6.3 — VAT Return Form',
  },
  {
    name: 'Delivery Challan',
    templateType: 'Challan',
    isDefault: true,
    subject: 'Delivery Challan {{invoiceNo}}',
    headerHtml: '<div style="text-align:center;"><h1>{{companyName}}</h1><p>DELIVERY CHALLAN</p></div>',
    bodyHtml: '<h2>Challan: {{invoiceNo}}</h2><p>Date: {{date}}</p><p>Customer: {{customerName}}</p><table>{{lineItems}}</table><p>Items: {{totalItems}}</p>',
    footerHtml: '<p>Received the above items in good condition.</p>',
    paperSize: 'A4',
    orientation: 'Portrait',
    companyName: null,
    showLogo: true,
    showBrandLogo: false,
    showMobile: true,
    showAddress: true,
    showVatNumber: false,
    showTradeLicense: false,
    showCustomerCode: true,
    showPrevDue: false,
    showTotalDue: false,
    showRemindDate: false,
    showModel: true,
    showColor: true,
    showDescription: true,
    showMRP: false,
    showDiscountAmt: false,
    showUnitPrice: false,
    showDiscountPct: false,
    showPPDiscount: false,
    showAdjustment: false,
    showDeliveryCost: false,
    showPaymentDetails: false,
    showCustomerSignature: true,
    showPreparedBy: true,
    showCheckedBy: false,
    showAuthorizedBy: true,
    showPrintedBy: false,
    showSalesPerson: false,
    showPrintDate: true,
    termsAndConditions: null,
    customFooterNote: 'Delivery Challan — Not a Tax Invoice',
  },
];

// Seed default templates if table is empty
async function seedDefaults() {
  const count = await db.invoiceTemplate.count();
  if (count === 0) {
    for (const tpl of DEFAULT_TEMPLATES) {
      const code = await generateTemplateCode();
      await db.invoiceTemplate.create({
        data: { code, ...tpl },
      });
    }
  }
}

// GET /api/invoice-templates — List templates with optional type filter
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'InvoiceTemplates', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const userRole = security.user.role as UserRole;
    const isVatAuditor = userRole === 'vat_auditor';

    // Seed defaults if table is empty
    await seedDefaults();

    // Build filter
    const where: Record<string, unknown> = {};
    const templateType = searchParams.get('templateType');
    if (templateType) where.templateType = templateType;

    const templates = await db.invoiceTemplate.findMany({
      where,
      orderBy: [{ templateType: 'asc' }, { name: 'asc' }],
    });

    // VAT Auditor: mask bodyHtml that contains cost/profit placeholders
    const masked = templates.map((t: Record<string, unknown>) => {
      if (isVatAuditor && containsProfitPlaceholders(t.bodyHtml as string | null)) {
        return { ...t, bodyHtml: '<!-- Content masked for Audit Mode -->' };
      }
      return t;
    });

    return NextResponse.json({ templates: masked, total: masked.length });
  } catch (error) {
    console.error('InvoiceTemplates GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch invoice templates' }, { status: 500 });
  }
}

// POST /api/invoice-templates — Create template with auto-generated TPL-XXXXX code
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'InvoiceTemplates', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const {
      name, templateType, subject, headerHtml, bodyHtml, footerHtml,
      cssStyles, paperSize, orientation, defaultPrinter, isActive,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      );
    }

    // Sanitize text fields to prevent XSS (NOT headerHtml/bodyHtml/footerHtml/cssStyles — those are intentional HTML)
    const sanitizedName = stripHtml(name);
    const sanitizedSubject = subject ? stripHtml(subject) : null;

    const code = await generateTemplateCode();

    // Extract toggle fields with proper defaults
    const toggleData = extractToggleFields(body);

    // If this template is being set as default, unset other defaults of same type
    if (body.isDefault === true) {
      const tplType = templateType || 'Invoice';
      await db.invoiceTemplate.updateMany({
        where: { templateType: tplType, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await db.invoiceTemplate.create({
      data: {
        code,
        name: sanitizedName,
        templateType: templateType || 'Invoice',
        subject: sanitizedSubject,
        headerHtml: headerHtml || null,
        bodyHtml: bodyHtml || null,
        footerHtml: footerHtml || null,
        cssStyles: cssStyles || null,
        paperSize: paperSize || 'A4',
        orientation: orientation || 'Portrait',
        defaultPrinter: defaultPrinter || null,
        isActive: isActive !== undefined ? isActive : true,
        ...(body.isDefault !== undefined && { isDefault: Boolean(body.isDefault) }),
        // Toggle fields — use extracted values with schema-level defaults as fallback
        ...toggleData,
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'InvoiceTemplates',
        recordId: template.id,
        recordLabel: template.code,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({ name, templateType: template.templateType, code }),
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('InvoiceTemplates POST error:', error);
    return NextResponse.json({ error: 'Failed to create invoice template' }, { status: 500 });
  }
}

// PUT /api/invoice-templates — Update template by id
export async function PUT(request: NextRequest) {
  const security = await withApiSecurity(request, 'InvoiceTemplates', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const {
      id, name, templateType, subject, headerHtml, bodyHtml, footerHtml,
      cssStyles, paperSize, orientation, defaultPrinter, isActive,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    const existing = await db.invoiceTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Invoice template not found.' },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    // Sanitize text fields to prevent XSS (NOT headerHtml/bodyHtml/footerHtml/cssStyles — those are intentional HTML)
    if (name !== undefined) updateData.name = stripHtml(name);
    if (templateType !== undefined) updateData.templateType = templateType;
    if (subject !== undefined) updateData.subject = subject ? stripHtml(subject) : null;
    if (headerHtml !== undefined) updateData.headerHtml = headerHtml;
    if (bodyHtml !== undefined) updateData.bodyHtml = bodyHtml;
    if (footerHtml !== undefined) updateData.footerHtml = footerHtml;
    if (cssStyles !== undefined) updateData.cssStyles = cssStyles;
    if (paperSize !== undefined) updateData.paperSize = paperSize;
    if (orientation !== undefined) updateData.orientation = orientation;
    if (defaultPrinter !== undefined) updateData.defaultPrinter = defaultPrinter;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Toggle fields
    for (const field of ALL_BOOLEAN_FIELDS) {
      if (body[field] !== undefined) {
        updateData[field] = Boolean(body[field]);
      }
    }

    // String nullable fields — sanitize text fields (NOT HTML content fields)
    for (const field of STRING_NULL_FIELDS) {
      if (body[field] !== undefined) {
        updateData[field] = body[field] === null ? null : stripHtml(String(body[field]));
      }
    }

    // isDefault field: ensure only one default per templateType
    if (body.isDefault === true) {
      // Unset default on other templates of same type
      if (existing) {
        await db.invoiceTemplate.updateMany({
          where: { templateType: existing.templateType, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      updateData.isDefault = true;
    } else if (body.isDefault === false) {
      updateData.isDefault = false;
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
    console.error('InvoiceTemplates PUT error:', error);
    return NextResponse.json({ error: 'Failed to update invoice template' }, { status: 500 });
  }
}

// DELETE /api/invoice-templates — Delete by id (Admin only)
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required query param: id' },
        { status: 400 }
      );
    }

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
    console.error('InvoiceTemplates DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete invoice template' }, { status: 500 });
  }
}
