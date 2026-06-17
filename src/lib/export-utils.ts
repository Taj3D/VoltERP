// ============================================================
// VoltERP — ELECTRONICS MART IMS
// Centralized Export/Import Utility Core
// Export PDF (jsPDF v4 + autoTable v5) | Export CSV | Import CSV
// Production-Ready: Corporate Layout, VAT Masking, UTF-8 BOM,
// Batch Insert, Row-Level Validation, Two-Pass Page Footer
// ============================================================

// Type-only imports (erased at compile time, no runtime impact)
import type { jsPDF as JsPDFType } from "jspdf";

// ============================================================
// LAZY IMPORTS: JsPDFType, autoTable, and Papa are loaded on-demand
// to prevent "Invalid hook call" (React error #321) in production.
//
// Root cause: Top-level static imports of jsPDF/papaparse cause
// Next.js webpack to bundle them in the initial chunk. In
// production builds, the module resolution order can create a
// scenario where React's internal module state detects a
// duplicate or out-of-order module load, triggering error #321.
//
// Fix: Dynamic imports ensure these heavy client-side-only
// libraries load ONLY when the user actually clicks
// Export PDF / Export CSV / Import CSV — never during the
// initial page render or hydration cycle.
// ============================================================

let jsPDFModule: typeof import("jspdf") | null = null;
let autoTableModule: typeof import("jspdf-autotable") | null = null;
let papaModule: typeof import("papaparse") | null = null;

async function loadJsPDF(): Promise<typeof import("jspdf")> {
  if (!jsPDFModule) {
    jsPDFModule = await import("jspdf");
  }
  return jsPDFModule;
}

async function loadAutoTable(): Promise<typeof import("jspdf-autotable")> {
  if (!autoTableModule) {
    autoTableModule = await import("jspdf-autotable");
  }
  return autoTableModule;
}

async function loadPapa(): Promise<typeof import("papaparse")> {
  if (!papaModule) {
    papaModule = await import("papaparse");
  }
  return papaModule;
}

// NOTE: We use the standalone autoTable(doc, options) function instead of the
// applyPlugin(jsPDF) + doc.autoTable() pattern. The applyPlugin approach patches
// jsPDF.API but breaks in Next.js webpack/turbopack because the bundled jsPDF
// constructor may be a different reference than the one applyPlugin receives.
// The standalone autoTable() function works directly with the doc instance.

// ============================================================
// TYPES
// ============================================================

export interface ColumnDef {
  key: string;
  label: string;
  type?: "text" | "number" | "boolean" | "date" | "currency" | "select";
  options?: { value: string; label: string }[];
}

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "email" | "password" | "textarea" | "select" | "checkbox" | "date" | "image" | "section" | "warrantyGroup";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  defaultValue?: any;
  step?: string;
  /** For section type: icon name to display */
  sectionIcon?: string;
  /** For warrantyGroup type: the unit field key (e.g. "compressorWarrantyUnit") */
  unitKey?: string;
}

/** Company profile for dynamic branding in PDF header/footer */
export interface CompanyProfile {
  name: string;
  address?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  website?: string;
  logo?: string;       // Base64 data URL
  brandLogo?: string;  // Brand logo (high-res)
  logoData?: string;   // Logo data (alternative field)
  logoWidth?: number;  // mm (default 30)
  logoHeight?: number; // mm (default 20)
  vatNumber?: string;
  tradeLicense?: string;
  binNumber?: string;
  currencySymbol?: string;
  invoicePrefix?: string;
  thankYouMsg?: string;
  systemNote?: string;
  showBarcode?: boolean;
  showPayInWord?: boolean;
}

/** Summary row definition for PDF — appears after main table with distinct styling */
export interface SummaryRow {
  cells: string[];
  style?: {
    fillColor?: number[];
    textColor?: number[];
    fontStyle?: "normal" | "bold" | "italic" | "bolditalic";
    fontSize?: number;
  };
}

export interface PDFOptions {
  title: string;
  subtitle?: string;
  orientation?: "landscape" | "portrait";
  columns: ColumnDef[];
  data: any[];
  isVatAuditor?: boolean;
  vatMaskedColumns?: string[];
  filename?: string;
  /** Optional summary rows rendered below the main table with different styling */
  summaryRows?: SummaryRow[];
  /** Custom header callback — called on each page after the standard header is drawn */
  customHeader?: (doc: JsPDFType, pageNumber: number, pageWidth: number, pageHeight: number) => void;
  /** Optional company profile for dynamic branding in header/footer */
  company?: CompanyProfile;
  /** System notice statement rendered below the subtitle in the header */
  systemNotice?: string;
  /** Enterprise Financial Footer: "Prepared By", "Checked By", "Authorized By" signature blocks */
  financialFooter?: {
    preparedBy?: string;
    checkedBy?: string;
    authorizedBy?: string;
    approvedBy?: string;  // Double-signature panel
    printedBy: string; // Username of the person who generated the PDF
  };
}

export interface CSVOptions {
  title: string;
  columns: ColumnDef[];
  data: any[];
  isVatAuditor?: boolean;
  vatMaskedColumns?: string[];
  filename?: string;
}

export interface ImportResult {
  imported: number;
  failed: number;
  errors: string[];
  /** Row-level detail errors with field information */
  fieldErrors?: Array<{
    row: number;
    field: string;
    message: string;
  }>;
}

// ============================================================
// UTILITY: Format cell value for display
// ============================================================

const MASKING_SENTINEL = "N/A (Audit Mode)";

// ============================================================
// UTILITY: Safe BDT Number Formatter
// GUARANTEES Latin digits (0-9) in all environments.
// Delegates to centralized number-format module which includes
// a Bengali-to-Latin digit replacement pass.
// ============================================================

import { fmtCurrency, toLatinDigits, toEnglishDigits } from '@/lib/number-format';
import { loadCompanyProfile, getCachedCompanyProfile } from '@/lib/company-branding-cache';
// apiFetch injects Authorization (Bearer JWT) + X-CSRF-Token headers automatically
// and handles token refresh on 401. Using it here fixes the app-wide CSV Import
// 401 "Authentication required" bug — raw fetch() was missing both headers.
import { apiFetch } from '@/lib/api-client';

// Re-export toEnglishDigits for use across the application
export { toEnglishDigits };

/** Format a number as BDT currency string with guaranteed Latin digits and 2 decimal places */
export function formatBDT(value: number): string {
  return fmtCurrency(value);
}

// ============================================================
// UTILITY: Currency Sanitization Filter
// Eliminates corrupted numerical digits in running balances
// Strips non-numeric characters, validates the result, and
// formats using the safe BDT formatter for consistent output
// ============================================================

export function sanitizeCurrencyValue(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  
  // Convert to string and strip all non-numeric chars except . and -
  let raw = String(value);
  
  // Remove known corruption patterns:
  // - Currency prefix "Tk." (English notation)
  // - Bengali-Indic digits (U+09E6-U+09EF) ০১২৩৪৫৬৭৮৯ → CONVERT to Latin 0-9
  // - Comma separators that may have digit corruption
  // - Any non-ASCII digits that might have been inserted
  raw = raw.replace(/Tk\.\s*/g, ''); // Remove Tk. currency prefix
  raw = raw.replace(/[\u09E6-\u09EF]/g, d => String(d.charCodeAt(0) - 0x09E6 + 0x0030)); // Convert Bengali digits to Latin
  raw = raw.replace(/[^\d.\-]/g, ''); // Keep only digits, decimal point, and minus sign
  
  // Handle multiple decimal points (keep only the first)
  const parts = raw.split('.');
  if (parts.length > 2) {
    raw = parts[0] + '.' + parts.slice(1).join('');
  }
  
  const num = Number(raw);
  if (isNaN(num)) return 0;
  return Math.round(num * 100) / 100; // Sanitize to 2 decimal places
}

/** Format a sanitized currency value for PDF display (right-aligned, guaranteed Latin digits) */
export function formatSanitizedCurrency(value: any): string {
  const sanitized = sanitizeCurrencyValue(value);
  return `Tk. ${fmtCurrency(sanitized)}`;
}

// ============================================================
// UTILITY: Number to Words (BDT Format)
// Converts a numeric amount to Bangladeshi Taka words:
// "Taka One Thousand Two Hundred Thirty Four and Paisa Fifty Six Only"
// Uses South Asian grouping: Crore, Lakh, Thousand, Hundred
// ============================================================

const TAKA_ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];

const TAKA_TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function takaConvertHundreds(num: number): string {
  if (num === 0) return "";
  let result = "";
  if (num >= 100) {
    result += TAKA_ONES[Math.floor(num / 100)] + " Hundred";
    num %= 100;
    if (num > 0) result += " ";
  }
  if (num >= 20) {
    result += TAKA_TENS[Math.floor(num / 10)];
    num %= 10;
    if (num > 0) result += " " + TAKA_ONES[num];
  } else if (num > 0) {
    result += TAKA_ONES[num];
  }
  return result;
}

/** Convert a number to Bangladeshi Taka words (South Asian grouping: Crore, Lakh, Thousand) */
export function numberToTakaWords(amount: number): string {
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
      takaWords += takaConvertHundreds(crore) + " Crore";
      const remainder = taka % 10000000;
      if (remainder > 0) takaWords += " ";
    }

    // Handle lakh (100,000)
    const afterCrore = taka % 10000000;
    if (afterCrore >= 100000) {
      const lakh = Math.floor(afterCrore / 100000);
      takaWords += takaConvertHundreds(lakh) + " Lakh";
      const remainder = afterCrore % 100000;
      if (remainder > 0) takaWords += " ";
    }

    // Handle thousand (1,000)
    const afterLakh = afterCrore % 100000;
    if (afterLakh >= 1000) {
      const thousand = Math.floor(afterLakh / 1000);
      takaWords += takaConvertHundreds(thousand) + " Thousand";
      const remainder = afterLakh % 1000;
      if (remainder > 0) takaWords += " ";
    }

    // Handle hundreds and below
    const belowThousand = afterLakh % 1000;
    if (belowThousand > 0) {
      takaWords += takaConvertHundreds(belowThousand);
    }
  }

  let result = "";
  if (isNegative) result += "Minus ";

  if (paisa > 0) {
    result += "Taka " + takaWords + " and Paisa " + takaConvertHundreds(paisa) + " Only";
  } else {
    result += "Taka " + takaWords + " Only";
  }

  return result.trim().replace(/\s+/g, " ");
}

function formatCellValue(
  value: any,
  type?: string,
  isVatAuditor?: boolean,
  isVatMasked?: boolean
): string {
  // VAT Auditor masking takes highest priority
  if (isVatAuditor && isVatMasked) {
    return MASKING_SENTINEL;
  }
  // If the value was already pre-masked by the caller (e.g. SR role salary masking),
  // return it as-is to prevent type-specific formatting from destroying the sentinel
  if (value === MASKING_SENTINEL) return MASKING_SENTINEL;
  if (value === null || value === undefined || value === "") return "\u2014";
  if (type === "currency") {
    const num = sanitizeCurrencyValue(value);
    if (num === 0 && (value === null || value === undefined || value === "")) return "\u2014";
    return `Tk. ${fmtCurrency(num)}`;
  }
  if (type === "boolean") return value ? "Active" : "Inactive";
  if (type === "date") {
    if (!value) return "\u2014";
    try {
      return toLatinDigits(new Date(value).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }));
    } catch {
      return toLatinDigits(String(value));
    }
  }
  if (type === "number") {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    return fmtCurrency(num);
  }
  return String(value);
}

// ============================================================
// UTILITY: Escape CSV field (RFC 4180 compliant)
// Handles commas, double quotes, line breaks, and the Tk.  symbol
// Numeric values are not quoted unless they contain special chars
// ============================================================

function escapeCSVField(value: string, isNumeric?: boolean): string {
  // Guard against undefined/null values (e.g. sparse rows with missing cells)
  if (value === undefined || value === null) return "";

  // Pure numeric values don't need quoting
  if (isNumeric && /^[0-9.,-]+$/.test(value)) {
    return value;
  }

  // CSV Injection Protection: Prevent formula injection in Excel/Sheets
  // Cells starting with =, +, -, @, \t, \r, | are dangerous
  // | (pipe) added: pipe-delimited CSV exports treat | as a cell separator,
  // and some spreadsheet parsers (e.g. older Excel localized versions) may
  // interpret a leading pipe as a formula or command prefix, enabling injection.
  const trimmed = value.trimStart();
  if (trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.startsWith('@') || trimmed.startsWith('\t') || trimmed.startsWith('\r') || trimmed.startsWith('|')) {
    // Prefix with a single quote to neutralize formula; quote the whole field
    return `"'" + value.replace(/"/g, '""') + '"'`;
  }

  const needsQuoting =
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r") ||
    value.includes("Tk."); // Tk. currency prefix

  if (needsQuoting) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ============================================================
// UTILITY: Get visible columns (respecting VAT Auditor masking)
// VAT Auditor can see all columns, but values are masked
// ============================================================

function getVisibleColumns(
  columns: ColumnDef[],
  _isVatAuditor?: boolean,
  _vatMaskedColumns?: string[]
): ColumnDef[] {
  // VAT Auditor can still see all columns, but values are masked
  // This function exists for future column-hiding extensions
  return columns;
}

// ============================================================
// UTILITY: Calculate safe column widths to prevent overflow
// ============================================================

function calculateColumnWidths(
  columnCount: number,
  pageWidth: number,
  margin: number
): Record<number, { minW: number; maxW: number }> {
  const availableWidth = pageWidth - margin * 2;
  const maxPerColumn = availableWidth / columnCount;
  const result: Record<number, { minW: number; maxW: number }> = {};
  for (let i = 0; i < columnCount; i++) {
    result[i] = { minW: 12, maxW: Math.min(maxPerColumn * 2, 80) };
  }
  return result;
}

// ============================================================
// INTERNAL: Draw corporate header on a jsPDF page
// Returns the Y position after the header for table start
// ============================================================

function drawCorporateHeader(
  doc: JsPDFType,
  title: string,
  subtitle: string | undefined,
  isVatAuditor: boolean,
  pageWidth: number,
  margin: number,
  company?: CompanyProfile,
  systemNotice?: string
): number {
  const companyName = company?.name || "VoltERP \u2014 Electronics Mart IMS";
  const companyAddress = company?.address || "";
  const companyMobile = company?.mobile || company?.phone || "";
  const headerHeight = 28;

  // Navy blue header bar
  doc.setFillColor(10, 22, 40);
  doc.rect(0, 0, pageWidth, headerHeight, "F");

  // Calculate left offset for text (after logo if present)
  let textStartX = margin;

  // Company logo (if provided as base64 data URL)
  if (company?.logo) {
    const logoW = company.logoWidth || 30;
    const logoH = company.logoHeight || 20;
    const logoY = (headerHeight - logoH) / 2; // vertically centered in header
    try {
      let logoUrl = company.logo;
      if (!logoUrl.startsWith("data:")) {
        // Detect format from base64 header bytes (JPEG starts with /9j/, PNG with iVBOR)
        const isJpeg = logoUrl.startsWith("/9j/");
        logoUrl = `data:image/${isJpeg ? "jpeg" : "png"};base64,${logoUrl}`;
      }
      doc.addImage(logoUrl, margin, logoY, logoW, logoH);
    } catch {
      // If logo rendering fails, skip it silently
    }
    textStartX = margin + logoW + 4; // 4mm gap after logo
  }

  // Brand logo on the right side (if provided)
  if (company?.brandLogo) {
    const brandW = company.logoWidth || 30;
    const brandH = company.logoHeight || 20;
    const brandY = (headerHeight - brandH) / 2;
    try {
      let brandUrl = company.brandLogo;
      if (!brandUrl.startsWith("data:")) {
        const isBrandJpeg = brandUrl.startsWith("/9j/");
        brandUrl = `data:image/${isBrandJpeg ? "jpeg" : "png"};base64,${brandUrl}`;
      }
      doc.addImage(brandUrl, pageWidth - margin - brandW - 2, brandY, brandW, brandH);
    } catch {
      // If brand logo fails, skip it
    }
  }

  // ── LEFT SIDE: Company info ──

  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(companyName, textStartX, 11);

  // Company address (below name if provided)
  let leftY = 15;
  if (companyAddress) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 210, 225); // slightly dimmer white
    doc.text(companyAddress, textStartX, 15);
    leftY = 19;
  }

  // Company mobile/phone (if available, after address)
  if (companyMobile) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(220, 220, 230);
    doc.text(`Mobile: ${companyMobile}`, textStartX, leftY);
    leftY += 3;
  }

  // Company email (below address/mobile)
  if (company?.email) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 210, 225);
    doc.text(company.email, textStartX, leftY);
    leftY += 3;
  }

  // ── RIGHT SIDE: Timestamp + VAT/Trade ──

  // Generation timestamp (right-aligned)
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  const now = new Date();
  const timestamp = `Generated: ${toLatinDigits(now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }))} ${toLatinDigits(now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }))}`;
  const tsWidth = doc.getTextWidth(timestamp);
  doc.text(timestamp, pageWidth - margin - tsWidth, 11);

  // Report title (right-aligned, below timestamp)
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(255, 255, 255);
  const titleWidth = doc.getTextWidth(title);
  doc.text(title, pageWidth - margin - titleWidth, 17);

  // Subtitle / period (right-aligned, below title)
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(200, 210, 225);
    const subWidth = doc.getTextWidth(subtitle);
    doc.text(subtitle, pageWidth - margin - subWidth, 22);
  }

  // System notice statement (right-aligned, below subtitle or title)
  if (systemNotice) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(180, 190, 200);
    const noticeWidth = doc.getTextWidth(systemNotice);
    doc.text(systemNotice, pageWidth - margin - noticeWidth, subtitle ? 26 : 22);
  }

  // VAT Number and Trade License (left-aligned, below email/mobile, tiny text)
  let regY = headerHeight - 2;
  if (company?.vatNumber) {
    doc.setFontSize(6);
    doc.setTextColor(180, 190, 200);
    doc.text(`VAT: ${company.vatNumber}`, textStartX, regY);
    if (company?.tradeLicense) {
      const vatW = doc.getTextWidth(`VAT: ${company.vatNumber}  `);
      doc.text(`Trade License: ${company.tradeLicense}`, textStartX + vatW, regY);
    }
  } else if (company?.tradeLicense) {
    doc.setFontSize(6);
    doc.setTextColor(180, 190, 200);
    doc.text(`Trade License: ${company.tradeLicense}`, textStartX, regY);
  }

  // VAT Auditor badge
  if (isVatAuditor) {
    doc.setFillColor(245, 158, 11); // amber-500
    const badgeText = "  VAT AUDITOR MODE  ";
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    const badgeWidth = doc.getTextWidth(badgeText) + 4;
    doc.roundedRect(pageWidth - margin - badgeWidth, 23, badgeWidth, 7, 1, 1, "F");
    doc.text(badgeText.trim(), pageWidth - margin - badgeWidth + 2, 28);
  }

  return headerHeight + 4; // 32mm start position for table
}

// ============================================================
// INTERNAL: Draw footer on a jsPDF page
// ============================================================

function drawFooter(
  doc: JsPDFType,
  pageNumber: number,
  totalPagesPlaceholder: string,
  pageWidth: number,
  pageHeight: number,
  margin: number,
  company?: CompanyProfile,
  financialFooter?: PDFOptions["financialFooter"]
): void {
  const footerY = pageHeight - 8;

  // If financial footer is provided, draw the enterprise signature block ABOVE the navy bar
  if (financialFooter) {
    const signatureY = pageHeight - 38; // Position above the navy bar (increased from 32 to 38 for more space)
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");

    // Four signature columns: Customer's Signature, Prepared By, Checked By, Authorized By
    const signatureFields = [
      { label: "Customer's Signature", value: "" },
      { label: "Prepared By", value: financialFooter.preparedBy || "" },
      { label: "Checked By", value: financialFooter.checkedBy || "" },
      { label: "Authorized By", value: financialFooter.authorizedBy || "" },
    ];

    // Draw four signature columns evenly spaced
    const colWidth = (pageWidth - margin * 2) / 4;
    signatureFields.forEach((field, i) => {
      const x = margin + i * colWidth;
      // Label
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80, 80, 80);
      doc.text(field.label, x + (colWidth - 10) / 2 - doc.getTextWidth(field.label) / 2, signatureY);
      // Underline for signature
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);
      doc.line(x, signatureY + 1.5, x + colWidth - 10, signatureY + 1.5);
      // Value below line
      if (field.value) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
        doc.text(field.value, x + (colWidth - 10) / 2 - doc.getTextWidth(field.value) / 2, signatureY + 5);
      }
    });

    // Thank you message from company settings (centered)
    const thankYouMsg = company?.thankYouMsg || "Thank You Come Again.";
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    const tyWidth = doc.getTextWidth(thankYouMsg);
    doc.text(thankYouMsg, pageWidth / 2 - tyWidth / 2, signatureY + 9);

    // System disclaimer (centered, below thank you) — professional dark grey, NOT red
    const systemNote = company?.systemNote || "This is a system generated document; no seal or signature is required unless explicitly stated.";
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(130, 130, 130); // Dark grey instead of red
    const snWidth = doc.getTextWidth(systemNote);
    doc.text(systemNote, pageWidth / 2 - snWidth / 2, signatureY + 13);

    // Currency specification (centered, below disclaimer)
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 130);
    const currencyNote = "Amount in Bangladeshi Taka (BDT)";
    const cnWidth = doc.getTextWidth(currencyNote);
    doc.text(currencyNote, pageWidth / 2 - cnWidth / 2, signatureY + 16.5);

    // Printed By + Print Date (left-aligned)
    const now = new Date();
    const printDate = toLatinDigits(now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }));
    const printTime = toLatinDigits(now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    const printedByText = `Printed By: ${financialFooter.printedBy}  |  Print Date: ${printDate} ${printTime}`;
    doc.setFontSize(5.5);
    doc.setTextColor(120, 120, 120);
    doc.setFont("helvetica", "normal");
    doc.text(printedByText, margin, signatureY + 20);

  }

  // Navy blue footer bar
  doc.setFillColor(10, 22, 40);
  doc.rect(0, pageHeight - 12, pageWidth, 12, "F");

  doc.setTextColor(148, 163, 184); // slate-400
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");

  // Left: copyright — use company name when provided, fallback to default
  const footerName = company?.name || "VoltERP \u2014 Electronics Mart IMS";
  const currentYear = new Date().getFullYear();
  doc.text(`\u00A9 ${currentYear} ${footerName}`, margin, footerY);

  // Right: page number (with placeholder for total)
  const pageText = `Page ${pageNumber} of ${totalPagesPlaceholder}`;
  doc.text(pageText, pageWidth - margin - doc.getTextWidth(pageText), footerY);
}

// ============================================================
// INTERNAL: Fix Page X of Y with a two-pass approach
// First pass: autoTable runs and draws placeholder {total}
// Second pass: replace {total} with actual page count
// ============================================================

function fixPageXOfY(
  doc: JsPDFType,
  pageHeight: number,
  pageWidth: number,
  margin: number,
  financialFooter?: PDFOptions["financialFooter"],
  company?: CompanyProfile
): void {
  const totalPageCount = doc.getNumberOfPages();
  for (let i = 1; i <= totalPageCount; i++) {
    doc.setPage(i);

    // ── Fix page number in the financial footer signature section (above navy bar) ──
    // When a financial footer is present, "Page X of {total}" is also drawn at
    // signatureY + 20 ≈ pageHeight - 18. We must overwrite that area too.
    if (financialFooter) {
      const signatureY = pageHeight - 38;
      const ffPageInfoY = signatureY + 20; // pageHeight - 18

      // Overwrite with white/background to erase placeholder
      doc.setFillColor(255, 255, 255);
      doc.rect(pageWidth - 55, ffPageInfoY - 3, 55, 6, "F");

      // Rewrite with correct total
      doc.setFontSize(5.5);
      doc.setTextColor(120, 120, 120);
      doc.setFont("helvetica", "normal");
      const ffCorrected = `Page ${i} of ${totalPageCount}`;
      doc.text(
        ffCorrected,
        pageWidth - margin - doc.getTextWidth(ffCorrected),
        ffPageInfoY
      );
    }

    // ── Fix page number in the navy blue footer bar ──
    doc.setFillColor(10, 22, 40);
    doc.rect(pageWidth - 55, pageHeight - 12, 55, 12, "F");

    // Write the corrected page text
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    const correctedText = `Page ${i} of ${totalPageCount}`;
    doc.text(
      correctedText,
      pageWidth - margin - doc.getTextWidth(correctedText),
      pageHeight - 8
    );
  }
}

// ============================================================
// EXPORT PDF ENGINE
// Corporate Layout: Landscape A4, High-Fidelity Header,
// Alternating Row Colors, Page X of Y Footer (Two-Pass),
// Summary Rows, Custom Header Callback, Column Bounds
// ============================================================

export async function exportToPDF(options: PDFOptions): Promise<void> {
  const {
    title,
    subtitle,
    orientation = "landscape",
    columns,
    data,
    isVatAuditor = false,
    vatMaskedColumns = [],
    filename,
    summaryRows,
    customHeader,
    company: providedCompany,
  } = options;

  // ── Auto-load company profile from branding cache when not provided ──
  let company = providedCompany;
  if (!company) {
    const cached = getCachedCompanyProfile();
    if (cached) {
      company = cached;
    } else {
      try {
        const loaded = await loadCompanyProfile();
        if (loaded) company = loaded;
      } catch {
        // Silently fail — callers use fallback defaults in drawCorporateHeader
      }
    }
  }

  // Lazy-load jsPDF and autoTable to prevent React error #321
  const { jsPDF } = await loadJsPDF();
  const { autoTable } = await loadAutoTable();

  try {
    const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const vatMaskSet = new Set(vatMaskedColumns);

    // ── Corporate Header ──
    const tableStartY = drawCorporateHeader(doc, title, subtitle, isVatAuditor, pageWidth, margin, company, options.systemNotice);

    // ── Adjust bottom margin for financial footer (more space needed for signature blocks) ──
    const bottomMargin = options.financialFooter ? 36 : 18;

    // ── Prepare Table Data ──
    const visibleColumns = getVisibleColumns(columns, isVatAuditor, vatMaskedColumns);
    const headers = visibleColumns.map((c) => c.label);
    const body = data.map((item: any) =>
      visibleColumns.map((c) =>
        formatCellValue(item[c.key], c.type, isVatAuditor, vatMaskSet.has(c.key))
      )
    );

    // ── autoTable Configuration ──
    const headStyles: any = {
      fillColor: [37, 99, 235], // primary blue
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "left",
      cellPadding: 3,
    };

    const alternateRowStyles: any = {
      fillColor: [240, 244, 252], // light blue-gray
    };

    const styles: any = {
      fontSize: 7,
      cellPadding: 2.5,
      textColor: [30, 41, 59], // slate-800
      lineWidth: 0.1,
      lineColor: [203, 213, 225], // slate-300
    };

    // Currency/number columns right-aligned + column width bounds
    const columnStyles: Record<number, any> = {};
    const colWidths = calculateColumnWidths(visibleColumns.length, pageWidth, margin);
    visibleColumns.forEach((c, i) => {
      const colConfig: any = {};
      if (c.type === "currency" || c.type === "number") {
        colConfig.halign = "right";
      }
      // Apply column width bounds to prevent overflow
      colConfig.minCellWidth = colWidths[i].minW;
      colConfig.maxCellWidth = colWidths[i].maxW;
      columnStyles[i] = colConfig;
    });

    // ── Fix right-aligned currency column widths ──
    // Calculate the maximum width needed for each currency column based on
    // the longest formatted value. Setting a fixed cellWidth ensures all
    // currency values in a column occupy the same width, making right-alignment
    // visually correct (the Tk.  symbol is consistently placed on the left of
    // each value, and numbers line up properly).
    {
      const tempDoc = new jsPDF({ orientation, unit: "mm", format: "a4" });
      tempDoc.setFontSize(7);
      visibleColumns.forEach((c, i) => {
        if (c.type === "currency") {
          // Find the longest formatted value in this column
          let maxTextWidth = 0;
          for (const row of body) {
            const cellText = row[i] || "";
            const tw = tempDoc.getTextWidth(String(cellText));
            if (tw > maxTextWidth) maxTextWidth = tw;
          }
          // Add padding (cellPadding * 2 = 5mm) and a small buffer
          const calculatedWidth = maxTextWidth + 6;
          // Only set if the calculated width fits within the column bounds
          const minW = columnStyles[i]?.minCellWidth || 12;
          const maxW = columnStyles[i]?.maxCellWidth || 80;
          columnStyles[i].cellWidth = Math.max(minW, Math.min(calculatedWidth, maxW));
        }
      });
    }

    // ── Draw Main Table ──
    // We use {total} as placeholder; second pass will fix it
    const TOTAL_PLACEHOLDER = "{total}";

    autoTable(doc, {
      head: [headers],
      body,
      startY: tableStartY,
      margin: { left: margin, right: margin, bottom: bottomMargin },
      styles,
      headStyles,
      alternateRowStyles,
      columnStyles: Object.keys(columnStyles).length > 0 ? columnStyles : undefined,
      didDrawPage: (data: any) => {
        // Draw footer on every page
        drawFooter(doc, data.pageNumber, TOTAL_PLACEHOLDER, pageWidth, pageHeight, margin, company, options.financialFooter);

        // Call custom header callback if provided
        if (customHeader) {
          customHeader(doc, data.pageNumber, pageWidth, pageHeight);
        }
      },
    });

    // ── Summary Rows ──
    if (summaryRows && summaryRows.length > 0) {
      const lastTable = (doc as any).lastAutoTable;
      const summaryStartY = lastTable ? lastTable.finalY + 4 : tableStartY + 30;

      // Check if summary fits on current page, otherwise add new page
      let currentSummaryY: number;
      if (summaryStartY > pageHeight - (options.financialFooter ? 44 : 30)) {
        doc.addPage();
        drawCorporateHeader(doc, title, subtitle, isVatAuditor, pageWidth, margin, company, options.systemNotice);
        drawFooter(doc, doc.getNumberOfPages(), TOTAL_PLACEHOLDER, pageWidth, pageHeight, margin, company, options.financialFooter);
        currentSummaryY = 36; // Below corporate header on new page
      } else {
        currentSummaryY = summaryStartY;
      }
      summaryRows.forEach((summaryRow) => {
        const rowStyle = summaryRow.style || {
          fillColor: [10, 22, 40],
          textColor: [255, 255, 255],
          fontStyle: "bold" as const,
          fontSize: 8,
        };

        // Check if summary row fits on current page
        if (currentSummaryY > pageHeight - (options.financialFooter ? 44 : 25)) {
          doc.addPage();
          drawCorporateHeader(doc, title, subtitle, isVatAuditor, pageWidth, margin, company, options.systemNotice);
          drawFooter(doc, doc.getNumberOfPages(), TOTAL_PLACEHOLDER, pageWidth, pageHeight, margin, company, options.financialFooter);
          currentSummaryY = 36; // Below corporate header
        }

        autoTable(doc, {
          body: [summaryRow.cells],
          startY: currentSummaryY,
          margin: { left: margin, right: margin, bottom: 18 },
          styles: {
            fontSize: rowStyle.fontSize || 8,
            cellPadding: 3,
            textColor: (rowStyle.textColor as [number, number, number]) || [255, 255, 255],
            fontStyle: rowStyle.fontStyle || "bold",
            lineWidth: 0.1,
            lineColor: [203, 213, 225],
          },
          bodyStyles: {
            fillColor: rowStyle.fillColor || [10, 22, 40],
          },
          columnStyles: Object.keys(columnStyles).length > 0 ? columnStyles : undefined,
          didDrawPage: (data: any) => {
            drawFooter(doc, data.pageNumber, TOTAL_PLACEHOLDER, pageWidth, pageHeight, margin, company, options.financialFooter);
          },
        });

        // Advance Y position for next summary row
        const lastTable = (doc as any).lastAutoTable;
        if (lastTable) {
          currentSummaryY = lastTable.finalY + 2;
        }
      });
    }

    // ── Second Pass: Fix "Page X of Y" with correct total ──
    fixPageXOfY(doc, pageHeight, pageWidth, margin, options.financialFooter, company);

    // ── Save ──
    // Strip any .pdf extension if already present in filename to prevent double .pdf.pdf
    const rawFilename =
      filename || title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const safeFilename = rawFilename.replace(/\.pdf$/i, "");
    doc.save(`${safeFilename}.pdf`);
  } catch (error: any) {
    console.error("Export PDF Error:", error);
    throw new Error(`PDF export failed: ${error.message || "Unknown error"}`);
  }
}

// ============================================================
// EXPORT PDF ENGINE — Simple header/body overload
// For report pages that provide pre-formatted headers and rows
// ============================================================

export async function exportToPDFSimple(
  title: string,
  headers: string[],
  rows: string[][],
  orientation: "landscape" | "portrait" = "landscape",
  subtitle?: string,
  company?: CompanyProfile,
  financialFooter?: PDFOptions["financialFooter"]
): Promise<void> {
  // ── Auto-load company profile from branding cache when not provided ──
  let resolvedCompany = company;
  if (!resolvedCompany) {
    const cached = getCachedCompanyProfile();
    if (cached) {
      resolvedCompany = cached;
    } else {
      try {
        const loaded = await loadCompanyProfile();
        if (loaded) resolvedCompany = loaded;
      } catch {
        // Silently fail — callers use fallback defaults in drawCorporateHeader
      }
    }
  }

  // Lazy-load jsPDF and autoTable to prevent React error #321
  const { jsPDF } = await loadJsPDF();
  const { autoTable } = await loadAutoTable();

  try {
    const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    // Corporate header
    const tableStartY = drawCorporateHeader(doc, title, subtitle, false, pageWidth, margin, resolvedCompany);

    const TOTAL_PLACEHOLDER = "{total}";
    const colWidths = calculateColumnWidths(headers.length, pageWidth, margin);
    const columnStyles: Record<number, any> = {};
    headers.forEach((_, i) => {
      columnStyles[i] = {
        minCellWidth: colWidths[i].minW,
        maxCellWidth: colWidths[i].maxW,
      };
    });

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: tableStartY,
      margin: { left: margin, right: margin, bottom: 18 },
      styles: {
        fontSize: 7,
        cellPadding: 2.5,
        textColor: [30, 41, 59],
        lineWidth: 0.1,
        lineColor: [203, 213, 225],
      },
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
        halign: "left",
        cellPadding: 3,
      },
      alternateRowStyles: { fillColor: [240, 244, 252] },
      columnStyles: Object.keys(columnStyles).length > 0 ? columnStyles : undefined,
      didDrawPage: (data: any) => {
        drawFooter(doc, data.pageNumber, TOTAL_PLACEHOLDER, pageWidth, pageHeight, margin, resolvedCompany, financialFooter);
      },
    });

    // Second pass: fix Page X of Y
    fixPageXOfY(doc, pageHeight, pageWidth, margin, financialFooter, resolvedCompany);

    const rawFilename = title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const safeFilename = rawFilename.replace(/\.pdf$/i, "");
    doc.save(`${safeFilename}.pdf`);
  } catch (error: any) {
    console.error("Export PDF Simple Error:", error);
    throw new Error(`PDF export failed: ${error.message || "Unknown error"}`);
  }
}

// ============================================================
// AUDIT REPORT PDF ENGINE
// Specialized PDF export for audit reports with classification
// badge, integrity score, summary section, financial footer,
// and system disclaimer
// ============================================================

export interface AuditReportOptions {
  title: string;
  subtitle?: string;
  columns: ColumnDef[];
  data: any[];
  summaryRows?: SummaryRow[];
  /** Integrity score 0-100; displayed as a visual gauge in the report */
  integrityScore?: number;
  isVatAuditor?: boolean;
  vatMaskedColumns?: string[];
  company?: CompanyProfile;
  financialFooter?: PDFOptions["financialFooter"];
  /** Document classification level — rendered as a badge in the header */
  classification?: "CONFIDENTIAL" | "INTERNAL" | "PUBLIC";
}

/** Draw a classification badge on the header area */
function drawClassificationBadge(
  doc: JsPDFType,
  classification: "CONFIDENTIAL" | "INTERNAL" | "PUBLIC",
  pageWidth: number,
  margin: number
): void {
  const colors: Record<string, { bg: number[]; fg: number[] }> = {
    CONFIDENTIAL: { bg: [220, 38, 38], fg: [255, 255, 255] },   // red-600 / white
    INTERNAL: { bg: [245, 158, 11], fg: [255, 255, 255] },      // amber-500 / white
    PUBLIC: { bg: [34, 197, 94], fg: [255, 255, 255] },         // green-500 / white
  };
  const { bg, fg } = colors[classification] || colors.INTERNAL;

  doc.setFillColor(bg[0], bg[1], bg[2]);
  const badgeText = `  ${classification}  `;
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(fg[0], fg[1], fg[2]);
  const badgeWidth = doc.getTextWidth(badgeText) + 4;
  // Position the badge in the top-right area of the header, offset below the VAT auditor badge line
  const badgeX = pageWidth - margin - badgeWidth;
  const badgeY = 2;
  doc.roundedRect(badgeX, badgeY, badgeWidth, 7, 1, 1, "F");
  doc.text(badgeText.trim(), badgeX + 2, badgeY + 5);
}

/** Draw an integrity score gauge on the PDF */
function drawIntegrityScore(
  doc: JsPDFType,
  score: number,
  startY: number,
  margin: number,
  pageWidth: number
): number {
  const labelX = margin;
  const barX = margin + 35;
  const barWidth = pageWidth - margin * 2 - 70;
  const barHeight = 5;

  // Label
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Integrity Score:", labelX, startY + 3.5);

  // Background bar (gray)
  doc.setFillColor(226, 232, 240); // slate-200
  doc.roundedRect(barX, startY, barWidth, barHeight, 1, 1, "F");

  // Score bar (color based on score)
  const fillWidth = (barWidth * Math.min(Math.max(score, 0), 100)) / 100;
  let barColor: number[];
  if (score >= 80) {
    barColor = [34, 197, 94]; // green-500
  } else if (score >= 50) {
    barColor = [245, 158, 11]; // amber-500
  } else {
    barColor = [220, 38, 38]; // red-600
  }
  if (fillWidth > 0) {
    doc.setFillColor(barColor[0], barColor[1], barColor[2]);
    doc.roundedRect(barX, startY, fillWidth, barHeight, 1, 1, "F");
  }

  // Score text
  const scoreText = `${score}/100`;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  const scoreTextWidth = doc.getTextWidth(scoreText);
  doc.text(scoreText, barX + barWidth + 4, startY + 3.5);

  return startY + barHeight + 4;
}

/** Draw the system disclaimer at the bottom of the audit report */
function drawSystemDisclaimer(
  doc: JsPDFType,
  startY: number,
  margin: number,
  pageWidth: number,
  pageHeight: number,
  financialFooter?: PDFOptions["financialFooter"]
): void {
  const disclaimerText = "This report is generated from live transactional data and is subject to verification. Any discrepancies should be reported to the finance department immediately.";

  // Check if disclaimer fits; if not, add new page
  const disclaimerHeight = 12;
  const bottomSpace = financialFooter ? 44 : 25;
  let y = startY;
  if (y > pageHeight - bottomSpace - disclaimerHeight) {
    doc.addPage();
    y = 36;
  }

  // Disclaimer box with border
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setLineWidth(0.3);
  const boxWidth = pageWidth - margin * 2;
  doc.roundedRect(margin, y, boxWidth, disclaimerHeight, 1, 1, "FD");

  // Warning icon + text
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 116, 139); // slate-500
  const disclaimerLabel = "DISCLAIMER: ";
  const labelWidth = doc.getTextWidth(`\u26A0 ${disclaimerLabel}`);
  doc.text(`\u26A0 ${disclaimerLabel}`, margin + 3, y + 4.5);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6);
  doc.setTextColor(120, 120, 120);
  // Wrap text if needed
  const maxTextWidth = boxWidth - 6 - labelWidth;
  const lines = doc.splitTextToSize(disclaimerText, maxTextWidth);
  doc.text(lines, margin + 3 + labelWidth, y + 4.5);
}

export async function exportAuditReportPDF(options: AuditReportOptions): Promise<void> {
  const {
    title,
    subtitle,
    columns,
    data,
    summaryRows,
    integrityScore,
    isVatAuditor = false,
    vatMaskedColumns = [],
    company: providedCompany,
    financialFooter,
    classification = "INTERNAL",
  } = options;

  // ── Auto-load company profile from branding cache when not provided ──
  let company = providedCompany;
  if (!company) {
    const cached = getCachedCompanyProfile();
    if (cached) {
      company = cached;
    } else {
      try {
        const loaded = await loadCompanyProfile();
        if (loaded) company = loaded;
      } catch {
        // Silently fail — callers use fallback defaults in drawCorporateHeader
      }
    }
  }

  // Lazy-load jsPDF and autoTable to prevent React error #321
  const { jsPDF } = await loadJsPDF();
  const { autoTable } = await loadAutoTable();

  try {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const vatMaskSet = new Set(vatMaskedColumns);

    // ── Corporate Header ──
    const auditSubtitle = subtitle ? `AUDIT REPORT \u2014 ${subtitle}` : "AUDIT REPORT";
    const tableStartY = drawCorporateHeader(
      doc, title, auditSubtitle, isVatAuditor, pageWidth, margin, company,
      "Audit Report \u2014 Generated from verified transactional data"
    );

    // ── Classification Badge ──
    drawClassificationBadge(doc, classification, pageWidth, margin);

    // ── Adjust bottom margin for financial footer ──
    const bottomMargin = financialFooter ? 36 : 18;

    // ── Prepare Table Data ──
    const visibleColumns = getVisibleColumns(columns, isVatAuditor, vatMaskedColumns);
    const headers = visibleColumns.map((c) => c.label);
    const body = data.map((item: any) =>
      visibleColumns.map((c) =>
        formatCellValue(item[c.key], c.type, isVatAuditor, vatMaskSet.has(c.key))
      )
    );

    // ── autoTable Configuration ──
    const headStyles: any = {
      fillColor: [10, 22, 40], // Navy blue for audit reports (distinct from regular reports)
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "left",
      cellPadding: 3,
    };

    const alternateRowStyles: any = {
      fillColor: [248, 250, 252], // slate-50
    };

    const styles: any = {
      fontSize: 7,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      lineWidth: 0.1,
      lineColor: [203, 213, 225],
    };

    // Currency/number columns right-aligned + column width bounds + fixed width for currency
    const columnStyles: Record<number, any> = {};
    const colWidths = calculateColumnWidths(visibleColumns.length, pageWidth, margin);
    visibleColumns.forEach((c, i) => {
      const colConfig: any = {};
      if (c.type === "currency" || c.type === "number") {
        colConfig.halign = "right";
      }
      colConfig.minCellWidth = colWidths[i].minW;
      colConfig.maxCellWidth = colWidths[i].maxW;
      columnStyles[i] = colConfig;
    });

    // ── Fix right-aligned currency column widths (same logic as exportToPDF) ──
    {
      const tempDoc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      tempDoc.setFontSize(7);
      visibleColumns.forEach((c, i) => {
        if (c.type === "currency") {
          let maxTextWidth = 0;
          for (const row of body) {
            const cellText = row[i] || "";
            const tw = tempDoc.getTextWidth(String(cellText));
            if (tw > maxTextWidth) maxTextWidth = tw;
          }
          const calculatedWidth = maxTextWidth + 6;
          const minW = columnStyles[i]?.minCellWidth || 12;
          const maxW = columnStyles[i]?.maxCellWidth || 80;
          columnStyles[i].cellWidth = Math.max(minW, Math.min(calculatedWidth, maxW));
        }
      });
    }

    // ── Draw Main Table ──
    const TOTAL_PLACEHOLDER = "{total}";

    autoTable(doc, {
      head: [headers],
      body,
      startY: tableStartY,
      margin: { left: margin, right: margin, bottom: bottomMargin },
      styles,
      headStyles,
      alternateRowStyles,
      columnStyles: Object.keys(columnStyles).length > 0 ? columnStyles : undefined,
      didDrawPage: (data: any) => {
        drawFooter(doc, data.pageNumber, TOTAL_PLACEHOLDER, pageWidth, pageHeight, margin, company, financialFooter);
      },
    });

    // ── Post-table content position ──
    const lastTable = (doc as any).lastAutoTable;
    let currentY = lastTable ? lastTable.finalY + 4 : tableStartY + 30;

    // ── Summary Rows ──
    if (summaryRows && summaryRows.length > 0) {
      // Check if summary fits on current page
      if (currentY > pageHeight - (financialFooter ? 54 : 40)) {
        doc.addPage();
        drawCorporateHeader(doc, title, auditSubtitle, isVatAuditor, pageWidth, margin, company);
        drawClassificationBadge(doc, classification, pageWidth, margin);
        drawFooter(doc, doc.getNumberOfPages(), TOTAL_PLACEHOLDER, pageWidth, pageHeight, margin, company, financialFooter);
        currentY = 36;
      }

      summaryRows.forEach((summaryRow) => {
        const rowStyle = summaryRow.style || {
          fillColor: [10, 22, 40],
          textColor: [255, 255, 255],
          fontStyle: "bold" as const,
          fontSize: 8,
        };

        if (currentY > pageHeight - (financialFooter ? 54 : 35)) {
          doc.addPage();
          drawCorporateHeader(doc, title, auditSubtitle, isVatAuditor, pageWidth, margin, company);
          drawClassificationBadge(doc, classification, pageWidth, margin);
          drawFooter(doc, doc.getNumberOfPages(), TOTAL_PLACEHOLDER, pageWidth, pageHeight, margin, company, financialFooter);
          currentY = 36;
        }

        autoTable(doc, {
          body: [summaryRow.cells],
          startY: currentY,
          margin: { left: margin, right: margin, bottom: 18 },
          styles: {
            fontSize: rowStyle.fontSize || 8,
            cellPadding: 3,
            textColor: (rowStyle.textColor as [number, number, number]) || [255, 255, 255],
            fontStyle: rowStyle.fontStyle || "bold",
            lineWidth: 0.1,
            lineColor: [203, 213, 225],
          },
          bodyStyles: {
            fillColor: rowStyle.fillColor || [10, 22, 40],
          },
          columnStyles: Object.keys(columnStyles).length > 0 ? columnStyles : undefined,
          didDrawPage: (data: any) => {
            drawFooter(doc, data.pageNumber, TOTAL_PLACEHOLDER, pageWidth, pageHeight, margin, company, financialFooter);
          },
        });

        const nextTable = (doc as any).lastAutoTable;
        if (nextTable) currentY = nextTable.finalY + 2;
      });
    }

    // ── Integrity Score Display ──
    if (integrityScore !== undefined) {
      if (currentY > pageHeight - (financialFooter ? 54 : 40)) {
        doc.addPage();
        drawCorporateHeader(doc, title, auditSubtitle, isVatAuditor, pageWidth, margin, company);
        drawClassificationBadge(doc, classification, pageWidth, margin);
        drawFooter(doc, doc.getNumberOfPages(), TOTAL_PLACEHOLDER, pageWidth, pageHeight, margin, company, financialFooter);
        currentY = 36;
      }
      currentY = drawIntegrityScore(doc, integrityScore, currentY + 2, margin, pageWidth);
    }

    // ── System Disclaimer ──
    drawSystemDisclaimer(doc, currentY + 2, margin, pageWidth, pageHeight, financialFooter);

    // ── Second Pass: Fix "Page X of Y" ──
    fixPageXOfY(doc, pageHeight, pageWidth, margin, financialFooter, company);

    // ── Save ──
    const rawFilename = `audit-${title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`;
    const safeFilename = rawFilename.replace(/\.pdf$/i, "");
    doc.save(`${safeFilename}.pdf`);
  } catch (error: any) {
    console.error("Export Audit Report PDF Error:", error);
    throw new Error(`Audit report PDF export failed: ${error.message || "Unknown error"}`);
  }
}

// ============================================================
// EXPORT CSV ENGINE
// UTF-8 BOM always injected, RFC 4180 compliant, VAT masking,
// numeric values unquoted, proper escaping for Tk.  symbol
// ============================================================

export async function exportToCSV(options: CSVOptions): Promise<void> {
  const {
    title,
    columns,
    data,
    isVatAuditor = false,
    vatMaskedColumns = [],
    filename,
  } = options;

  // Papa is used for CSV generation
  const PapaModule = await loadPapa();
  const Papa = PapaModule.default || PapaModule;

  try {
    const vatMaskSet = new Set(vatMaskedColumns);
    const visibleColumns = getVisibleColumns(columns, isVatAuditor, vatMaskedColumns);

    // Build header row — labels are always text, so use text escaping
    const headerRow = visibleColumns
      .map((c) => escapeCSVField(c.label, false))
      .join(",");

    // Build data rows — dates formatted as dd/MM/yyyy for Excel compatibility
    const dataRows = data.map((item: any) =>
      visibleColumns
        .map((c) => {
          // Use dd/MM/yyyy format for date columns in CSV export
          const rawValue = c.type === "date"
            ? formatDateForCSV(item[c.key])
            : formatCellValue(
                item[c.key],
                c.type,
                isVatAuditor,
                vatMaskSet.has(c.key)
              );
          const isNumeric = c.type === "number" || c.type === "currency";
          return escapeCSVField(rawValue, isNumeric);
        })
        .join(",")
    );

    // UTF-8 BOM is ALWAYS injected for Excel compatibility (preserves Tk.  symbol)
    const bom = "\uFEFF";
    const csv = bom + headerRow + "\n" + dataRows.join("\n") + "\n";

    // Create and download blob
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Strip any .csv extension if already present in filename to prevent double .csv.csv
    const rawCsvFilename =
      filename || `${title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`;
    const safeCsvFilename = rawCsvFilename.replace(/\.csv$/i, "");
    a.download = `${safeCsvFilename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error: any) {
    console.error("Export CSV Error:", error);
    throw new Error(`CSV export failed: ${error.message || "Unknown error"}`);
  }
}

// ============================================================
// EXPORT CSV — Simple header/body overload
// ============================================================

export async function exportToCSVSimple(
  title: string,
  headers: string[],
  rows: string[][]
): Promise<void> {
  try {
    const headerRow = headers.map((h) => escapeCSVField(h, false)).join(",");
    const dataRows = rows.map((row) =>
      row.map((cell) => escapeCSVField(cell, false)).join(",")
    );

    // UTF-8 BOM always injected
    const bom = "\uFEFF";
    const csv = bom + headerRow + "\n" + dataRows.join("\n") + "\n";

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const rawSimpleFilename = title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const safeSimpleFilename = rawSimpleFilename.replace(/\.csv$/i, "");
    a.download = `${safeSimpleFilename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error: any) {
    console.error("Export CSV Simple Error:", error);
    throw new Error(`CSV export failed: ${error.message || "Unknown error"}`);
  }
}

// ============================================================
// EXPORT CSV ENGINE — Memory-Efficient Streaming
// Handles large datasets without memory bloat by fetching data
// in batches and accumulating CSV chunks in an array before
// creating a single Blob. Avoids string concatenation O(n²)
// memory issues.
// ============================================================

export interface CSVStreamOptions {
  title: string;
  columns: ColumnDef[];
  dataFetcher: (offset: number, limit: number) => Promise<{ data: any[]; hasMore: boolean }>;
  isVatAuditor?: boolean;
  vatMaskedColumns?: string[];
  filename?: string;
  /** Number of rows per fetch batch (default: 500) */
  batchSize?: number;
  /** Maximum total rows to export (safety limit, default: 100000) */
  maxRows?: number;
}

export async function exportToCSVStreaming(options: CSVStreamOptions): Promise<{ totalRows: number; filename: string }> {
  const {
    title,
    columns,
    dataFetcher,
    isVatAuditor = false,
    vatMaskedColumns = [],
    filename,
    batchSize = 500,
    maxRows = 100000,
  } = options;

  try {
    const vatMaskSet = new Set(vatMaskedColumns);
    const visibleColumns = getVisibleColumns(columns, isVatAuditor, vatMaskedColumns);

    // Accumulate CSV chunks in an array to avoid O(n²) string concatenation
    const chunks: string[] = [];

    // UTF-8 BOM is ALWAYS injected for Excel compatibility
    chunks.push("\uFEFF");

    // Header row
    const headerRow = visibleColumns
      .map((c) => escapeCSVField(c.label, false))
      .join(",");
    chunks.push(headerRow);
    chunks.push("\n");

    // Fetch data in batches
    let offset = 0;
    let totalRows = 0;
    let hasMore = true;

    while (hasMore && totalRows < maxRows) {
      const effectiveBatchSize = Math.min(batchSize, maxRows - totalRows);
      const result = await dataFetcher(offset, effectiveBatchSize);

      if (!result.data || result.data.length === 0) {
        hasMore = false;
        break;
      }

      // Convert each row in the batch to CSV and push as a chunk
      for (const item of result.data) {
        if (totalRows >= maxRows) break;

        const row = visibleColumns
          .map((c) => {
            // Use dd/MM/yyyy format for date columns in CSV export
            const rawValue = c.type === "date"
              ? formatDateForCSV(item[c.key])
              : formatCellValue(
                  item[c.key],
                  c.type,
                  isVatAuditor,
                  vatMaskSet.has(c.key)
                );
            const isNumeric = c.type === "number" || c.type === "currency";
            return escapeCSVField(rawValue, isNumeric);
          })
          .join(",");
        chunks.push(row);
        chunks.push("\n");
        totalRows++;
      }

      hasMore = result.hasMore;
      offset += result.data.length;
    }

    // Create a single Blob from all chunks — this is memory-efficient
    // because the Blob constructor accepts an array of strings without
    // concatenating them into a single large string first
    const blob = new Blob(chunks, { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    const rawCsvFilename =
      filename || `${title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`;
    const safeCsvFilename = rawCsvFilename.replace(/\.csv$/i, "");
    const finalFilename = `${safeCsvFilename}.csv`;
    a.download = finalFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { totalRows, filename: finalFilename };
  } catch (error: any) {
    console.error("Export CSV Streaming Error:", error);
    throw new Error(`CSV streaming export failed: ${error.message || "Unknown error"}`);
  }
}

// ============================================================
// IMPORT CSV ENGINE
// PapaParse-powered: Proper field parsing, header validation,
// batch bulk insert (groups of 10), row-level error reporting,
// UTF-8 BOM stripping from first header
// ============================================================

export interface ImportCSVOpts {
  apiPath: string;
  formFields: FieldDef[];
  onProgress?: (imported: number, total: number) => void;
  /** Number of rows per batch insert (default: 10) */
  batchSize?: number;
}

/** Strip UTF-8 BOM if present at start of string */
function stripBOM(str: string): string {
  if (str.charCodeAt(0) === 0xfeff) {
    return str.slice(1);
  }
  return str;
}

// ============================================================
// CSV IMPORT: Security & Validation Constants
// ============================================================

/** Maximum string length for any imported text field */
const MAX_CSV_STRING_LENGTH = 500;

/** Bangladesh mobile phone regex: accepts +880, 880, or 0 prefix + 1[3-9] + 8 digits */
const BD_PHONE_REGEX = /^(\+880|880|0)?1[3-9]\d{8}$/;

/** Field key patterns that indicate a phone number field */
const PHONE_FIELD_PATTERNS = /phone|mobile|cell|contact|whatsapp|telegram/i;

/** CSV Text Sanitizer — strips security exploit patterns from input values
 *  1. Strips HTML tags (XSS prevention)
 *  2. Strips SQL injection patterns
 *  3. Strips JavaScript protocol handlers
 *  4. Strips event handler attributes
 *  5. Enforces maximum string length (truncates with warning)
 */
function sanitizeCSVText(value: string): string {
  if (!value) return value;
  let sanitized = value;
  // Strip HTML tags
  sanitized = sanitized.replace(/<\s*\/?\s*(script|iframe|object|embed|form|input|textarea|button|link|style|meta|img|svg|math|base|body|html|head)[^>]*>/gi, '');
  // Strip SQL injection patterns
  sanitized = sanitized.replace(/(\b(OR|AND)\s+\d+\s*=\s*\d+|--|;\s*DROP\b|;\s*DELETE\b|;\s*UPDATE\b|;\s*INSERT\b|UNION\s+SELECT|;\s*ALTER\b)/gi, '');
  // Strip JavaScript protocol handlers
  sanitized = sanitized.replace(/javascript\s*:/gi, '');
  // Strip event handler attributes
  sanitized = sanitized.replace(/\b(on\w+)\s*=\s*["'][^"']*["']/gi, '');
  // Enforce maximum string length
  sanitized = sanitized.trim();
  if (sanitized.length > MAX_CSV_STRING_LENGTH) {
    sanitized = sanitized.slice(0, MAX_CSV_STRING_LENGTH);
  }
  return sanitized;
}

/** Validate Bangladesh phone number format.
 *  Accepts: +8801XXXXXXXXX, 8801XXXXXXXXX, 01XXXXXXXXX
 *  Returns: formatted +880XXXXXXXXXX or null if invalid
 */
function validateBDPhone(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.trim().replace(/[\s\-()]/g, '');
  if (!BD_PHONE_REGEX.test(cleaned)) return null;
  // Extract the 11-digit local format and prepend +880
  const match = cleaned.match(/1[3-9]\d{8}$/);
  if (!match) return null;
  return `+880${match[0]}`;
}

/** Format date value to dd/MM/yyyy for CSV export (Excel-friendly) */
function formatDateForCSV(value: any): string {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return String(value);
  }
}

export async function importFromCSV(opts: ImportCSVOpts): Promise<ImportResult> {
  const { apiPath, formFields, onProgress, batchSize = 10 } = opts;

  // Lazy-load Papa to prevent React error #321
  const PapaModule = await loadPapa();
  const Papa = (PapaModule as any).default || PapaModule;

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.style.display = "none";
    document.body.appendChild(input);

    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      document.body.removeChild(input);
      if (!file) {
        resolve({ imported: 0, failed: 0, errors: ["No file selected"] });
        return;
      }

      try {
        let text = await file.text();

        // Strip UTF-8 BOM from the raw file content
        // Some CSV editors (Excel) prepend BOM which would corrupt the first header
        text = stripBOM(text);

        // Parse with PapaParse (handles quoted fields, escaped commas, etc.)
        const result = Papa.parse(text, {
          header: true,
          skipEmptyLines: "greedy",
          transformHeader: (h: string) =>
            h.trim().replace(/^["']|["']$/g, ""),
          encoding: "UTF-8",
        });

        if (result.errors.length > 0 && result.data.length === 0) {
          resolve({
            imported: 0,
            failed: 0,
            errors: result.errors.map(
              (e) => `Parse error at row ${e.row ?? "?"}: ${e.message}`
            ),
          });
          return;
        }

        if (result.data.length === 0) {
          resolve({ imported: 0, failed: 0, errors: ["CSV file contains no data rows"] });
          return;
        }

        const rows = result.data as Record<string, string>[];
        let imported = 0;
        let failed = 0;
        const errors: string[] = [];
        const fieldErrors: ImportResult["fieldErrors"] = [];

        // Build field lookup from label → field definition
        const fieldByLabel = new Map<string, FieldDef>();
        formFields.forEach((f) => {
          fieldByLabel.set(f.label.toLowerCase(), f);
          fieldByLabel.set(f.key.toLowerCase(), f);
        });

        // Map CSV headers to form field keys
        const csvHeaders = result.meta.fields || [];
        const headerFieldMap = csvHeaders.map((header) => {
          const field = fieldByLabel.get(header.toLowerCase());
          return { header, field: field || null };
        });

        // ── Validate: Check that all required fields are present in CSV headers ──
        const csvHeaderLowerSet = new Set(csvHeaders.map((h) => h.toLowerCase()));
        const requiredFields = formFields.filter((f) => f.required);
        const missingHeaders = requiredFields.filter((f) => {
          return !csvHeaderLowerSet.has(f.label.toLowerCase()) && !csvHeaderLowerSet.has(f.key.toLowerCase());
        });

        if (missingHeaders.length > 0) {
          resolve({
            imported: 0,
            failed: 0,
            errors: [
              `CSV is missing required column headers: ${missingHeaders.map((f) => f.label).join(", ")}. Please ensure your CSV has all required columns.`,
            ],
          });
          return;
        }

        // ── Process rows and prepare records ──
        const validatedRecords: { record: Record<string, any>; rowIndex: number }[] = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const record: Record<string, any> = {};
          let rowHasError = false;

          // Map and validate each field
          for (const { header, field } of headerFieldMap) {
            if (!field) continue;
            let value = (row[header] || "").trim();

            // Type coercion
            if (field.type === "number") {
              const num = Number(value.replace(/Tk\.\s*/g, "").replace(/[,$]/g, ""));
              if (isNaN(num)) {
                fieldErrors.push({
                  row: i + 2,
                  field: field.label,
                  message: `Invalid number value: "${value}"`,
                });
                rowHasError = true;
                continue;
              }
              record[field.key] = num;

              // Negative value guard: drop rows with negative transaction quantities
              if (record[field.key] < 0) {
                const isQuantityField = /quantity|days|allocated|count|stock|amount|balance|limit|price|rate|total|qty/i.test(field.key);
                if (isQuantityField) {
                  failed++;
                  errors.push(`Row ${i + 2}: Negative value not allowed for "${field.label}" (${record[field.key]}). Row dropped.`);
                  fieldErrors.push({
                    row: i + 2,
                    field: field.label,
                    message: `Negative value (${record[field.key]}) rejected by input sanitization rules`,
                  });
                  rowHasError = true;
                  break; // Stop processing this row
                }
              }
            } else if (field.type === "checkbox") {
              record[field.key] =
                value.toLowerCase() === "true" ||
                value === "1" ||
                value.toLowerCase() === "active";
            } else if (field.type === "date") {
              if (value) {
                const d = new Date(value);
                if (!isNaN(d.getTime())) {
                  record[field.key] = d.toISOString().split("T")[0];
                } else {
                  fieldErrors.push({
                    row: i + 2,
                    field: field.label,
                    message: `Invalid date value: "${value}"`,
                  });
                  rowHasError = true;
                  continue;
                }
              }
            } else if (field.type === "email") {
              if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                fieldErrors.push({
                  row: i + 2,
                  field: field.label,
                  message: `Invalid email format: "${value}"`,
                });
                rowHasError = true;
                continue;
              }
              record[field.key] = value;
            } else if (field.type === "text" || field.type === "textarea") {
              // Apply text sanitizer for security exploit protection
              const originalValue = value;
              const sanitized = sanitizeCSVText(value);
              if (sanitized !== originalValue.trim()) {
                // Determine what kind of sanitization occurred
                const wasTruncated = sanitized.length >= MAX_CSV_STRING_LENGTH && originalValue.trim().length > MAX_CSV_STRING_LENGTH;
                const wasDangerous = sanitized !== originalValue.trim() && !wasTruncated;
                if (wasTruncated) {
                  fieldErrors.push({
                    row: i + 2,
                    field: field.label,
                    message: `Input truncated: value exceeds ${MAX_CSV_STRING_LENGTH} character limit`,
                  });
                }
                if (wasDangerous) {
                  fieldErrors.push({
                    row: i + 2,
                    field: field.label,
                    message: `Input sanitized: potentially dangerous content removed`,
                  });
                }
              }
              // Phone field validation with Bangladesh +880 format
              if (PHONE_FIELD_PATTERNS.test(field.key) && sanitized) {
                const validatedPhone = validateBDPhone(sanitized);
                if (validatedPhone) {
                  record[field.key] = validatedPhone;
                } else {
                  // Non-BD format: still accept but warn
                  fieldErrors.push({
                    row: i + 2,
                    field: field.label,
                    message: `Phone "${sanitized}" does not match Bangladesh +880 format. Accepted as-is.`,
                  });
                  record[field.key] = sanitized;
                }
              } else {
                record[field.key] = sanitized;
              }
            } else {
              record[field.key] = value;
            }
          }

          // Validate required fields per row
          const missingRequired = formFields
            .filter((f) => f.required)
            .filter((f) => !record[f.key] && record[f.key] !== 0 && record[f.key] !== false);

          if (missingRequired.length > 0) {
            failed++;
            const fieldList = missingRequired.map((f) => f.label).join(", ");
            errors.push(`Row ${i + 2}: Missing required fields: ${fieldList}`);
            missingRequired.forEach((f) => {
              fieldErrors.push({
                row: i + 2,
                field: f.label,
                message: "Required field is empty",
              });
            });
            continue;
          }

          if (rowHasError) {
            failed++;
            errors.push(`Row ${i + 2}: Field validation failed`);
            continue;
          }

          if (Object.keys(record).length === 0) {
            failed++;
            errors.push(`Row ${i + 2}: No mappable data`);
            continue;
          }

          validatedRecords.push({ record, rowIndex: i + 2 });
        }

        // ── Duplicate detection: remove records with identical unique keys ──
        // Build a composite key from fields that typically identify a unique record:
        // name, code, phone, email — whichever are present in the record
        const seenKeys = new Map<string, number>(); // compositeKey → first rowIndex
        const dedupedRecords: { record: Record<string, any>; rowIndex: number }[] = [];
        const duplicateRows: number[] = [];

        for (const vr of validatedRecords) {
          const keyParts: string[] = [];
          // Use code, name, phone, email, productCode, supplierCode, customerCode, employeeCode as identity fields
          const identityFields = ['code', 'name', 'phone', 'email', 'productCode', 'supplierCode', 'customerCode', 'employeeCode', 'invoiceNo', 'poNumber', 'bankName', 'accountNo'];
          for (const f of identityFields) {
            if (vr.record[f] !== undefined && vr.record[f] !== null && vr.record[f] !== '') {
              keyParts.push(`${f}:${String(vr.record[f]).toLowerCase().trim()}`);
            }
          }
          const compositeKey = keyParts.length > 0 ? keyParts.join('|') : `__row_${vr.rowIndex}`;

          if (seenKeys.has(compositeKey)) {
            duplicateRows.push(vr.rowIndex);
            failed++;
            errors.push(`Row ${vr.rowIndex}: Duplicate record (same identity as row ${seenKeys.get(compositeKey)}). Skipped.`);
            fieldErrors.push({
              row: vr.rowIndex,
              field: 'duplicate',
              message: `Duplicate of row ${seenKeys.get(compositeKey)}`,
            });
          } else {
            seenKeys.set(compositeKey, vr.rowIndex);
            dedupedRecords.push(vr);
          }
        }

        // Replace validatedRecords with deduped version
        const recordsToInsert = duplicateRows.length > 0 ? dedupedRecords : validatedRecords;

        // ── Batch insert: groups of batchSize rows per API call ──
        // NOTE: Uses apiFetch() instead of raw fetch() so the request includes
        // Authorization (Bearer JWT) and X-CSRF-Token headers. Without these,
        // withApiSecurity() rejects every POST with HTTP 401 "Authentication
        // required", breaking CSV import app-wide.
        for (let batchStart = 0; batchStart < recordsToInsert.length; batchStart += batchSize) {
          const batch = recordsToInsert.slice(batchStart, batchStart + batchSize);
          const batchRecords = batch.map((b) => b.record);

          try {
            const batchResult = await apiFetch(apiPath, {
              method: "POST",
              body: JSON.stringify({ data: batchRecords, batchMode: true }),
            });
            // apiFetch returns { success: false, error: "Session expired" }
            // for POST 401 (after refresh fails) instead of throwing — treat
            // that as a failure so the user sees accurate error feedback.
            if (batchResult && batchResult.success === false) {
              throw new Error(batchResult.error || "Insert failed (session may have expired)");
            }
            // Batch succeeded — all rows in batch are imported
            imported += batch.length;
            onProgress?.(imported + failed, rows.length);
          } catch (err: any) {
            // Batch failed (HTTP error, network error, or auth failure) —
            // fall back to individual inserts for this batch
            for (const { record, rowIndex } of batch) {
              try {
                const singleResult = await apiFetch(apiPath, {
                  method: "POST",
                  body: JSON.stringify(record),
                });
                if (singleResult && singleResult.success === false) {
                  throw new Error(singleResult.error || "Insert failed (session may have expired)");
                }
                imported++;
              } catch (singleErr: any) {
                failed++;
                errors.push(`Row ${rowIndex}: ${singleErr.message || "Insert failed"}`);
              }
              onProgress?.(imported + failed, rows.length);
            }
          }
        }

        resolve({ imported, failed, errors, fieldErrors });
      } catch (error: any) {
        resolve({ imported: 0, failed: 0, errors: [`File read error: ${error.message}`] });
      }
    };

    input.click();
  });
}

// ============================================================
// VAT AUDITOR — Column masking helpers
// Comprehensive list of cost/profit/margin columns
// ============================================================

/** Standard cost/profit columns that VAT Auditor should not see values for */
export const VAT_MASKED_COLUMNS = [
  "costPrice",
  "wholesalePrice",
  "dealerPrice",
  "cost",
  "profit",
  "margin",
  "totalCost",
  "totalProfit",
  "grossProfit",
  "netProfit",
  "unitCost",
  "unitProfit",
  "purchasePrice",
  "buyingPrice",
  "sellingPrice",
  "mrp",
  "retailPrice",
  "basePrice",
  "discountAmount",
  "discountPercent",
  "vatAmount",
  "taxAmount",
  "cogs",
  "earnings",
  "revenue",
  "payable",
  "receivable",
  "balance",
  "openingBalance",
  "closingBalance",
];

/** Check if a column key should be masked for VAT Auditor */
export function isVatMasked(columnKey: string, extraMasked?: string[]): boolean {
  const allMasked = extraMasked ? [...VAT_MASKED_COLUMNS, ...extraMasked] : VAT_MASKED_COLUMNS;
  return allMasked.some((m) => columnKey.toLowerCase().includes(m.toLowerCase()));
}

/** Get list of masked column keys from a column definition array.
 *  Includes columns that match the VAT_MASKED_COLUMNS name patterns
 *  AND all columns with type "currency". */
export function getVatMaskedKeys(columns: ColumnDef[], extraMasked?: string[]): string[] {
  const masked: string[] = extraMasked ? [...extraMasked] : [];
  for (const col of columns) {
    // Include columns that match standard VAT masking patterns by name
    if (isVatMasked(col.key)) {
      masked.push(col.key);
    }
    // Include all currency-type columns (they contain sensitive financial data)
    if (col.type === "currency") {
      masked.push(col.key);
    }
  }
  return [...new Set(masked)];
}
