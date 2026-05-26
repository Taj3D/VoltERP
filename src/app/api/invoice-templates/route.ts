// ============================================================
// INVOICE TEMPLATES API — CRUD + Auto-Seed
// Group 6: Core Performance Configurations & System Settings
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, type UserRole } from '@/lib/api-security';

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

// Default templates to seed on first GET if table is empty
const DEFAULT_TEMPLATES = [
  {
    name: 'Sales Invoice',
    templateType: 'Invoice',
    subject: 'Invoice {{invoiceNo}} from {{companyName}}',
    headerHtml: '<div style="text-align:center;"><h1>{{companyName}}</h1><p>{{companyAddress}} | {{companyPhone}}</p></div>',
    bodyHtml: '<h2>Invoice: {{invoiceNo}}</h2><p>Date: {{date}}</p><p>Customer: {{customerName}}</p><table>{{lineItems}}</table><p>Subtotal: {{subTotal}}</p><p>VAT ({{vatRate}}%): {{vatAmount}}</p><p>Grand Total: {{grandTotal}}</p>',
    footerHtml: '<p>Thank you for your purchase!</p><p>Terms: Payment due within 30 days.</p>',
    paperSize: 'A4',
    orientation: 'Portrait',
  },
  {
    name: 'Purchase Invoice',
    templateType: 'Invoice',
    subject: 'Purchase Order {{poNumber}}',
    headerHtml: '<div style="text-align:center;"><h1>{{companyName}}</h1><p>Purchase Order</p></div>',
    bodyHtml: '<h2>PO: {{poNumber}}</h2><p>Date: {{date}}</p><p>Supplier: {{supplierName}}</p><table>{{lineItems}}</table><p>Subtotal: {{subTotal}}</p><p>VAT ({{vatRate}}%): {{vatAmount}}</p><p>Grand Total: {{grandTotal}}</p>',
    footerHtml: '<p>Authorized by: {{companyName}}</p>',
    paperSize: 'A4',
    orientation: 'Portrait',
  },
  {
    name: 'Hire Receipt',
    templateType: 'Receipt',
    subject: 'Hire Purchase Receipt {{invoiceNo}}',
    headerHtml: '<div style="text-align:center;"><h1>{{companyName}}</h1><p>Hire Purchase Receipt</p></div>',
    bodyHtml: '<h2>Receipt: {{invoiceNo}}</h2><p>Date: {{date}}</p><p>Customer: {{customerName}}</p><p>Down Payment: {{downPayment}}</p><p>Installment: {{installmentAmount}} x {{duration}} months</p><p>Total: {{grandTotal}}</p>',
    footerHtml: '<p>Installment terms apply. Late payment charges may occur.</p>',
    paperSize: 'A4',
    orientation: 'Portrait',
  },
  {
    name: 'Email Notification',
    templateType: 'Email',
    subject: 'Notification from {{companyName}}',
    headerHtml: '',
    bodyHtml: '<p>Dear {{customerName}},</p><p>{{message}}</p><p>Thank you for choosing {{companyName}}.</p>',
    footerHtml: '<p>{{companyName}} | {{companyEmail}} | {{companyPhone}}</p>',
    paperSize: 'A4',
    orientation: 'Portrait',
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
    const masked = templates.map((t: any) => {
      if (isVatAuditor && containsProfitPlaceholders(t.bodyHtml)) {
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
    const { name, templateType, subject, headerHtml, bodyHtml, footerHtml, cssStyles, paperSize, orientation, defaultPrinter, isActive } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      );
    }

    const code = await generateTemplateCode();

    const template = await db.invoiceTemplate.create({
      data: {
        code,
        name,
        templateType: templateType || 'Invoice',
        subject: subject || null,
        headerHtml: headerHtml || null,
        bodyHtml: bodyHtml || null,
        footerHtml: footerHtml || null,
        cssStyles: cssStyles || null,
        paperSize: paperSize || 'A4',
        orientation: orientation || 'Portrait',
        defaultPrinter: defaultPrinter || null,
        isActive: isActive !== undefined ? isActive : true,
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
    const { id, name, templateType, subject, headerHtml, bodyHtml, footerHtml, cssStyles, paperSize, orientation, defaultPrinter, isActive } = body;

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
