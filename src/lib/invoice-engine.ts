// ============================================================
// VoltERP — ELECTRONICS MART IMS
// Dynamic Invoice PDF Engine (Client-Side)
// Fixed: Logo rendering, title, item table, customer details,
// Bengali fallback, date format, VAT, Pay In Word, signatures,
// layout, system note — matches server-side route.ts
// ============================================================

import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

// ============================================================
// TYPES
// ============================================================

export interface InvoiceCompanyProfile {
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

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_LEFT = 10;
const MARGIN_RIGHT = 10;
const MARGIN_TOP = 8;
const MARGIN_BOTTOM = 8;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

const VAT_MASKING_SENTINEL = "N/A (Audit Mode)";

// ============================================================
// UTILITY: Number to Words (BDT Format)
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
  const taka = Math.floor(absAmount);
  const paisa = Math.round((absAmount - taka) * 100);

  let takaWords = "";

  if (taka === 0) {
    takaWords = "Zero";
  } else {
    if (taka >= 10000000) {
      const crore = Math.floor(taka / 10000000);
      takaWords += convertHundreds(crore) + " Crore";
      const remainder = taka % 10000000;
      if (remainder > 0) takaWords += " ";
    }
    const afterCrore = taka % 10000000;
    if (afterCrore >= 100000) {
      const lakh = Math.floor(afterCrore / 100000);
      takaWords += convertHundreds(lakh) + " Lakh";
      const remainder = afterCrore % 100000;
      if (remainder > 0) takaWords += " ";
    }
    const afterLakh = afterCrore % 100000;
    if (afterLakh >= 1000) {
      const thousand = Math.floor(afterLakh / 1000);
      takaWords += convertHundreds(thousand) + " Thousand";
      const remainder = afterLakh % 1000;
      if (remainder > 0) takaWords += " ";
    }
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
// UTILITY FUNCTIONS
// ============================================================

const invoiceBdtFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

function fmtCurrency(value: number | undefined | null, isMasked?: boolean): string {
  if (isMasked) return VAT_MASKING_SENTINEL;
  if (value === null || value === undefined) return "\u2014";
  const num = Number(value);
  if (isNaN(num)) return "\u2014";
  return `Tk. ${invoiceBdtFormatter.format(num)}`;
}

function fmtNumber(value: number | undefined | null): string {
  if (value === null || value === undefined) return "\u2014";
  const num = Number(value);
  if (isNaN(num)) return "\u2014";
  return invoiceBdtFormatter.format(num);
}

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

function safeStr(value: string | undefined | null, fallback: string = ""): string {
  if (value === null || value === undefined || value === "") return fallback;
  return value;
}

function isFieldMasked(fieldName: string, isVatAuditor?: boolean, vatMaskedFields?: string[]): boolean {
  if (!isVatAuditor) return false;
  if (!vatMaskedFields || vatMaskedFields.length === 0) return false;
  return vatMaskedFields.some((m) => m.toLowerCase() === fieldName.toLowerCase());
}

// Check if a string contains non-ASCII (e.g., Bengali) characters
function hasNonAscii(str: string): boolean {
  return /[^\x00-\x7F]/.test(str);
}

// Get a safe thank-you message (fallback for Bengali text that jsPDF can't render)
function getSafeThankYouMsg(msg: string | undefined): string {
  const fallback = "Thank You! Come Again.";
  if (!msg) return fallback;
  if (hasNonAscii(msg)) {
    return fallback;
  }
  return msg;
}

// ============================================================
// HELPER: Draw Company Header Section
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

  // Draw company logo (left side)
  if (company.logo && template.showLogo !== false) {
    try {
      let dataUrl = company.logo;
      if (!dataUrl.startsWith("data:")) {
        dataUrl = `data:image/png;base64,${dataUrl}`;
      }
      const format = dataUrl.includes("image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(dataUrl, format, MARGIN_LEFT, y, logoW, logoH);
      textStartX = MARGIN_LEFT + logoW + 4;
    } catch {
      textStartX = MARGIN_LEFT;
    }
  }

  // Draw brand logo on the right side
  if (company.brandLogo && template.showBrandLogo !== false) {
    try {
      let brandDataUrl = company.brandLogo;
      if (!brandDataUrl.startsWith("data:")) {
        brandDataUrl = `data:image/png;base64,${brandDataUrl}`;
      }
      const format = brandDataUrl.includes("image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(brandDataUrl, format, PAGE_WIDTH - MARGIN_RIGHT - logoW, y, logoW, logoH);
    } catch { /* skip */ }
  }

  // Company Name
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(10, 22, 40);
  doc.text(safeStr(company.name, "Company Name"), textStartX, y + 7);
  y += 10;

  // Address
  if (company.address && template.showAddress !== false) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(company.address, textStartX, y + 3);
    y += 6;
  }

  // Mobile
  if (company.mobile && template.showMobile !== false) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`Mobile: ${company.mobile}`, textStartX, y + 3);
    y += 6;
  } else if (company.phone) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`Phone: ${company.phone}`, textStartX, y + 3);
    y += 6;
  }

  // Email
  if (company.email) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(company.email, textStartX, y + 3);
    doc.setTextColor(10, 22, 40);
    y += 5;
  }

  // VAT Number (always show if set — don't require template flag)
  if (company.vatNumber) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(`VAT No: ${company.vatNumber}`, textStartX, y + 3);
    doc.setTextColor(10, 22, 40);
    y += 5;
  }

  // Trade License
  if (company.tradeLicense && template.showTradeLicense) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(`Trade License: ${company.tradeLicense}`, textStartX, y + 3);
    doc.setTextColor(10, 22, 40);
    y += 5;
  }

  // Separator line
  y += 2;
  doc.setDrawColor(10, 22, 40);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 4;

  // Invoice Title — centered, bold
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(10, 22, 40);
  const titleText = safeStr(invoiceType, "Sales Invoice");
  const titleWidth = doc.getTextWidth(titleText);
  doc.text(titleText, PAGE_WIDTH / 2 - titleWidth / 2, y);
  y += 3;

  // Separator line
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 4;

  return y;
}

// ============================================================
// HELPER: Draw Metadata Grid
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
  const rowHeight = 5.5;

  doc.setFontSize(8);
  doc.setTextColor(10, 22, 40);

  // LEFT COLUMN — Customer info
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

  // RIGHT COLUMN — Date & Due info
  const rightItems: Array<{ label: string; value: string }> = [];
  rightItems.push({ label: "Invoice Date:", value: fmtDate(invoice.invoiceDate) });
  if (invoice.prevDue !== undefined && invoice.prevDue > 0 && template.showPrevDue !== false) {
    const masked = isFieldMasked("prevDue", isVatAuditor, vatMaskedFields);
    rightItems.push({ label: "Prev.Due:", value: fmtCurrency(invoice.prevDue, masked) });
  }
  if (invoice.totalDue !== undefined && invoice.totalDue > 0 && template.showTotalDue !== false) {
    const masked = isFieldMasked("totalDue", isVatAuditor, vatMaskedFields);
    rightItems.push({ label: "Total Due:", value: fmtCurrency(invoice.totalDue, masked) });
  }
  if (invoice.remindDate && template.showRemindDate) {
    rightItems.push({ label: "Remind Date:", value: fmtDate(invoice.remindDate) });
  }

  // Draw the grid with light background
  const maxRows = Math.max(leftItems.length, rightItems.length);
  const gridHeight = maxRows * rowHeight + 4;

  doc.setFillColor(248, 250, 252);
  doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, gridHeight, "F");

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, gridHeight);

  doc.line(MARGIN_LEFT + colWidth, y, MARGIN_LEFT + colWidth, y + gridHeight);

  // Draw left column items
  let rowY = y + 4;
  for (const item of leftItems) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(item.label, leftX + 2, rowY);
    doc.setFont("helvetica", "normal");
    doc.text(item.value, leftX + 32, rowY);
    doc.setDrawColor(230, 230, 230);
    doc.line(leftX + 2, rowY + 2, leftX + colWidth - 2, rowY + 2);
    rowY += rowHeight;
  }

  // Draw right column items
  rowY = y + 4;
  for (const item of rightItems) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(item.label, rightX + 2, rowY);
    doc.setFont("helvetica", "normal");
    doc.text(item.value, rightX + 32, rowY);
    doc.setDrawColor(230, 230, 230);
    doc.line(rightX + 2, rowY + 2, rightX + colWidth - 2, rowY + 2);
    rowY += rowHeight;
  }

  return y + gridHeight + 3;
}

// ============================================================
// HELPER: Draw Items Table
// Fixed: Always shows SL | Description | Qty | Unit Price | Amount
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

  columns.push({ header: "SL", width: 10, key: "sl", align: "center" });

  // Description is always shown (core requirement)
  if (template.showDescription !== false) {
    columns.push({ header: "Description", width: 75, key: "description", align: "left" });
  } else {
    // If description is hidden, show model or a generic column
    if (template.showModel !== false) {
      columns.push({ header: "Model", width: 75, key: "model", align: "left" });
    }
  }

  columns.push({ header: "Qty", width: 18, key: "qty", align: "center" });

  if (template.showMRP !== false) {
    columns.push({ header: "MRP", width: 25, key: "mrp", align: "right", isCurrency: true });
  }
  if (template.showDiscountAmt !== false) {
    columns.push({ header: "Dis. Amt", width: 25, key: "discountAmt", align: "right", isCurrency: true });
  }
  if (template.showUnitPrice !== false) {
    columns.push({ header: "Unit Price", width: 30, key: "unitPrice", align: "right", isCurrency: true });
  }

  columns.push({ header: "Amount", width: 30, key: "amount", align: "right", isCurrency: true });

  // Recalculate column widths proportionally
  const totalSpecWidth = columns.reduce((sum, c) => sum + c.width, 0);
  if (totalSpecWidth !== CONTENT_WIDTH) {
    const scale = CONTENT_WIDTH / totalSpecWidth;
    columns.forEach((c) => {
      c.width = Math.round(c.width * scale * 10) / 10;
    });
  }

  const headers = columns.map((c) => c.header);
  const columnStyles: Record<number, any> = {};
  columns.forEach((c, i) => {
    columnStyles[i] = { cellWidth: c.width, halign: c.align };
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
          row.push(safeStr(item.description, "Item"));
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

  autoTable(doc, {
    head: [headers],
    body: [...body, totalRow],
    startY: startY,
    margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT, bottom: 10 },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
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
      cellPadding: 2.5,
    },
    bodyStyles: {
      textColor: [30, 41, 59],
    },
    columnStyles,
    didParseCell: (data: any) => {
      if (data.row.index === body.length && data.section === "body") {
        data.cell.styles.fillColor = [240, 244, 252];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 8;
      }
    },
  });

  const lastTable = (doc as any).lastAutoTable;
  return lastTable ? lastTable.finalY + 3 : startY + 30;
}

// ============================================================
// HELPER: Draw Summary Block
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

  let rowY = y + 2;
  for (const item of leftItems) {
    doc.setFont("helvetica", "bold");
    doc.text(item.label, leftX + 2, rowY + 3);
    doc.setFont("helvetica", "normal");
    doc.text(item.value, leftX + 35, rowY + 3);
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
    doc.setFont("helvetica", "bold");
    doc.text(item.label, midX + 2, rowY + 3);
    doc.setFont("helvetica", item.bold ? "bold" : "normal");
    doc.text(item.value, midX + 28, rowY + 3);
    rowY += rowHeight;
  }

  // ── RIGHT SECTION: Payment Details ──
  if (template.showPaymentDetails !== false && invoice.paymentDetails && invoice.paymentDetails.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("Payment Details", rightX + 2, y + 4);

    const paymentHeaders = ["Payment Type", "Paid Amount"];
    const paymentBody = invoice.paymentDetails.map((pd) => {
      const masked = isFieldMasked("paidAmount", isVatAuditor, vatMaskedFields);
      return [safeStr(pd.paymentType), fmtCurrency(pd.paidAmount, masked)];
    });

    autoTable(doc, {
      head: [paymentHeaders],
      body: paymentBody,
      startY: y + 6,
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

  const leftEndY = y + 2 + leftItems.length * rowHeight;
  const midEndY = y + 2 + midItems.length * rowHeight;
  const lastTable = (doc as any).lastAutoTable;
  const tableEndY = lastTable ? lastTable.finalY + 2 : y + 20;

  return Math.max(leftEndY, midEndY, tableEndY) + 3;
}

// ============================================================
// HELPER: Draw Extra Fields (Pay In Word, Due In Word, Barcode)
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

  // Pay In Word (shown if company setting allows)
  if (company.showPayInWord !== false) {
    const payInWordText = invoice.payInWord || numberToWordsBDT(invoice.netTotal);
    const masked = isFieldMasked("netTotal", isVatAuditor, vatMaskedFields);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(10, 22, 40);
    doc.text("Pay In Word:", MARGIN_LEFT + 2, y + 3);
    doc.setFont("helvetica", "normal");
    const maxTextWidth = CONTENT_WIDTH - 28;
    const lines = doc.splitTextToSize(masked ? VAT_MASKING_SENTINEL : payInWordText, maxTextWidth);
    doc.text(lines, MARGIN_LEFT + 28, y + 3);
    y += 4 + lines.length * 4;
  }

  // Due In Word
  if (invoice.currentDue > 0 && company.showPayInWord !== false) {
    const dueInWordText = invoice.dueInWord || numberToWordsBDT(invoice.currentDue);
    const masked = isFieldMasked("currentDue", isVatAuditor, vatMaskedFields);
    doc.setFont("helvetica", "bold");
    doc.text("Due In Word:", MARGIN_LEFT + 2, y + 3);
    doc.setFont("helvetica", "normal");
    const maxTextWidth = CONTENT_WIDTH - 28;
    const lines = doc.splitTextToSize(masked ? VAT_MASKING_SENTINEL : dueInWordText, maxTextWidth);
    doc.text(lines, MARGIN_LEFT + 28, y + 3);
    y += 4 + lines.length * 4;
  }

  // Remarks
  if (invoice.remarks) {
    doc.setFont("helvetica", "bold");
    doc.text("Remarks:", MARGIN_LEFT + 2, y + 3);
    doc.setFont("helvetica", "normal");
    const maxWidth = CONTENT_WIDTH - 28;
    const remarksText = doc.splitTextToSize(invoice.remarks, maxWidth);
    doc.text(remarksText, MARGIN_LEFT + 28, y + 3);
    y += 4 + remarksText.length * 4;
  }

  // Barcode (simplified)
  if (company.showBarcode && invoice.barcodeData) {
    try {
      const barcodeX = PAGE_WIDTH - MARGIN_RIGHT - 55;
      const barcodeY = y;
      const barcodeWidth = 50;
      const barcodeHeight = 10;

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);

      const lineCount = Math.min(invoice.barcodeData.length * 3, 60);
      const lineWidth = (barcodeWidth - 4) / lineCount;
      for (let i = 0; i < lineCount; i++) {
        const x = barcodeX + 2 + i * lineWidth;
        const isBar = (i + Math.floor(i / 3)) % 2 === 0;
        if (isBar) {
          doc.setFillColor(0, 0, 0);
          doc.rect(x, barcodeY + 1, Math.max(lineWidth * 0.6, 0.3), barcodeHeight - 2, "F");
        }
      }

      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      const barcodeText = invoice.barcodeData.substring(0, 20);
      const textWidth = doc.getTextWidth(barcodeText);
      doc.text(barcodeText, barcodeX + barcodeWidth / 2 - textWidth / 2, barcodeY + barcodeHeight + 1);
      y = barcodeY + barcodeHeight + 6;
    } catch { /* skip */ }
  }

  return y + 2;
}

// ============================================================
// HELPER: Draw Footer Section
// Fixed: Bengali fallback, visible signature labels, no contradiction
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

  // Thank You message (with Bengali fallback)
  const thankYouMsg = getSafeThankYouMsg(company.thankYouMsg);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(10, 22, 40);
  const thankYouWidth = doc.getTextWidth(thankYouMsg);
  doc.text(thankYouMsg, PAGE_WIDTH / 2 - thankYouWidth / 2, y);
  y += 7;

  // Signature lines (3 columns: Customer, Prepared By, Authorized By)
  const sigSectionWidth = CONTENT_WIDTH / 3;
  const sigY = y + 12;

  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.2);

  const signatureItems: Array<{ label: string; x: number; show: boolean }> = [
    { label: "Customer's Signature", x: MARGIN_LEFT, show: template.showCustomerSignature !== false },
    { label: "Prepared By", x: MARGIN_LEFT + sigSectionWidth, show: template.showPreparedBy !== false },
    { label: "Authorized By", x: MARGIN_LEFT + sigSectionWidth * 2, show: template.showAuthorizedBy !== false },
  ];

  for (const sig of signatureItems) {
    if (sig.show) {
      doc.line(sig.x, sigY, sig.x + sigSectionWidth - 15, sigY);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      const labelWidth = doc.getTextWidth(sig.label);
      doc.text(sig.label, sig.x + (sigSectionWidth - 15) / 2 - labelWidth / 2, sigY + 4);
    }
  }

  y = sigY + 8;

  // System meta info
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");

  const systemParts: string[] = [];
  if (invoice.printedBy && template.showPrintedBy !== false) {
    systemParts.push(`Printed By: ${invoice.printedBy}`);
  }
  if (invoice.salesPerson && template.showSalesPerson !== false) {
    systemParts.push(`Sales Person: ${invoice.salesPerson}`);
  }
  if (template.showPrintDate !== false) {
    systemParts.push(`Print Date: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`);
  }
  if (systemParts.length > 0) {
    doc.text(systemParts.join("  |  "), MARGIN_LEFT + 2, y);
    y += 4;
  }

  // System-generated note
  const systemNote = company.systemNote || "This is a system generated invoice.";
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(130, 130, 130);
  const noteWidth = doc.getTextWidth(systemNote);
  doc.text(systemNote, PAGE_WIDTH / 2 - noteWidth / 2, y);
  y += 4;

  // Terms and conditions
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
// HELPER: Draw Continuation Header for multi-page
// ============================================================

function drawContinuationHeader(
  doc: jsPDF,
  company: InvoiceCompanyProfile,
  invoice: InvoiceData,
  pageNumber: number
): number {
  let y = MARGIN_TOP;

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
  return y;
}

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
    const itemsPerPage = 15;
    const totalItems = invoice.items.length;

    if (totalItems > 0) {
      if (totalItems > itemsPerPage) {
        const firstPageItems = invoice.items.slice(0, itemsPerPage);
        y = drawItemsTable(doc, firstPageItems, template, y, isVatAuditor, vatMaskedFields);

        let itemOffset = itemsPerPage;
        while (itemOffset < totalItems) {
          const pageItems = invoice.items.slice(itemOffset, itemOffset + itemsPerPage);
          const pageOverflow = checkPageOverflow(doc, y, 40, company, invoice, currentPage);
          y = pageOverflow.y;
          currentPage = pageOverflow.page;
          y = drawItemsTable(doc, pageItems, template, y, isVatAuditor, vatMaskedFields);
          itemOffset += itemsPerPage;
        }
      } else {
        y = drawItemsTable(doc, invoice.items, template, y, isVatAuditor, vatMaskedFields);
      }
    }

    // ── 4. Summary Block ──
    const summaryOverflow = checkPageOverflow(doc, y, 40, company, invoice, currentPage);
    y = summaryOverflow.y;
    currentPage = summaryOverflow.page;

    y = drawSummaryBlock(doc, invoice, template, y, isVatAuditor, vatMaskedFields);

    // ── 5. Extra Fields (Pay In Word, Due In Word, Barcode) ──
    const extraOverflow = checkPageOverflow(doc, y, 30, company, invoice, currentPage);
    y = extraOverflow.y;
    currentPage = extraOverflow.page;

    y = drawExtraFields(doc, invoice, company, template, y, isVatAuditor, vatMaskedFields);

    // ── 6. Footer Section (follows content flow — no excessive white space) ──
    const footerOverflow = checkPageOverflow(doc, y, 50, company, invoice, currentPage);
    y = footerOverflow.y;
    currentPage = footerOverflow.page;

    drawFooterSection(doc, invoice, company, template, y);

    // Save the PDF
    doc.save(filename || `Invoice_${invoice.invoiceNo}.pdf`);
  } catch (error) {
    console.error("Invoice PDF generation error:", error);
    throw error;
  }
}
