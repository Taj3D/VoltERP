// ============================================================
// INVOICE PDF GENERATION API
// Generates a professional sales invoice PDF matching reference format
// Features: 9-column product table, detailed financial summary,
// payment details box, Due In Word, single logo, Checked By signature
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
  logoUrl?: string;
  brandLogoUrl?: string;
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
  ppDiscount?: number;
  adjustment?: number;
  netTotal: number;
  paidAmount: number;
  currentDue: number;
  deliveryCost?: number;
  paymentDetails?: InvoicePaymentDetail[];
  payInWord?: string;
  dueInWord?: string;
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

function fmtNumber(value: number | undefined | null): string {
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (isNaN(num)) return '—';
  return toLatinDigits(bdtFormatter.format(num));
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

// ============================================================
// HELPER: Draw Company Header Section (Single Logo)
// ============================================================

async function drawCompanyHeader(
  doc: jsPDF,
  company: InvoiceCompanyProfile,
  invoiceType: string
): Promise<number> {
  let y = MARGIN_TOP;
  const logoW = company.logoWidth || 30;
  const logoH = company.logoHeight || 20;
  let textStartX = MARGIN_LEFT;

  // Draw company logo — prefer CDN URL (logoUrl), fall back to base64 (logo)
  const logoSource = company.logoUrl || company.logo;
  if (logoSource) {
    try {
      let dataUrl = logoSource;
      if (logoSource.startsWith('http')) {
        // Fetch from Vercel Blob CDN
        const resp = await fetch(logoSource);
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          const mime = resp.headers.get('content-type') || 'image/png';
          dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
        }
      } else if (!dataUrl.startsWith('data:')) {
        const isJpeg = dataUrl.startsWith('/9j/');
        dataUrl = `data:image/${isJpeg ? 'jpeg' : 'png'};base64,${dataUrl}`;
      }
      const format = dataUrl.includes('image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(dataUrl, format, MARGIN_LEFT, y, logoW, logoH);
      textStartX = MARGIN_LEFT + logoW + 4;
    } catch {
      textStartX = MARGIN_LEFT;
    }
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

  // VAT Number
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

// ============================================================
// HELPER: Draw Metadata Grid
// ============================================================

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

// ============================================================
// HELPER: Draw Items Table (9 columns matching reference format)
// SL | Model | Color | Description | Qty | MRP | Dis. Amt | Unit Price | Amount
// ============================================================

function drawItemsTable(doc: jsPDF, items: InvoiceLineItem[], startY: number): number {
  const columns = [
    { header: 'SL', width: 8, key: 'sl', align: 'center' as const },
    { header: 'Model', width: 20, key: 'model', align: 'left' as const },
    { header: 'Color', width: 16, key: 'color', align: 'left' as const },
    { header: 'Description', width: 40, key: 'description', align: 'left' as const },
    { header: 'Qty', width: 12, key: 'qty', align: 'center' as const },
    { header: 'MRP', width: 22, key: 'mrp', align: 'right' as const },
    { header: 'Dis. Amt', width: 22, key: 'discountAmt', align: 'right' as const },
    { header: 'Unit Price', width: 22, key: 'unitPrice', align: 'right' as const },
    { header: 'Amount', width: 22, key: 'amount', align: 'right' as const },
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

  const body = items.map(item => {
    const row: string[] = [];
    for (const col of columns) {
      switch (col.key) {
        case 'sl':
          row.push(String(item.sl));
          break;
        case 'model':
          row.push(safeStr(item.model));
          break;
        case 'color':
          row.push(safeStr(item.color));
          break;
        case 'description':
          row.push(safeStr(item.description, 'Item'));
          break;
        case 'qty':
          row.push(String(item.qty));
          break;
        case 'mrp':
          row.push(fmtCurrency(item.mrp));
          break;
        case 'discountAmt':
          row.push(item.discountAmt ? fmtCurrency(item.discountAmt) : '—');
          break;
        case 'unitPrice':
          row.push(fmtCurrency(item.unitPrice));
          break;
        case 'amount':
          row.push(fmtCurrency(item.amount));
          break;
        default:
          row.push('');
      }
    }
    return row;
  });

  // Total row
  const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
  const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);
  const totalRow: string[] = [];
  for (const col of columns) {
    switch (col.key) {
      case 'sl':
        totalRow.push('');
        break;
      case 'description':
        totalRow.push('Total');
        break;
      case 'qty':
        totalRow.push(String(totalQty));
        break;
      case 'amount':
        totalRow.push(fmtCurrency(totalAmount));
        break;
      default:
        totalRow.push('');
    }
  }
  body.push(totalRow);

  autoTable(doc, {
    head: [headers],
    body,
    startY,
    margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT, bottom: 10 },
    styles: {
      fontSize: 7,
      cellPadding: 2,
      textColor: [30, 41, 59],
      lineWidth: 0.2,
      lineColor: [203, 213, 225],
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [10, 22, 40],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
      cellPadding: 2,
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

// ============================================================
// HELPER: Draw Summary Block (3-column layout matching reference)
// Left: Discount/Adjustment | Middle: Net Totals | Right: Payment Details
// ============================================================

function drawSummaryBlock(doc: jsPDF, invoice: InvoiceData, startY: number): number {
  let y = startY;

  doc.setDrawColor(10, 22, 40);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 3;

  const colWidth = CONTENT_WIDTH / 3;
  const leftX = MARGIN_LEFT;
  const midX = MARGIN_LEFT + colWidth;
  const rightX = MARGIN_LEFT + colWidth * 2;
  const rowHeight = 5.5;

  doc.setFontSize(8);
  doc.setTextColor(10, 22, 40);

  // ── LEFT SECTION: Discount & Adjustments ──
  const leftItems: Array<{ label: string; value: string }> = [];

  if (invoice.discountPercent !== undefined && invoice.discountPercent > 0) {
    leftItems.push({ label: 'Discount (%):', value: fmtNumber(invoice.discountPercent) });
  }
  if (invoice.discountAmount !== undefined && invoice.discountAmount > 0) {
    leftItems.push({ label: 'Discount Amt.:', value: fmtCurrency(invoice.discountAmount) });
  }
  if (invoice.ppDiscount !== undefined && invoice.ppDiscount > 0) {
    leftItems.push({ label: 'PP Discount Amt:', value: fmtCurrency(invoice.ppDiscount) });
  }
  if (invoice.adjustment !== undefined && invoice.adjustment !== 0) {
    leftItems.push({ label: 'Adjustment Amt:', value: fmtCurrency(invoice.adjustment) });
  }

  let rowY = y + 2;
  for (const item of leftItems) {
    doc.setFont('helvetica', 'bold');
    doc.text(item.label, leftX + 2, rowY + 3);
    doc.setFont('helvetica', 'normal');
    doc.text(item.value, leftX + 35, rowY + 3);
    rowY += rowHeight;
  }

  // ── MIDDLE SECTION: Totals ──
  const midItems: Array<{ label: string; value: string; bold?: boolean }> = [];

  midItems.push({ label: 'Net Total:', value: fmtCurrency(invoice.netTotal), bold: true });
  midItems.push({ label: 'Paid Amt:', value: fmtCurrency(invoice.paidAmount) });
  midItems.push({ label: 'Curr. Due:', value: fmtCurrency(invoice.currentDue), bold: true });
  if (invoice.deliveryCost !== undefined && invoice.deliveryCost > 0) {
    midItems.push({ label: 'Deli. Cost:', value: fmtCurrency(invoice.deliveryCost) });
  }

  rowY = y + 2;
  for (const item of midItems) {
    doc.setFont('helvetica', 'bold');
    doc.text(item.label, midX + 2, rowY + 3);
    doc.setFont('helvetica', item.bold ? 'bold' : 'normal');
    doc.text(item.value, midX + 28, rowY + 3);
    rowY += rowHeight;
  }

  // ── RIGHT SECTION: Payment Details Box ──
  if (invoice.paymentDetails && invoice.paymentDetails.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('Payment Details', rightX + 2, y + 4);

    const paymentHeaders = ['Payment Type', 'Paid Amount'];
    const paymentBody = invoice.paymentDetails.map(pd => [
      safeStr(pd.paymentType),
      fmtCurrency(pd.paidAmount),
    ]);

    // Add total row
    const totalPaid = invoice.paymentDetails.reduce((sum, pd) => sum + pd.paidAmount, 0);
    paymentBody.push(['Total', fmtCurrency(totalPaid)]);

    autoTable(doc, {
      head: [paymentHeaders],
      body: paymentBody,
      startY: y + 6,
      margin: { left: rightX, right: MARGIN_RIGHT, bottom: 10 },
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
        textColor: [30, 41, 59],
        lineWidth: 0.15,
        lineColor: [203, 213, 225],
      },
      headStyles: {
        fillColor: [10, 22, 40],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7,
        cellPadding: 2,
      },
      columnStyles: {
        0: { cellWidth: colWidth * 0.55, halign: 'left' },
        1: { cellWidth: colWidth * 0.45, halign: 'right' },
      },
      didParseCell: (data: any) => {
        // Bold the total row in payment details
        if (data.row.index === paymentBody.length - 1 && data.section === 'body') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 244, 252];
        }
      },
    });
  }

  const leftEndY = y + 2 + leftItems.length * rowHeight;
  const midEndY = y + 2 + midItems.length * rowHeight;
  const lastTable = (doc as any).lastAutoTable;
  const tableEndY = lastTable ? lastTable.finalY + 2 : y + 20;

  return Math.max(leftEndY, midEndY, tableEndY) + 3;
}

// ============================================================
// HELPER: Draw Footer Section
// Features: Pay In Word, Due In Word, 4 signature lines (incl. Checked By)
// ============================================================

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
    const maxTextWidth = CONTENT_WIDTH - 30;
    const lines = doc.splitTextToSize(payInWordText, maxTextWidth);
    doc.text(lines, MARGIN_LEFT + 30, y + 3);
    y += 4 + lines.length * 4;
  }

  // ── Due In Word ──
  if (invoice.currentDue > 0 && company.showPayInWord !== false) {
    const dueInWordText = invoice.dueInWord || numberToWordsBDT(invoice.currentDue);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(10, 22, 40);
    doc.text('Due In Word:', MARGIN_LEFT + 2, y + 3);
    doc.setFont('helvetica', 'normal');
    const maxTextWidth = CONTENT_WIDTH - 30;
    const lines = doc.splitTextToSize(dueInWordText, maxTextWidth);
    doc.text(lines, MARGIN_LEFT + 30, y + 3);
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

  // Signature lines (4 columns: Customer, Prepared By, Checked By, Authorized By)
  const sigSectionWidth = CONTENT_WIDTH / 4;
  const sigY = y + 12;

  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.2);

  const signatureItems = [
    { label: "Customer's Signature", x: MARGIN_LEFT },
    { label: 'Prepared By', x: MARGIN_LEFT + sigSectionWidth },
    { label: 'Checked By', x: MARGIN_LEFT + sigSectionWidth * 2 },
    { label: 'Authorized By', x: MARGIN_LEFT + sigSectionWidth * 3 },
  ];

  for (const sig of signatureItems) {
    doc.line(sig.x, sigY, sig.x + sigSectionWidth - 10, sigY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    const labelWidth = doc.getTextWidth(sig.label);
    doc.text(sig.label, sig.x + (sigSectionWidth - 10) / 2 - labelWidth / 2, sigY + 4);
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

// ============================================================
// API ROUTE: GET /api/sales-orders/invoice-pdf?id=xxx
// ============================================================

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SalesOrders', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const salesOrderId = searchParams.get('id');

    if (!salesOrderId) {
      return NextResponse.json({ error: 'Sales order ID is required' }, { status: 400 });
    }

    // Fetch the sales order with all details including product color, SR employee, and payment option
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
                color: true,
              },
            },
          },
        },
        godown: true,
        sr: true,
        paymentOption: true,
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
      logoUrl: (company as any).logoUrl || undefined,
      brandLogoUrl: (company as any).brandLogoUrl || undefined,
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

    // Calculate paid amount: for Completed/Delivered orders, paid = grandTotal
    // For other statuses, paid could be partial — default to grandTotal
    const netTotal = Number(order.grandTotal);
    const paidAmount = Number(order.grandTotal); // Default: fully paid
    const currentDue = netTotal - paidAmount;

    // Build payment details from the sales order's payment option
    const paymentDetails: InvoicePaymentDetail[] = [];
    if (order.paymentOption) {
      paymentDetails.push({
        paymentType: order.paymentOption.name,
        paidAmount: paidAmount,
      });
    } else {
      // Default payment type
      paymentDetails.push({
        paymentType: 'Cash',
        paidAmount: paidAmount,
      });
    }

    // Build invoice data
    const invoice: InvoiceData = {
      invoiceNo: order.invoiceNo || `SO-${String(order.id).padStart(5, '0')}`,
      invoiceDate: order.date,
      customerCode: order.customer?.customerCode || undefined,
      customerName: order.customer?.name || 'Walk-in Customer',
      customerMobile: order.customer?.phone || undefined,
      customerAddress: order.customer?.address || undefined,
      prevDue: 0,
      totalDue: netTotal,
      items: order.lines.map((line, idx) => ({
        sl: idx + 1,
        model: line.product?.sku || '',
        color: line.product?.color?.name || '',
        description: line.product?.name || 'Item',
        qty: line.quantity,
        mrp: line.product?.salePrice ? Number(line.product.salePrice) : Number(line.rate),
        discountAmt: line.discountAmount ? Number(line.discountAmount) : (line.discountPercent ? Number(line.rate) * line.quantity * Number(line.discountPercent) / 100 : 0),
        unitPrice: Number(line.rate),
        amount: Number(line.total),
      })),
      discountPercent: order.discountPercent ? Number(order.discountPercent) : undefined,
      discountAmount: order.discount ? Number(order.discount) : undefined,
      ppDiscount: undefined,
      adjustment: undefined,
      netTotal,
      paidAmount,
      currentDue,
      deliveryCost: undefined,
      paymentDetails,
      payInWord: numberToWordsBDT(netTotal),
      dueInWord: currentDue > 0 ? numberToWordsBDT(currentDue) : undefined,
      barcodeData: order.invoiceNo,
      printedBy: security.user?.name || undefined,
      salesPerson: order.sr?.name || undefined,
      invoiceType: 'Sales Invoice',
    };

    // Generate PDF
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // 1. Company Header (single logo)
    let y = await drawCompanyHeader(doc, companyProfile, invoice.invoiceType);

    // 2. Metadata Grid
    y = drawMetadataGrid(doc, invoice, y);

    // 3. Items Table (9 columns)
    y = drawItemsTable(doc, invoice.items, y);

    // 4. Summary Block (3-column: discounts | totals | payment details)
    y = drawSummaryBlock(doc, invoice, y);

    // 5. Footer Section (Pay In Word, Due In Word, 4 signatures incl. Checked By)
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
