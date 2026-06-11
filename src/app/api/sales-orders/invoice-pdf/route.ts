// ============================================================
// INVOICE PDF GENERATION API
// Generates a professional sales invoice PDF with company logo
// Fixed: Logo rendering, title, item table, customer details,
// Bengali fallback, date format, VAT, Pay In Word, signatures,
// layout, system note
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { db } from '@/lib/db';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { numberToWordsBDT } from '@/lib/invoice-engine';
import { toLatinDigits } from '@/lib/number-format';

// Types matching invoice-engine.ts
interface InvoiceCompanyProfile {
  name: string;
  address?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  logo?: string;
  brandLogo?: string;
  logoWidth?: number;
  logoHeight?: number;
  vatNumber?: string;
  tradeLicense?: string;
  thankYouMsg?: string;
  systemNote?: string;
  showBarcode?: boolean;
  showPayInWord?: boolean;
}

interface InvoiceLineItem {
  sl: number;
  model?: string;
  color?: string;
  description?: string;
  qty: number;
  mrp?: number;
  discountAmt?: number;
  unitPrice: number;
  amount: number;
}

interface InvoicePaymentDetail {
  paymentType: string;
  paidAmount: number;
}

interface InvoiceData {
  invoiceNo: string;
  invoiceDate: string;
  customerCode?: string;
  customerName: string;
  customerMobile?: string;
  customerAddress?: string;
  prevDue?: number;
  totalDue?: number;
  items: InvoiceLineItem[];
  discountPercent?: number;
  discountAmount?: number;
  netTotal: number;
  paidAmount: number;
  currentDue: number;
  paymentDetails?: InvoicePaymentDetail[];
  payInWord?: string;
  remarks?: string;
  barcodeData?: string;
  printedBy?: string;
  salesPerson?: string;
  invoiceType: string;
}

// Constants
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_LEFT = 10;
const MARGIN_RIGHT = 10;
const MARGIN_TOP = 8;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

const bdtFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

function fmtCurrency(value: number | undefined | null): string {
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (isNaN(num)) return '—';
  return toLatinDigits(`Tk. ${bdtFormatter.format(num)}`);
}

function fmtDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return toLatinDigits(String(dateStr));
    return toLatinDigits(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
  } catch {
    return toLatinDigits(String(dateStr));
  }
}

function safeStr(value: string | undefined | null, fallback: string = ''): string {
  if (value === null || value === undefined || value === '') return fallback;
  return value;
}

// Check if a string contains non-ASCII (e.g., Bengali) characters
function hasNonAscii(str: string): boolean {
  return /[^\x00-\x7F]/.test(str);
}

// Get a safe thank-you message (fallback for Bengali text that jsPDF can't render)
function getSafeThankYouMsg(msg: string | undefined): string {
  const fallback = 'Thank You! Come Again.';
  if (!msg) return fallback;
  if (hasNonAscii(msg)) {
    // jsPDF can't render Bengali — use English fallback
    return fallback;
  }
  return msg;
}

function drawCompanyHeader(
  doc: jsPDF,
  company: InvoiceCompanyProfile,
  invoiceType: string
): number {
  let y = MARGIN_TOP;
  const logoW = company.logoWidth || 30;
  const logoH = company.logoHeight || 20;
  let textStartX = MARGIN_LEFT;

  // Draw company logo (left side)
  if (company.logo) {
    try {
      let dataUrl = company.logo;
      if (!dataUrl.startsWith('data:')) {
        dataUrl = `data:image/png;base64,${dataUrl}`;
      }
      // Detect format from data URL
      const format = dataUrl.includes('image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(dataUrl, format, MARGIN_LEFT, y, logoW, logoH);
      textStartX = MARGIN_LEFT + logoW + 4;
    } catch {
      textStartX = MARGIN_LEFT;
    }
  }

  // Draw brand logo on the right side
  if (company.brandLogo) {
    try {
      let brandDataUrl = company.brandLogo;
      if (!brandDataUrl.startsWith('data:')) {
        brandDataUrl = `data:image/png;base64,${brandDataUrl}`;
      }
      const format = brandDataUrl.includes('image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(brandDataUrl, format, PAGE_WIDTH - MARGIN_RIGHT - logoW, y, logoW, logoH);
    } catch { /* skip */ }
  }

  // Company Name
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(10, 22, 40);
  doc.text(safeStr(company.name, 'Company Name'), textStartX, y + 7);
  y += 10;

  // Address
  if (company.address) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(company.address, textStartX, y + 3);
    y += 6;
  }

  // Mobile
  if (company.mobile) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Mobile: ${company.mobile}`, textStartX, y + 3);
    y += 6;
  } else if (company.phone) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Phone: ${company.phone}`, textStartX, y + 3);
    y += 6;
  }

  // Email
  if (company.email) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(company.email, textStartX, y + 3);
    doc.setTextColor(10, 22, 40);
    y += 5;
  }

  // VAT Number (always show if set)
  if (company.vatNumber) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`VAT No: ${company.vatNumber}`, textStartX, y + 3);
    doc.setTextColor(10, 22, 40);
    y += 5;
  }

  // Trade License
  if (company.tradeLicense) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`Trade License: ${company.tradeLicense}`, textStartX, y + 3);
    doc.setTextColor(10, 22, 40);
    y += 5;
  }

  // Separator
  y += 2;
  doc.setDrawColor(10, 22, 40);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 4;

  // Invoice Title — centered, bold
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(10, 22, 40);
  const titleText = safeStr(invoiceType, 'Sales Invoice');
  const titleWidth = doc.getTextWidth(titleText);
  doc.text(titleText, PAGE_WIDTH / 2 - titleWidth / 2, y);
  y += 3;

  // Separator
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 4;

  return y;
}

function drawMetadataGrid(doc: jsPDF, invoice: InvoiceData, startY: number): number {
  let y = startY;
  const colWidth = CONTENT_WIDTH / 2;
  const leftX = MARGIN_LEFT;
  const rightX = MARGIN_LEFT + colWidth;
  const rowHeight = 5.5;

  doc.setFontSize(8);
  doc.setTextColor(10, 22, 40);

  // LEFT COLUMN — Customer info
  const leftItems: Array<{ label: string; value: string }> = [];
  leftItems.push({ label: 'Invoice No:', value: safeStr(invoice.invoiceNo) });
  if (invoice.customerCode) leftItems.push({ label: 'Customer Code:', value: safeStr(invoice.customerCode) });
  leftItems.push({ label: 'Customer Name:', value: safeStr(invoice.customerName) });
  if (invoice.customerMobile) leftItems.push({ label: 'Mobile No:', value: safeStr(invoice.customerMobile) });
  if (invoice.customerAddress) leftItems.push({ label: 'Address:', value: safeStr(invoice.customerAddress) });

  // RIGHT COLUMN — Date & Due info
  const rightItems: Array<{ label: string; value: string }> = [];
  rightItems.push({ label: 'Invoice Date:', value: fmtDate(invoice.invoiceDate) });
  if (invoice.prevDue !== undefined && invoice.prevDue > 0) rightItems.push({ label: 'Prev.Due:', value: fmtCurrency(invoice.prevDue) });
  if (invoice.totalDue !== undefined && invoice.totalDue > 0) rightItems.push({ label: 'Total Due:', value: fmtCurrency(invoice.totalDue) });

  const maxRows = Math.max(leftItems.length, rightItems.length);
  const gridHeight = maxRows * rowHeight + 4;

  // Background
  doc.setFillColor(248, 250, 252);
  doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, gridHeight, 'F');

  // Border
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, gridHeight);

  // Center divider
  doc.line(MARGIN_LEFT + colWidth, y, MARGIN_LEFT + colWidth, y + gridHeight);

  // Left column
  let rowY = y + 4;
  for (const item of leftItems) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(item.label, leftX + 2, rowY);
    doc.setFont('helvetica', 'normal');
    doc.text(item.value, leftX + 32, rowY);
    doc.setDrawColor(230, 230, 230);
    doc.line(leftX + 2, rowY + 2, leftX + colWidth - 2, rowY + 2);
    rowY += rowHeight;
  }

  // Right column
  rowY = y + 4;
  for (const item of rightItems) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(item.label, rightX + 2, rowY);
    doc.setFont('helvetica', 'normal');
    doc.text(item.value, rightX + 32, rowY);
    doc.setDrawColor(230, 230, 230);
    doc.line(rightX + 2, rowY + 2, rightX + colWidth - 2, rowY + 2);
    rowY += rowHeight;
  }

  return y + gridHeight + 3;
}

function drawItemsTable(doc: jsPDF, items: InvoiceLineItem[], startY: number): number {
  const columns = [
    { header: 'SL', width: 10, key: 'sl', align: 'center' as const },
    { header: 'Description', width: 75, key: 'description', align: 'left' as const },
    { header: 'Qty', width: 18, key: 'qty', align: 'center' as const },
    { header: 'Unit Price', width: 32, key: 'unitPrice', align: 'right' as const },
    { header: 'Amount', width: 32, key: 'amount', align: 'right' as const },
  ];

  // Scale columns to fill content width
  const totalSpecWidth = columns.reduce((sum, c) => sum + c.width, 0);
  if (totalSpecWidth !== CONTENT_WIDTH) {
    const scale = CONTENT_WIDTH / totalSpecWidth;
    columns.forEach(c => { c.width = Math.round(c.width * scale * 10) / 10; });
  }

  const headers = columns.map(c => c.header);
  const columnStyles: Record<number, any> = {};
  columns.forEach((c, i) => { columnStyles[i] = { cellWidth: c.width, halign: c.align }; });

  const body = items.map(item => [
    String(item.sl),
    safeStr(item.description, 'Item'),
    String(item.qty),
    fmtCurrency(item.unitPrice),
    fmtCurrency(item.amount),
  ]);

  // Total row
  const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
  const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);
  body.push(['', 'Total', String(totalQty), '', fmtCurrency(totalAmount)]);

  autoTable(doc, {
    head: [headers],
    body,
    startY,
    margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT, bottom: 10 },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      lineWidth: 0.2,
      lineColor: [203, 213, 225],
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [10, 22, 40],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
      cellPadding: 2.5,
    },
    columnStyles,
    didParseCell: (data: any) => {
      if (data.row.index === body.length - 1 && data.section === 'body') {
        data.cell.styles.fillColor = [240, 244, 252];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const lastTable = (doc as any).lastAutoTable;
  return lastTable ? lastTable.finalY + 3 : startY + 30;
}

function drawSummaryBlock(doc: jsPDF, invoice: InvoiceData, startY: number): number {
  let y = startY;

  doc.setDrawColor(10, 22, 40);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 3;

  doc.setFontSize(9);
  doc.setTextColor(10, 22, 40);

  const summaryItems: Array<{ label: string; value: string; bold?: boolean }> = [];

  if (invoice.discountAmount !== undefined && invoice.discountAmount > 0) {
    summaryItems.push({ label: 'Discount:', value: fmtCurrency(invoice.discountAmount) });
  }
  summaryItems.push({ label: 'Net Total:', value: fmtCurrency(invoice.netTotal), bold: true });
  summaryItems.push({ label: 'Paid Amount:', value: fmtCurrency(invoice.paidAmount) });
  if (invoice.currentDue > 0) {
    summaryItems.push({ label: 'Current Due:', value: fmtCurrency(invoice.currentDue), bold: true });
  }

  for (const item of summaryItems) {
    doc.setFont('helvetica', 'bold');
    doc.text(item.label, MARGIN_LEFT + 2, y + 4);
    doc.setFont('helvetica', item.bold ? 'bold' : 'normal');
    doc.text(item.value, MARGIN_LEFT + 45, y + 4);
    y += 6;
  }

  return y + 2;
}

function drawFooterSection(
  doc: jsPDF,
  invoice: InvoiceData,
  company: InvoiceCompanyProfile,
  currentY: number
): number {
  let y = currentY;

  // ── Pay In Word ──
  if (company.showPayInWord !== false) {
    const payInWordText = invoice.payInWord || numberToWordsBDT(invoice.netTotal);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(10, 22, 40);
    doc.text('Pay In Word:', MARGIN_LEFT + 2, y + 3);
    doc.setFont('helvetica', 'normal');
    // Split long text across lines if needed
    const maxTextWidth = CONTENT_WIDTH - 28;
    const lines = doc.splitTextToSize(payInWordText, maxTextWidth);
    doc.text(lines, MARGIN_LEFT + 28, y + 3);
    y += 4 + lines.length * 4;
  }

  // Separator
  doc.setDrawColor(10, 22, 40);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 5;

  // Thank You message (with Bengali fallback)
  const thankYouMsg = getSafeThankYouMsg(company.thankYouMsg);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(10, 22, 40);
  const thankYouWidth = doc.getTextWidth(thankYouMsg);
  doc.text(thankYouMsg, PAGE_WIDTH / 2 - thankYouWidth / 2, y);
  y += 7;

  // Signature lines (3 columns: Customer, Prepared By, Authorized By)
  const sigSectionWidth = CONTENT_WIDTH / 3;
  const sigY = y + 12;

  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.2);

  const signatureItems = [
    { label: "Customer's Signature", x: MARGIN_LEFT },
    { label: 'Prepared By', x: MARGIN_LEFT + sigSectionWidth },
    { label: 'Authorized By', x: MARGIN_LEFT + sigSectionWidth * 2 },
  ];

  for (const sig of signatureItems) {
    doc.line(sig.x, sigY, sig.x + sigSectionWidth - 15, sigY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    const labelWidth = doc.getTextWidth(sig.label);
    doc.text(sig.label, sig.x + (sigSectionWidth - 15) / 2 - labelWidth / 2, sigY + 4);
  }

  y = sigY + 8;

  // System meta info (Printed By | Sales Person | Print Date)
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');

  const systemParts: string[] = [];
  if (invoice.printedBy) {
    systemParts.push(`Printed By: ${invoice.printedBy}`);
  }
  if (invoice.salesPerson) {
    systemParts.push(`Sales Person: ${invoice.salesPerson}`);
  }
  systemParts.push(`Print Date: ${toLatinDigits(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))}`);
  doc.text(systemParts.join('  |  '), MARGIN_LEFT + 2, y);
  y += 4;

  // System-generated note
  const systemNote = company.systemNote || 'This is a computer generated invoice.';
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(130, 130, 130);
  const noteWidth = doc.getTextWidth(systemNote);
  doc.text(systemNote, PAGE_WIDTH / 2 - noteWidth / 2, y);

  return y + 5;
}

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SalesOrders', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const salesOrderId = searchParams.get('id');

    if (!salesOrderId) {
      return NextResponse.json({ error: 'Sales order ID is required' }, { status: 400 });
    }

    // Fetch the sales order with all details
    const order = await db.salesOrder.findUnique({
      where: { id: salesOrderId },
      include: {
        customer: true,
        lines: {
          include: {
            product: {
              include: {
                category: true,
                brand: true,
              },
            },
          },
        },
        godown: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Sales order not found' }, { status: 404 });
    }

    // Fetch company branding
    const company = await db.company.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    const companyProfile: InvoiceCompanyProfile = company ? {
      name: company.name || 'Electronics Mart',
      address: company.address || undefined,
      phone: company.phone || undefined,
      mobile: company.mobile || undefined,
      email: company.email || undefined,
      logo: company.logo || undefined,
      brandLogo: company.brandLogo || undefined,
      logoWidth: company.logoWidth || 30,
      logoHeight: company.logoHeight || 20,
      vatNumber: company.vatNumber || undefined,
      tradeLicense: company.tradeLicense || undefined,
      thankYouMsg: company.thankYouMsg || undefined,
      systemNote: company.systemNote || undefined,
      showBarcode: company.showBarcode || false,
      showPayInWord: company.showPayInWord !== false,
    } : {
      name: 'Electronics Mart',
      showPayInWord: true,
    };

    // Build invoice data
    const invoice: InvoiceData = {
      invoiceNo: order.invoiceNo || `SO-${String(order.id).padStart(5, '0')}`,
      invoiceDate: order.date,
      customerCode: order.customer?.customerCode || undefined,
      customerName: order.customer?.name || 'Walk-in Customer',
      customerMobile: order.customer?.phone || undefined,
      customerAddress: order.customer?.address || undefined,
      prevDue: 0,
      totalDue: Number(order.grandTotal),
      items: order.lines.map((line, idx) => ({
        sl: idx + 1,
        description: line.product?.name || 'Item',
        model: line.product?.sku || undefined,
        qty: line.quantity,
        unitPrice: Number(line.rate),
        amount: Number(line.total),
      })),
      discountPercent: order.discountPercent ? Number(order.discountPercent) : undefined,
      discountAmount: order.discount ? Number(order.discount) : undefined,
      netTotal: Number(order.grandTotal),
      paidAmount: Number(order.grandTotal),
      currentDue: 0,
      payInWord: numberToWordsBDT(Number(order.grandTotal)),
      barcodeData: order.invoiceNo,
      printedBy: security.user?.name || undefined,
      salesPerson: order.srId || undefined,
      invoiceType: 'Sales Invoice',
    };

    // Generate PDF
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // 1. Company Header
    let y = drawCompanyHeader(doc, companyProfile, invoice.invoiceType);

    // 2. Metadata Grid
    y = drawMetadataGrid(doc, invoice, y);

    // 3. Items Table
    y = drawItemsTable(doc, invoice.items, y);

    // 4. Summary Block
    y = drawSummaryBlock(doc, invoice, y);

    // 5. Footer Section (follows content flow — no excessive white space)
    drawFooterSection(doc, invoice, companyProfile, y);

    // Generate PDF buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    // Return PDF as downloadable file
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${order.invoiceNo || 'Invoice'}-Invoice.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (error) {
    console.error('Invoice PDF generation error:', error);
    return NextResponse.json({ error: 'Failed to generate invoice PDF' }, { status: 500 });
  }
}
