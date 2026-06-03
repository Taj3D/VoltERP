// ============================================================
// VoltERP — ELECTRONICS MART IMS
// Dynamic Invoice PDF Engine
// Matches RenderReport.pdf layout structure exactly:
//   Portrait A4 (210×297mm), Company Header, Metadata Grid,
//   Items Table, Summary Block, Extra Fields, Footer Section
// Production-Ready: Multi-page, VAT Auditor Masking,
// BDT Number-to-Words, Dynamic Column Toggle, Barcode
// ============================================================

import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

// NOTE: We use the standalone autoTable(doc, options) function instead of the
// applyPlugin(jsPDF) + doc.autoTable() pattern. The applyPlugin approach patches
// jsPDF.API but breaks in Next.js webpack/turbopack because the bundled jsPDF
// constructor may be a different reference than the one applyPlugin receives.
// The standalone autoTable() function works directly with the doc instance.

// ============================================================
// TYPES
// ============================================================

export interface InvoiceCompanyProfile {
  name: string;
  address?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  logo?: string;       // Base64 data URL
  brandLogo?: string;  // Base64 data URL
  logoWidth?: number;  // mm (default 30)
  logoHeight?: number; // mm (default 20)
  vatNumber?: string;
  tradeLicense?: string;
  thankYouMsg?: string;
  systemNote?: string;
  showBarcode?: boolean;
  showPayInWord?: boolean;
}

export interface InvoiceTemplateConfig {
  showLogo?: boolean;
  showBrandLogo?: boolean;
  showMobile?: boolean;
  showAddress?: boolean;
  showVatNumber?: boolean;
  showTradeLicense?: boolean;
  showCustomerCode?: boolean;
  showPrevDue?: boolean;
  showTotalDue?: boolean;
  showRemindDate?: boolean;
  showModel?: boolean;
  showColor?: boolean;
  showDescription?: boolean;
  showMRP?: boolean;
  showDiscountAmt?: boolean;
  showUnitPrice?: boolean;
  showDiscountPct?: boolean;
  showPPDiscount?: boolean;
  showAdjustment?: boolean;
  showDeliveryCost?: boolean;
  showPaymentDetails?: boolean;
  showCustomerSignature?: boolean;
  showPreparedBy?: boolean;
  showCheckedBy?: boolean;
  showAuthorizedBy?: boolean;
  showPrintedBy?: boolean;
  showSalesPerson?: boolean;
  showPrintDate?: boolean;
  termsAndConditions?: string;
  customFooterNote?: string;
}

export interface InvoiceLineItem {
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

export interface InvoicePaymentDetail {
  paymentType: string;
  paidAmount: number;
}

export interface InvoiceData {
  invoiceNo: string;
  invoiceDate: string;
  customerCode?: string;
  customerName: string;
  customerMobile?: string;
  customerAddress?: string;
  prevDue?: number;
  totalDue?: number;
  remindDate?: string;
  items: InvoiceLineItem[];
  // Summary
  discountPercent?: number;
  discountAmount?: number;
  ppDiscount?: number;
  adjustment?: number;
  netTotal: number;
  paidAmount: number;
  currentDue: number;
  deliveryCost?: number;
  // Payment details
  paymentDetails?: InvoicePaymentDetail[];
  // Footer
  payInWord?: string;
  dueInWord?: string;
  remarks?: string;
  barcodeData?: string;
  // Meta
  printedBy?: string;
  salesPerson?: string;
  invoiceType: string; // "Sales Invoice", "Purchase Invoice", "Hire Receipt", etc.
}

export interface InvoicePDFOptions {
  company: InvoiceCompanyProfile;
  template: InvoiceTemplateConfig;
  invoice: InvoiceData;
  filename?: string;
  isVatAuditor?: boolean;
  vatMaskedFields?: string[];
}

// ============================================================
// CONSTANTS
// ============================================================

const PAGE_WIDTH = 210; // A4 portrait width in mm
const PAGE_HEIGHT = 297; // A4 portrait height in mm
const MARGIN_LEFT = 10;
const MARGIN_RIGHT = 10;
const MARGIN_TOP = 8;
const MARGIN_BOTTOM = 8;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 190mm

const VAT_MASKING_SENTINEL = "N/A (Audit Mode)";

// ============================================================
// UTILITY: Number to Words (BDT Format)
// "Taka One Thousand Two Hundred Thirty Four and Paisa Fifty Six Only"
// ============================================================

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];

const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function convertHundreds(num: number): string {
  if (num === 0) return "";
  let result = "";
  if (num >= 100) {
    result += ONES[Math.floor(num / 100)] + " Hundred";
    num %= 100;
    if (num > 0) result += " ";
  }
  if (num >= 20) {
    result += TENS[Math.floor(num / 10)];
    num %= 10;
    if (num > 0) result += " " + ONES[num];
  } else if (num > 0) {
    result += ONES[num];
  }
  return result;
}

export function numberToWordsBDT(amount: number): string {
  if (amount === 0) return "Taka Zero Only";

  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);

  // Split into Taka and Paisa
  const taka = Math.floor(absAmount);
  const paisa = Math.round((absAmount - taka) * 100);

  let takaWords = "";

  if (taka === 0) {
    takaWords = "Zero";
  } else {
    // Handle crore (10,000,000)
    if (taka >= 10000000) {
      const crore = Math.floor(taka / 10000000);
      takaWords += convertHundreds(crore) + " Crore";
      const remainder = taka % 10000000;
      if (remainder > 0) takaWords += " ";
    }

    // Handle lakh (100,000)
    const afterCrore = taka % 10000000;
    if (afterCrore >= 100000) {
      const lakh = Math.floor(afterCrore / 100000);
      takaWords += convertHundreds(lakh) + " Lakh";
      const remainder = afterCrore % 100000;
      if (remainder > 0) takaWords += " ";
    }

    // Handle thousand (1,000)
    const afterLakh = afterCrore % 100000;
    if (afterLakh >= 1000) {
      const thousand = Math.floor(afterLakh / 1000);
      takaWords += convertHundreds(thousand) + " Thousand";
      const remainder = afterLakh % 1000;
      if (remainder > 0) takaWords += " ";
    }

    // Handle hundreds and below
    const belowThousand = afterLakh % 1000;
    if (belowThousand > 0) {
      takaWords += convertHundreds(belowThousand);
    }
  }

  let result = "";
  if (isNegative) result += "Minus ";

  if (paisa > 0) {
    result += "Taka " + takaWords + " and Paisa " + convertHundreds(paisa) + " Only";
  } else {
    result += "Taka " + takaWords + " Only";
  }

  return result.trim().replace(/\s+/g, " ");
}

// ============================================================
// UTILITY: Format currency with ৳ symbol
// Uses safe BDT formatter to guarantee Latin digits (0-9)
// ============================================================

const invoiceBdtFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

function fmtCurrency(value: number | undefined | null, isMasked?: boolean): string {
  if (isMasked) return VAT_MASKING_SENTINEL;
  if (value === null || value === undefined) return "\u2014";
  const num = Number(value);
  if (isNaN(num)) return "\u2014";
  // Use safe formatter to guarantee Latin digits (0-9) — avoid toLocaleString
  // which can fall back to Bengali numerals (০-৯) in some environments
  return `\u09F3${invoiceBdtFormatter.format(num)}`;
}

// ============================================================
// UTILITY: Format number (no currency symbol)
// Uses safe formatter to guarantee Latin digits (0-9)
// ============================================================

function fmtNumber(value: number | undefined | null): string {
  if (value === null || value === undefined) return "\u2014";
  const num = Number(value);
  if (isNaN(num)) return "\u2014";
  // Use safe formatter to guarantee Latin digits (0-9)
  return invoiceBdtFormatter.format(num);
}

// ============================================================
// UTILITY: Format date "28 Apr 2026" style
// ============================================================

function fmtDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "\u2014";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(dateStr);
  }
}

// ============================================================
// UTILITY: Safe string — show blank/dash instead of undefined
// ============================================================

function safeStr(value: string | undefined | null, fallback: string = ""): string {
  if (value === null || value === undefined || value === "") return fallback;
  return value;
}

// ============================================================
// UTILITY: Check if a field should be masked for VAT Auditor
// ============================================================

function isFieldMasked(fieldName: string, isVatAuditor?: boolean, vatMaskedFields?: string[]): boolean {
  if (!isVatAuditor) return false;
  if (!vatMaskedFields || vatMaskedFields.length === 0) return false;
  return vatMaskedFields.some(
    (m) => m.toLowerCase() === fieldName.toLowerCase()
  );
}

// ============================================================
// HELPER: Draw Company Header Section
// Y=0 to Y≈73
// - Company Logo (if available and template.showLogo)
// - Company Name: Bold 16pt, left-aligned
// - Company Address: Bold 14pt
// - Mobile Number: Bold 14pt
// - Invoice Title: Bold 11pt, centered
// Returns the Y position after the header
// ============================================================

function drawCompanyHeader(
  doc: jsPDF,
  company: InvoiceCompanyProfile,
  template: InvoiceTemplateConfig,
  invoiceType: string
): number {
  let y = MARGIN_TOP;
  const logoW = company.logoWidth || 30;
  const logoH = company.logoHeight || 20;
  let textStartX = MARGIN_LEFT;

  // Draw company logo if available
  if (company.logo && template.showLogo !== false) {
    try {
      const dataUrl = company.logo.startsWith("data:")
        ? company.logo
        : `data:image/png;base64,${company.logo}`;
      doc.addImage(dataUrl, "PNG", MARGIN_LEFT, y, logoW, logoH);
      textStartX = MARGIN_LEFT + logoW + 4;
    } catch {
      // If logo fails to render, skip it
      textStartX = MARGIN_LEFT;
    }
  }

  // Draw brand logo on the right if available
  if (company.brandLogo && template.showBrandLogo !== false) {
    try {
      const brandDataUrl = company.brandLogo.startsWith("data:")
        ? company.brandLogo
        : `data:image/png;base64,${company.brandLogo}`;
      doc.addImage(brandDataUrl, "PNG", PAGE_WIDTH - MARGIN_RIGHT - logoW, y, logoW, logoH);
    } catch {
      // If brand logo fails to render, skip it
    }
  }

  // Company Name — Bold 16pt
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(10, 22, 40);
  doc.text(safeStr(company.name, "Company Name"), textStartX, y + 7);

  y += 10;

  // Company Address — Bold 14pt
  if (company.address && template.showAddress !== false) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(company.address, textStartX, y + 3);
    y += 7;
  }

  // Mobile Number — Bold 14pt
  if (company.mobile && template.showMobile !== false) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`Mobile Number: ${company.mobile}`, textStartX, y + 3);
    y += 7;
  }

  // Phone (if mobile not shown but phone exists)
  if (company.phone && !company.mobile) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Phone: ${company.phone}`, textStartX, y + 3);
    y += 6;
  }

  // Email
  if (company.email) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(company.email, textStartX, y + 3);
    doc.setTextColor(10, 22, 40);
    y += 5;
  }

  // VAT Number
  if (company.vatNumber && template.showVatNumber) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`VAT No: ${company.vatNumber}`, textStartX, y + 3);
    y += 5;
  }

  // Trade License
  if (company.tradeLicense && template.showTradeLicense) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Trade License: ${company.tradeLicense}`, textStartX, y + 3);
    y += 5;
  }

  // Separator line
  y += 2;
  doc.setDrawColor(10, 22, 40);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 4;

  // Invoice Title — Bold 11pt, centered
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(10, 22, 40);
  const titleText = safeStr(invoiceType, "Invoice");
  const titleWidth = doc.getTextWidth(titleText);
  doc.text(titleText, PAGE_WIDTH / 2 - titleWidth / 2, y);
  y += 4;

  // Separator line
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 4;

  return y;
}

// ============================================================
// HELPER: Draw Metadata Grid
// Two-column grid: LEFT (Invoice info) and RIGHT (dates/due)
// Returns the Y position after the metadata grid
// ============================================================

function drawMetadataGrid(
  doc: jsPDF,
  invoice: InvoiceData,
  template: InvoiceTemplateConfig,
  startY: number,
  isVatAuditor?: boolean,
  vatMaskedFields?: string[]
): number {
  let y = startY;
  const colWidth = CONTENT_WIDTH / 2;
  const leftX = MARGIN_LEFT;
  const rightX = MARGIN_LEFT + colWidth;
  const labelOffset = 0;
  const valueOffset = 35;
  const rowHeight = 6;

  doc.setFontSize(9);
  doc.setTextColor(10, 22, 40);

  // LEFT COLUMN
  const leftItems: Array<{ label: string; value: string }> = [];
  leftItems.push({ label: "Invoice No:", value: safeStr(invoice.invoiceNo) });
  if (invoice.customerCode && template.showCustomerCode !== false) {
    leftItems.push({ label: "Customer Code:", value: safeStr(invoice.customerCode) });
  }
  leftItems.push({ label: "Customer Name:", value: safeStr(invoice.customerName) });
  if (invoice.customerMobile) {
    leftItems.push({ label: "Mobile No:", value: safeStr(invoice.customerMobile) });
  }
  if (invoice.customerAddress && template.showAddress !== false) {
    leftItems.push({ label: "Address:", value: safeStr(invoice.customerAddress) });
  }

  // RIGHT COLUMN
  const rightItems: Array<{ label: string; value: string }> = [];
  rightItems.push({ label: "Invoice Date:", value: fmtDate(invoice.invoiceDate) });
  if (invoice.prevDue !== undefined && template.showPrevDue !== false) {
    const masked = isFieldMasked("prevDue", isVatAuditor, vatMaskedFields);
    rightItems.push({ label: "Prev.Due:", value: fmtCurrency(invoice.prevDue, masked) });
  }
  if (invoice.totalDue !== undefined && template.showTotalDue !== false) {
    const masked = isFieldMasked("totalDue", isVatAuditor, vatMaskedFields);
    rightItems.push({ label: "Total Due:", value: fmtCurrency(invoice.totalDue, masked) });
  }
  if (invoice.remindDate && template.showRemindDate) {
    rightItems.push({ label: "Remind Date:", value: fmtDate(invoice.remindDate) });
  }

  // Draw the grid with light background
  const maxRows = Math.max(leftItems.length, rightItems.length);
  const gridHeight = maxRows * rowHeight + 4;

  // Light background
  doc.setFillColor(248, 250, 252);
  doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, gridHeight, "F");

  // Border around grid
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, gridHeight);

  // Center divider
  doc.line(MARGIN_LEFT + colWidth, y, MARGIN_LEFT + colWidth, y + gridHeight);

  // Draw left column items
  let rowY = y + 5;
  for (const item of leftItems) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(item.label, leftX + 2 + labelOffset, rowY);
    doc.setFont("helvetica", "normal");
    doc.text(item.value, leftX + 2 + valueOffset, rowY);
    // Row separator
    doc.setDrawColor(230, 230, 230);
    doc.line(leftX + 2, rowY + 2, leftX + colWidth - 2, rowY + 2);
    rowY += rowHeight;
  }

  // Draw right column items
  rowY = y + 5;
  for (const item of rightItems) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(item.label, rightX + 2 + labelOffset, rowY);
    doc.setFont("helvetica", "normal");
    doc.text(item.value, rightX + 2 + valueOffset, rowY);
    // Row separator
    doc.setDrawColor(230, 230, 230);
    doc.line(rightX + 2, rowY + 2, rightX + colWidth - 2, rowY + 2);
    rowY += rowHeight;
  }

  return y + gridHeight + 4;
}

// ============================================================
// HELPER: Draw Items Table
// Dynamic columns based on template config
// Column widths: SL=8, Model=25, Color=15, Description=35,
//   Qty=12, MRP=18, Dis.Amt=18, UnitPrice=18, Amount=20
// Returns the Y position after the table
// ============================================================

function drawItemsTable(
  doc: jsPDF,
  items: InvoiceLineItem[],
  template: InvoiceTemplateConfig,
  startY: number,
  isVatAuditor?: boolean,
  vatMaskedFields?: string[]
): number {
  // Build dynamic columns based on template toggles
  const columns: Array<{ header: string; width: number; key: string; align: "left" | "right" | "center"; isCurrency?: boolean }> = [];

  columns.push({ header: "SL", width: 8, key: "sl", align: "center" });

  if (template.showModel !== false) {
    columns.push({ header: "Model", width: 25, key: "model", align: "left" });
  }
  if (template.showColor !== false) {
    columns.push({ header: "Color", width: 15, key: "color", align: "left" });
  }
  if (template.showDescription !== false) {
    columns.push({ header: "Description", width: 35, key: "description", align: "left" });
  }

  columns.push({ header: "Qty", width: 12, key: "qty", align: "center" });

  if (template.showMRP !== false) {
    columns.push({ header: "MRP", width: 18, key: "mrp", align: "right", isCurrency: true });
  }
  if (template.showDiscountAmt !== false) {
    columns.push({ header: "Dis. Amt", width: 18, key: "discountAmt", align: "right", isCurrency: true });
  }
  if (template.showUnitPrice !== false) {
    columns.push({ header: "Unit Price", width: 18, key: "unitPrice", align: "right", isCurrency: true });
  }

  columns.push({ header: "Amount", width: 20, key: "amount", align: "right", isCurrency: true });

  // Recalculate column widths proportionally to fill content width
  const totalSpecWidth = columns.reduce((sum, c) => sum + c.width, 0);
  if (totalSpecWidth !== CONTENT_WIDTH) {
    const scale = CONTENT_WIDTH / totalSpecWidth;
    columns.forEach((c) => {
      c.width = Math.round(c.width * scale * 10) / 10;
    });
  }

  // Build header and body arrays
  const headers = columns.map((c) => c.header);
  const columnStyles: Record<number, any> = {};
  columns.forEach((c, i) => {
    columnStyles[i] = {
      cellWidth: c.width,
      halign: c.align,
    };
  });

  const body = items.map((item) => {
    const row: string[] = [];
    for (const col of columns) {
      switch (col.key) {
        case "sl":
          row.push(String(item.sl));
          break;
        case "model":
          row.push(safeStr(item.model));
          break;
        case "color":
          row.push(safeStr(item.color));
          break;
        case "description":
          row.push(safeStr(item.description));
          break;
        case "qty":
          row.push(String(item.qty));
          break;
        case "mrp": {
          const masked = isFieldMasked("mrp", isVatAuditor, vatMaskedFields);
          row.push(fmtCurrency(item.mrp, masked));
          break;
        }
        case "discountAmt": {
          const masked = isFieldMasked("discountAmt", isVatAuditor, vatMaskedFields);
          row.push(fmtCurrency(item.discountAmt, masked));
          break;
        }
        case "unitPrice": {
          const masked = isFieldMasked("unitPrice", isVatAuditor, vatMaskedFields);
          row.push(fmtCurrency(item.unitPrice, masked));
          break;
        }
        case "amount": {
          const masked = isFieldMasked("amount", isVatAuditor, vatMaskedFields);
          row.push(fmtCurrency(item.amount, masked));
          break;
        }
        default:
          row.push("");
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
      case "sl":
        totalRow.push("");
        break;
      case "qty":
        totalRow.push(String(totalQty));
        break;
      case "amount": {
        const masked = isFieldMasked("amount", isVatAuditor, vatMaskedFields);
        totalRow.push(fmtCurrency(totalAmount, masked));
        break;
      }
      case "model":
      case "color":
      case "description":
        if (col === columns.find((c) => c.key === "description") || (col.key === "model" && !columns.find((c) => c.key === "description"))) {
          totalRow.push("Total");
        } else {
          totalRow.push("");
        }
        break;
      default:
        totalRow.push("");
    }
  }

  // Use autoTable for the items table
  autoTable(doc, {
    head: [headers],
    body: [...body, totalRow],
    startY: startY,
    margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT, bottom: MARGIN_BOTTOM },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: [30, 41, 59],
      lineWidth: 0.2,
      lineColor: [203, 213, 225],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [10, 22, 40],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
      cellPadding: 3,
    },
    bodyStyles: {
      textColor: [30, 41, 59],
    },
    columnStyles,
    // Style the total row (last row)
    didParseCell: (data: any) => {
      if (data.row.index === body.length && data.section === "body") {
        data.cell.styles.fillColor = [240, 244, 252];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 8;
      }
    },
  });

  const lastTable = (doc as any).lastAutoTable;
  return lastTable ? lastTable.finalY + 4 : startY + 30;
}

// ============================================================
// HELPER: Draw Summary Block
// Three-section layout:
//   LEFT: Discount%, Discount Amt, PP Discount Amt, Adjustment Amt
//   MIDDLE: Net Total, Paid Amt, Curr. Due, Deli. Cost
//   RIGHT: Payment Details table (Payment Type | Paid Amount)
// Returns the Y position after the summary block
// ============================================================

function drawSummaryBlock(
  doc: jsPDF,
  invoice: InvoiceData,
  template: InvoiceTemplateConfig,
  startY: number,
  isVatAuditor?: boolean,
  vatMaskedFields?: string[]
): number {
  let y = startY;

  // Separator line
  doc.setDrawColor(10, 22, 40);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 4;

  const colWidth = CONTENT_WIDTH / 3;
  const leftX = MARGIN_LEFT;
  const midX = MARGIN_LEFT + colWidth;
  const rightX = MARGIN_LEFT + colWidth * 2;
  const rowHeight = 6;

  doc.setFontSize(9);
  doc.setTextColor(10, 22, 40);

  // ── LEFT SECTION: Discount & Adjustments ──
  const leftItems: Array<{ label: string; value: string }> = [];

  if (template.showDiscountPct !== false && invoice.discountPercent !== undefined) {
    leftItems.push({ label: "Discount (%):", value: fmtNumber(invoice.discountPercent) });
  }
  if (template.showDiscountAmt !== false && invoice.discountAmount !== undefined) {
    const masked = isFieldMasked("discountAmount", isVatAuditor, vatMaskedFields);
    leftItems.push({ label: "Discount Amt.:", value: fmtCurrency(invoice.discountAmount, masked) });
  }
  if (template.showPPDiscount !== false && invoice.ppDiscount !== undefined) {
    const masked = isFieldMasked("ppDiscount", isVatAuditor, vatMaskedFields);
    leftItems.push({ label: "PP Discount Amt:", value: fmtCurrency(invoice.ppDiscount, masked) });
  }
  if (template.showAdjustment !== false && invoice.adjustment !== undefined) {
    const masked = isFieldMasked("adjustment", isVatAuditor, vatMaskedFields);
    leftItems.push({ label: "Adjustment Amt:", value: fmtCurrency(invoice.adjustment, masked) });
  }

  // Draw left section
  let rowY = y + 2;
  for (const item of leftItems) {
    doc.setFont("helvetica", "bold");
    doc.text(item.label, leftX + 2, rowY + 4);
    doc.setFont("helvetica", "normal");
    doc.text(item.value, leftX + 38, rowY + 4);
    rowY += rowHeight;
  }

  // ── MIDDLE SECTION: Totals ──
  const midItems: Array<{ label: string; value: string; bold?: boolean }> = [];

  {
    const masked = isFieldMasked("netTotal", isVatAuditor, vatMaskedFields);
    midItems.push({ label: "Net Total:", value: fmtCurrency(invoice.netTotal, masked), bold: true });
  }
  {
    const masked = isFieldMasked("paidAmount", isVatAuditor, vatMaskedFields);
    midItems.push({ label: "Paid Amt:", value: fmtCurrency(invoice.paidAmount, masked) });
  }
  {
    const masked = isFieldMasked("currentDue", isVatAuditor, vatMaskedFields);
    midItems.push({ label: "Curr. Due:", value: fmtCurrency(invoice.currentDue, masked), bold: true });
  }
  if (template.showDeliveryCost !== false && invoice.deliveryCost !== undefined) {
    const masked = isFieldMasked("deliveryCost", isVatAuditor, vatMaskedFields);
    midItems.push({ label: "Deli. Cost:", value: fmtCurrency(invoice.deliveryCost, masked) });
  }

  rowY = y + 2;
  for (const item of midItems) {
    doc.setFont("helvetica", item.bold ? "bold" : "bold");
    doc.text(item.label, midX + 2, rowY + 4);
    doc.setFont("helvetica", item.bold ? "bold" : "normal");
    doc.text(item.value, midX + 30, rowY + 4);
    rowY += rowHeight;
  }

  // ── RIGHT SECTION: Payment Details ──
  if (template.showPaymentDetails !== false && invoice.paymentDetails && invoice.paymentDetails.length > 0) {
    // Payment details header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("Payment Details", rightX + 2, y + 5);

    // Payment details table using autoTable
    const paymentHeaders = ["Payment Type", "Paid Amount"];
    const paymentBody = invoice.paymentDetails.map((pd) => {
      const masked = isFieldMasked("paidAmount", isVatAuditor, vatMaskedFields);
      return [safeStr(pd.paymentType), fmtCurrency(pd.paidAmount, masked)];
    });

    autoTable(doc, {
      head: [paymentHeaders],
      body: paymentBody,
      startY: y + 7,
      margin: { left: rightX, right: MARGIN_RIGHT, bottom: MARGIN_BOTTOM },
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
        fontStyle: "bold",
        fontSize: 7,
        cellPadding: 2,
      },
      columnStyles: {
        0: { cellWidth: colWidth * 0.55, halign: "left" },
        1: { cellWidth: colWidth * 0.45, halign: "right" },
      },
    });
  }

  // Calculate the max Y used by any of the three sections
  const leftEndY = y + 2 + leftItems.length * rowHeight;
  const midEndY = y + 2 + midItems.length * rowHeight;
  const lastTable = (doc as any).lastAutoTable;
  const tableEndY = lastTable ? lastTable.finalY + 2 : y + 20;

  return Math.max(leftEndY, midEndY, tableEndY) + 4;
}

// ============================================================
// HELPER: Draw Extra Fields
// - Pay In Word: [amount in words]
// - Due In Word: [due amount in words]
// - Remarks: [text]
// - Barcode: [barcode image]
// Returns the Y position after the extra fields
// ============================================================

function drawExtraFields(
  doc: jsPDF,
  invoice: InvoiceData,
  company: InvoiceCompanyProfile,
  template: InvoiceTemplateConfig,
  startY: number,
  isVatAuditor?: boolean,
  vatMaskedFields?: string[]
): number {
  let y = startY;

  // Separator line
  doc.setDrawColor(10, 22, 40);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 4;

  doc.setFontSize(9);
  doc.setTextColor(10, 22, 40);

  // Pay In Word
  if (company.showPayInWord !== false) {
    const payInWordText = invoice.payInWord || numberToWordsBDT(invoice.netTotal);
    const masked = isFieldMasked("netTotal", isVatAuditor, vatMaskedFields);
    doc.setFont("helvetica", "bold");
    doc.text("Pay In Word:", MARGIN_LEFT + 2, y + 4);
    doc.setFont("helvetica", "normal");
    doc.text(masked ? VAT_MASKING_SENTINEL : payInWordText, MARGIN_LEFT + 28, y + 4);
    y += 7;
  }

  // Due In Word
  if (invoice.currentDue > 0 && company.showPayInWord !== false) {
    const dueInWordText = invoice.dueInWord || numberToWordsBDT(invoice.currentDue);
    const masked = isFieldMasked("currentDue", isVatAuditor, vatMaskedFields);
    doc.setFont("helvetica", "bold");
    doc.text("Due In Word:", MARGIN_LEFT + 2, y + 4);
    doc.setFont("helvetica", "normal");
    doc.text(masked ? VAT_MASKING_SENTINEL : dueInWordText, MARGIN_LEFT + 28, y + 4);
    y += 7;
  }

  // Remarks
  if (invoice.remarks) {
    doc.setFont("helvetica", "bold");
    doc.text("Remarks:", MARGIN_LEFT + 2, y + 4);
    doc.setFont("helvetica", "normal");
    // Truncate remarks if too long for one line
    const maxWidth = CONTENT_WIDTH - 28;
    const remarksText = doc.splitTextToSize(invoice.remarks, maxWidth);
    doc.text(remarksText, MARGIN_LEFT + 28, y + 4);
    y += 4 + remarksText.length * 4;
  }

  // Barcode
  if (company.showBarcode && invoice.barcodeData) {
    try {
      // Generate a simple barcode representation using lines
      // For a proper barcode, use a library like JsBarcode
      // Here we create a visual barcode representation
      const barcodeX = PAGE_WIDTH - MARGIN_RIGHT - 60;
      const barcodeY = y;
      const barcodeWidth = 55;
      const barcodeHeight = 12;

      // Draw barcode background
      doc.setFillColor(255, 255, 255);
      doc.rect(barcodeX, barcodeY, barcodeWidth, barcodeHeight + 6, "F");
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(barcodeX, barcodeY, barcodeWidth, barcodeHeight + 6);

      // Draw barcode data as text (simplified representation)
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);

      // Draw simplified barcode lines
      const lineCount = Math.min(invoice.barcodeData.length * 3, 80);
      const lineWidth = (barcodeWidth - 4) / lineCount;
      for (let i = 0; i < lineCount; i++) {
        const x = barcodeX + 2 + i * lineWidth;
        const isBar = (i + Math.floor(i / 3)) % 2 === 0;
        if (isBar) {
          doc.setFillColor(0, 0, 0);
          doc.rect(x, barcodeY + 1, Math.max(lineWidth * 0.6, 0.3), barcodeHeight - 2, "F");
        }
      }

      // Barcode text
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      const barcodeText = invoice.barcodeData.substring(0, 20);
      const textWidth = doc.getTextWidth(barcodeText);
      doc.text(barcodeText, barcodeX + barcodeWidth / 2 - textWidth / 2, barcodeY + barcodeHeight + 1);

      y = barcodeY + barcodeHeight + 8;
    } catch {
      // If barcode fails, skip it
    }
  }

  return y + 2;
}

// ============================================================
// HELPER: Draw Footer Section
// - "Thank You Come Again." (bold, centered)
// - Signature line: Customer's Signature | Prepared By | Checked By | Authorized By
// - System note: "Printed By [username] Sales Person: [name] Print Date: [date]"
// - "This is a system generated invoice no need to seal & signature."
// ============================================================

function drawFooterSection(
  doc: jsPDF,
  invoice: InvoiceData,
  company: InvoiceCompanyProfile,
  template: InvoiceTemplateConfig,
  startY: number
): number {
  let y = startY;

  // Separator line
  doc.setDrawColor(10, 22, 40);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 5;

  // "Thank You Come Again." — bold, centered
  const thankYouMsg = company.thankYouMsg || "Thank You Come Again.";
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(10, 22, 40);
  const thankYouWidth = doc.getTextWidth(thankYouMsg);
  doc.text(thankYouMsg, PAGE_WIDTH / 2 - thankYouWidth / 2, y);
  y += 8;

  // Signature line section
  const sigSectionWidth = CONTENT_WIDTH / 4;
  const sigY = y + 15; // Leave space for signature above the line

  // Draw signature lines
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.2);

  const signatureItems: Array<{ label: string; x: number; show: boolean }> = [
    { label: "Customer's Signature", x: MARGIN_LEFT, show: template.showCustomerSignature !== false },
    { label: "Prepared By", x: MARGIN_LEFT + sigSectionWidth, show: template.showPreparedBy !== false },
    { label: "Checked By", x: MARGIN_LEFT + sigSectionWidth * 2, show: template.showCheckedBy !== false },
    { label: "Authorized By", x: MARGIN_LEFT + sigSectionWidth * 3, show: template.showAuthorizedBy !== false },
  ];

  for (const sig of signatureItems) {
    if (sig.show) {
      doc.line(sig.x, sigY, sig.x + sigSectionWidth - 10, sigY);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      const labelWidth = doc.getTextWidth(sig.label);
      doc.text(sig.label, sig.x + (sigSectionWidth - 10) / 2 - labelWidth / 2, sigY + 4);
    }
  }

  y = sigY + 10;

  // System note
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");

  const systemParts: string[] = [];
  if (invoice.printedBy && template.showPrintedBy !== false) {
    systemParts.push(`Printed By ${invoice.printedBy}`);
  }
  if (invoice.salesPerson && template.showSalesPerson !== false) {
    systemParts.push(`Sales Person: ${invoice.salesPerson}`);
  }
  if (template.showPrintDate !== false) {
    systemParts.push(`Print Date: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`);
  }
  if (systemParts.length > 0) {
    doc.text(systemParts.join("  |  "), MARGIN_LEFT + 2, y);
    y += 5;
  }

  // System-generated note
  const systemNote = company.systemNote || "This is a system generated invoice no need to seal & signature.";
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(130, 130, 130);
  const noteWidth = doc.getTextWidth(systemNote);
  doc.text(systemNote, PAGE_WIDTH / 2 - noteWidth / 2, y);
  y += 5;

  // Terms and conditions (if provided)
  if (template.termsAndConditions) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("Terms & Conditions:", MARGIN_LEFT + 2, y);
    y += 4;
    const tncLines = doc.splitTextToSize(template.termsAndConditions, CONTENT_WIDTH - 4);
    doc.text(tncLines, MARGIN_LEFT + 2, y);
    y += tncLines.length * 3.5;
  }

  // Custom footer note
  if (template.customFooterNote) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(120, 120, 120);
    const customLines = doc.splitTextToSize(template.customFooterNote, CONTENT_WIDTH - 4);
    doc.text(customLines, MARGIN_LEFT + 2, y);
    y += customLines.length * 3.5;
  }

  return y;
}

// ============================================================
// HELPER: Draw Invoice Header on Subsequent Pages
// For multi-page invoices — compact header with company name,
// invoice number, and "Continued" indicator
// Returns the Y position after the header
// ============================================================

function drawContinuationHeader(
  doc: jsPDF,
  company: InvoiceCompanyProfile,
  invoice: InvoiceData,
  pageNumber: number
): number {
  let y = MARGIN_TOP;

  // Thin header bar
  doc.setFillColor(10, 22, 40);
  doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, 10, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(safeStr(company.name, "Company"), MARGIN_LEFT + 3, y + 4);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const pageInfo = `${invoice.invoiceType} #${invoice.invoiceNo} \u2014 Page ${pageNumber} (Continued)`;
  const pageInfoWidth = doc.getTextWidth(pageInfo);
  doc.text(pageInfo, PAGE_WIDTH - MARGIN_RIGHT - pageInfoWidth - 3, y + 4);

  y += 14;

  // Column headers for continued items
  return y;
}

// ============================================================
// HELPER: Check page overflow and add new page if needed
// Returns the new Y position (may be on a new page)
// ============================================================

function checkPageOverflow(
  doc: jsPDF,
  currentY: number,
  requiredSpace: number,
  company: InvoiceCompanyProfile,
  invoice: InvoiceData,
  currentPage: number
): { y: number; page: number } {
  if (currentY + requiredSpace > PAGE_HEIGHT - MARGIN_BOTTOM - 20) {
    doc.addPage();
    const newY = drawContinuationHeader(doc, company, invoice, currentPage + 1);
    return { y: newY, page: currentPage + 1 };
  }
  return { y: currentY, page: currentPage };
}

// ============================================================
// CORE FUNCTION: Export Invoice PDF
// Generates a portrait A4 invoice PDF matching the RenderReport.pdf layout
// ============================================================

export function exportInvoicePDF(options: InvoicePDFOptions): void {
  const {
    company,
    template,
    invoice,
    filename,
    isVatAuditor = false,
    vatMaskedFields = [],
  } = options;

  try {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    let currentPage = 1;

    // ── 1. Company Header Section ──
    let y = drawCompanyHeader(doc, company, template, invoice.invoiceType);

    // ── 2. Metadata Grid Section ──
    const overflow = checkPageOverflow(doc, y, 40, company, invoice, currentPage);
    y = overflow.y;
    currentPage = overflow.page;

    y = drawMetadataGrid(doc, invoice, template, y, isVatAuditor, vatMaskedFields);

    // ── 3. Items Table Section ──
    // For multi-page handling, we split items into pages
    const itemsPerPage = 15; // Conservative estimate
    const totalItems = invoice.items.length;

    if (totalItems > 0) {
      // If items might overflow, handle pagination
      if (totalItems > itemsPerPage) {
        // Draw first page of items
        const firstPageItems = invoice.items.slice(0, itemsPerPage);
        y = drawItemsTable(doc, firstPageItems, template, y, isVatAuditor, vatMaskedFields);

        // Draw remaining pages
        let itemOffset = itemsPerPage;
        while (itemOffset < totalItems) {
          doc.addPage();
          currentPage++;
          y = drawContinuationHeader(doc, company, invoice, currentPage);

          const pageItems = invoice.items.slice(itemOffset, itemOffset + itemsPerPage);
          y = drawItemsTable(doc, pageItems, template, y, isVatAuditor, vatMaskedFields);
          itemOffset += itemsPerPage;
        }
      } else {
        // All items fit on one page
        const overflow2 = checkPageOverflow(doc, y, 60, company, invoice, currentPage);
        y = overflow2.y;
        currentPage = overflow2.page;

        y = drawItemsTable(doc, invoice.items, template, y, isVatAuditor, vatMaskedFields);
      }
    } else {
      // No items — draw empty table
      const overflow3 = checkPageOverflow(doc, y, 30, company, invoice, currentPage);
      y = overflow3.y;
      currentPage = overflow3.page;

      y = drawItemsTable(doc, [], template, y, isVatAuditor, vatMaskedFields);
    }

    // ── 4. Summary Block Section ──
    const overflow4 = checkPageOverflow(doc, y, 50, company, invoice, currentPage);
    y = overflow4.y;
    currentPage = overflow4.page;

    y = drawSummaryBlock(doc, invoice, template, y, isVatAuditor, vatMaskedFields);

    // ── 5. Extra Fields Section ──
    const overflow5 = checkPageOverflow(doc, y, 30, company, invoice, currentPage);
    y = overflow5.y;
    currentPage = overflow5.page;

    y = drawExtraFields(doc, invoice, company, template, y, isVatAuditor, vatMaskedFields);

    // ── 6. Footer Section ──
    const overflow6 = checkPageOverflow(doc, y, 40, company, invoice, currentPage);
    y = overflow6.y;
    currentPage = overflow6.page;

    drawFooterSection(doc, invoice, company, template, y);

    // ── 7. Add VAT Auditor Watermark (if applicable) ──
    if (isVatAuditor) {
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(48);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(200, 200, 200);
        doc.saveGraphicsState();
        // Set transparency for watermark
        doc.setGState(new (doc as any).GState({ opacity: 0.15 }));
        const watermark = "VAT AUDITOR MODE";
        const wmWidth = doc.getTextWidth(watermark);
        // Rotate and center the watermark
        doc.text(watermark, PAGE_WIDTH / 2 - wmWidth / 2, PAGE_HEIGHT / 2, {
          angle: 45,
        });
        doc.restoreGraphicsState();
      }
    }

    // ── 8. Save PDF ──
    const rawFilename =
      filename ||
      `${invoice.invoiceType.replace(/\s+/g, "-")}_${invoice.invoiceNo.replace(/[^a-zA-Z0-9-]/g, "")}`.toLowerCase();
    const safeFilename = rawFilename.replace(/\.pdf$/i, "");
    doc.save(`${safeFilename}.pdf`);
  } catch (error: any) {
    console.error("Invoice PDF Export Error:", error);
    throw new Error(`Invoice PDF export failed: ${error.message || "Unknown error"}`);
  }
}

// ============================================================
// HELPER: Generate sample invoice data for testing
// ============================================================

export function generateSampleInvoiceData(): InvoicePDFOptions {
  return {
    company: {
      name: "Electronics Mart",
      address: "Jessore",
      mobile: "01403120044",
      email: "info@electronicsmart.com",
      showBarcode: true,
      showPayInWord: true,
      thankYouMsg: "Thank You Come Again.",
      systemNote: "This is a system generated invoice no need to seal & signature.",
    },
    template: {
      showLogo: true,
      showBrandLogo: true,
      showMobile: true,
      showAddress: true,
      showCustomerCode: true,
      showPrevDue: true,
      showTotalDue: true,
      showRemindDate: true,
      showModel: true,
      showColor: true,
      showDescription: true,
      showMRP: true,
      showDiscountAmt: true,
      showUnitPrice: true,
      showDiscountPct: true,
      showPPDiscount: true,
      showAdjustment: true,
      showDeliveryCost: true,
      showPaymentDetails: true,
      showCustomerSignature: true,
      showPreparedBy: true,
      showCheckedBy: true,
      showAuthorizedBy: true,
      showPrintedBy: true,
      showSalesPerson: true,
      showPrintDate: true,
    },
    invoice: {
      invoiceNo: "INV-2026-001234",
      invoiceDate: "2026-04-28",
      customerCode: "C-001056",
      customerName: "Rahim Electronics",
      customerMobile: "01712345678",
      customerAddress: "Main Road, Jessore",
      prevDue: 5000,
      totalDue: 155000,
      remindDate: "2026-05-28",
      items: [
        { sl: 1, model: "SM-A145", color: "Black", description: "Samsung Galaxy A14", qty: 2, mrp: 15000, discountAmt: 500, unitPrice: 14750, amount: 29500 },
        { sl: 2, model: "SM-A345", color: "Blue", description: "Samsung Galaxy A34 5G", qty: 1, mrp: 35000, discountAmt: 1000, unitPrice: 34000, amount: 34000 },
        { sl: 3, model: "RB-32HD", color: "Black", description: "Realme 32\" HD Smart TV", qty: 3, mrp: 12000, discountAmt: 0, unitPrice: 12000, amount: 36000 },
        { sl: 4, model: "XP-E15", color: "White", description: "Xiaomi Power Bank 15000mAh", qty: 5, mrp: 1800, discountAmt: 100, unitPrice: 1700, amount: 8500 },
        { sl: 5, model: "BT-S50", color: "Red", description: "JBL Bluetooth Speaker", qty: 2, mrp: 5500, discountAmt: 200, unitPrice: 5300, amount: 10600 },
      ],
      discountPercent: 5,
      discountAmount: 5930,
      ppDiscount: 0,
      adjustment: 0,
      netTotal: 118600,
      paidAmount: 100000,
      currentDue: 18600,
      deliveryCost: 0,
      paymentDetails: [
        { paymentType: "Cash", paidAmount: 50000 },
        { paymentType: "bKash", paidAmount: 30000 },
        { paymentType: "Card", paidAmount: 20000 },
      ],
      payInWord: "",
      dueInWord: "",
      remarks: "Thank you for your business!",
      barcodeData: "INV-2026-001234",
      printedBy: "Amit Admin",
      salesPerson: "Kamal Hossain",
      invoiceType: "Sales Invoice",
    },
    isVatAuditor: false,
    vatMaskedFields: [],
  };
}
