// ============================================================
// VoltERP — ELECTRONICS MART IMS
// Centralized Export/Import Utility Core
// Export PDF (jsPDF v4 + autoTable v5) | Export CSV | Import CSV
// Production-Ready: Corporate Layout, VAT Masking, UTF-8 BOM,
// Batch Insert, Row-Level Validation, Two-Pass Page Footer
// ============================================================

import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import Papa from "papaparse";

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
  type: "text" | "number" | "email" | "password" | "textarea" | "select" | "checkbox" | "date" | "image";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  defaultValue?: any;
  step?: string;
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
  logoData?: string;   // High-density base64 binary storage (fallback for logo)
  logoWidth?: number;  // mm (default 30)
  logoHeight?: number; // mm (default 20)
  vatNumber?: string;
  tradeLicense?: string;
  binNumber?: string;       // Business Identification Number
  currencySymbol?: string;  // Currency symbol for financial documents (e.g. "৳", "$", "€")
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
  customHeader?: (doc: jsPDF, pageNumber: number, pageWidth: number, pageHeight: number) => void;
  /** Optional company profile for dynamic branding in header/footer */
  company?: CompanyProfile;
  /** Enterprise Financial Footer: "Prepared By", "Checked By", "Authorized By" signature blocks */
  financialFooter?: {
    preparedBy?: string;
    checkedBy?: string;
    authorizedBy?: string;
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
    const num = Number(value);
    if (isNaN(num)) return "\u2014";
    return `\u09F3${num.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (type === "boolean") return value ? "Active" : "Inactive";
  if (type === "date") {
    if (!value) return "\u2014";
    try {
      return new Date(value).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return String(value);
    }
  }
  if (type === "number") {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    return num.toLocaleString("en-BD", { maximumFractionDigits: 2 });
  }
  return String(value);
}

// ============================================================
// UTILITY: Escape CSV field (RFC 4180 compliant)
// Handles commas, double quotes, line breaks, and the ৳ symbol
// Numeric values are not quoted unless they contain special chars
// ============================================================

function escapeCSVField(value: string, isNumeric?: boolean): string {
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
    value.includes("\u09F3"); // ৳ taka symbol

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
  doc: jsPDF,
  title: string,
  subtitle: string | undefined,
  isVatAuditor: boolean,
  pageWidth: number,
  margin: number,
  company?: CompanyProfile
): number {
  const companyName = company?.name || "VoltERP";
  const companyAddress = company?.address || "";
  const companyMobile = company?.mobile || company?.phone || "";
  const headerHeight = 34;

  // Navy blue header bar
  doc.setFillColor(10, 22, 40);
  doc.rect(0, 0, pageWidth, headerHeight, "F");

  // Calculate left offset for text (after logo if present)
  let textStartX = margin;

  // Company logo (if provided as base64 data URL)
  // Use logoData as fallback if logo is not present
  const logoSource = company?.logo || company?.logoData;
  if (logoSource) {
    const logoW = company.logoWidth || 30;
    const logoH = company.logoHeight || 20;
    const logoY = (headerHeight - logoH) / 2; // vertically centered in header
    try {
      const logoUrl = logoSource.startsWith("data:") ? logoSource : `data:image/png;base64,${logoSource}`;
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
      const brandUrl = company.brandLogo.startsWith("data:") ? company.brandLogo : `data:image/png;base64,${company.brandLogo}`;
      doc.addImage(brandUrl, pageWidth - margin - brandW - 2, brandY, brandW, brandH);
    } catch {
      // If brand logo fails, skip it
    }
  }

  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(companyName, textStartX, 11);

  // Company address (below name if provided)
  let addressY = 15;
  if (companyAddress) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 210, 225); // slightly dimmer white
    doc.text(companyAddress, textStartX, 15);
    addressY = 19;
  }

  // Company mobile/phone (if available, after address)
  if (companyMobile) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(220, 220, 230);
    doc.text(`Mobile: ${companyMobile}`, textStartX, addressY);
    addressY += 3;
  }

  // Company email (below address/mobile)
  if (company?.email) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 210, 225);
    const emailY = companyMobile ? addressY + 3 : 19;
    doc.text(company.email, textStartX, emailY);
    addressY = companyMobile ? emailY + 3 : emailY + 4;
  }

  // Report title
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(255, 255, 255);
  doc.text(title, textStartX, addressY + 3);

  // Subtitle / period
  if (subtitle) {
    doc.setFontSize(9);
    doc.text(subtitle, textStartX, addressY + 8);
  }

  // Generation timestamp (right-aligned)
  doc.setFontSize(8);
  const now = new Date();
  const timestamp = `Generated: ${now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  const tsWidth = doc.getTextWidth(timestamp);
  doc.text(timestamp, pageWidth - margin - tsWidth, 11);

  // Company phone/mobile (right-aligned, below timestamp)
  if (companyMobile) {
    doc.setFontSize(7);
    doc.setTextColor(200, 210, 225);
    const mobileWidth = doc.getTextWidth(companyMobile);
    doc.text(companyMobile, pageWidth - margin - mobileWidth, 15);
  } else if (company?.phone) {
    doc.setFontSize(7);
    doc.setTextColor(200, 210, 225);
    const phoneWidth = doc.getTextWidth(company.phone);
    doc.text(company.phone, pageWidth - margin - phoneWidth, 15);
  }

  // Company email (right-aligned, below phone)
  if (company?.email) {
    doc.setFontSize(7);
    doc.setTextColor(200, 210, 225);
    const emailWidth = doc.getTextWidth(company.email);
    doc.text(company.email, pageWidth - margin - emailWidth, 19);
  }

  // BIN Number (right-aligned, below email)
  if (company?.binNumber) {
    doc.setFontSize(6);
    doc.setTextColor(180, 190, 200);
    const binWidth = doc.getTextWidth(`BIN: ${company.binNumber}`);
    doc.text(`BIN: ${company.binNumber}`, pageWidth - margin - binWidth, 22);
  }

  // VAT Number and Trade License (right-aligned, below email)
  if (company?.vatNumber) {
    doc.setFontSize(6);
    doc.setTextColor(180, 190, 200);
    const vatWidth = doc.getTextWidth(`VAT: ${company.vatNumber}`);
    doc.text(`VAT: ${company.vatNumber}`, pageWidth - margin - vatWidth, 25);
  }
  if (company?.tradeLicense) {
    doc.setFontSize(6);
    doc.setTextColor(180, 190, 200);
    const tradeWidth = doc.getTextWidth(`Trade License: ${company.tradeLicense}`);
    doc.text(`Trade License: ${company.tradeLicense}`, pageWidth - margin - tradeWidth, 28);
  }

  // Currency symbol (right-aligned, below trade license)
  if (company?.currencySymbol) {
    doc.setFontSize(6);
    doc.setTextColor(180, 190, 200);
    const currWidth = doc.getTextWidth(`Currency: ${company.currencySymbol}`);
    doc.text(`Currency: ${company.currencySymbol}`, pageWidth - margin - currWidth, 31);
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

  return headerHeight + 4; // 38mm start position for table
}

// ============================================================
// INTERNAL: Draw footer on a jsPDF page
// ============================================================

function drawFooter(
  doc: jsPDF,
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
    const signatureY = pageHeight - 28; // Position above the navy bar
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");

    const signatureFields = [
      { label: "Prepared By", value: financialFooter.preparedBy || "" },
      { label: "Checked By", value: financialFooter.checkedBy || "" },
      { label: "Authorized By", value: financialFooter.authorizedBy || "" },
    ];

    // Draw three signature columns evenly spaced
    const colWidth = (pageWidth - margin * 2) / 3;
    signatureFields.forEach((field, i) => {
      const x = margin + i * colWidth;
      doc.setFont("helvetica", "bold");
      doc.text(`${field.label}:`, x, signatureY);
      doc.setFont("helvetica", "normal");
      // Underline for signature
      doc.setDrawColor(150, 150, 150);
      doc.setLineWidth(0.3);
      doc.line(x, signatureY + 1.5, x + colWidth - 10, signatureY + 1.5);
      if (field.value) {
        doc.text(field.value, x, signatureY + 5);
      }
    });

    // Printed By + ISO timestamp (right-aligned)
    const now = new Date();
    const isoTimestamp = now.toISOString().replace("T", " ").substring(0, 19);
    const printedByText = `Printed By: ${financialFooter.printedBy} | ${isoTimestamp}`;
    doc.setFontSize(6);
    doc.setTextColor(120, 120, 120);
    const ptbWidth = doc.getTextWidth(printedByText);
    doc.text(printedByText, pageWidth - margin - ptbWidth, signatureY + 9);
  }

  // Navy blue footer bar
  doc.setFillColor(10, 22, 40);
  doc.rect(0, pageHeight - 12, pageWidth, 12, "F");

  doc.setTextColor(148, 163, 184); // slate-400
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");

  // Left: copyright — use company name when provided, fallback to default
  const footerName = company?.name || "VoltERP";
  doc.text(`\u00A9 ${footerName}`, margin, footerY);

  // Right: page number (with placeholder for total)
  const pageText = `Page ${pageNumber} of ${totalPagesPlaceholder}`;
  doc.text(pageText, pageWidth - margin - doc.getTextWidth(pageText), footerY);
}

// ============================================================
// INTERNAL: Fix Page X of Y with a two-pass approach
// First pass: autoTable runs and draws placeholder {total}
// Second pass: replace {total} with actual page count
// ============================================================

function fixPageXOfY(doc: jsPDF, pageHeight: number, pageWidth: number, margin: number): void {
  const totalPageCount = doc.getNumberOfPages();
  for (let i = 1; i <= totalPageCount; i++) {
    doc.setPage(i);

    // Overwrite the right portion of the footer bar where the page text sits
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

export function exportToPDF(options: PDFOptions): void {
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
    company,
  } = options;

  try {
    const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const vatMaskSet = new Set(vatMaskedColumns);

    // ── Corporate Header ──
    const tableStartY = drawCorporateHeader(doc, title, subtitle, isVatAuditor, pageWidth, margin, company);

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
        drawCorporateHeader(doc, title, subtitle, isVatAuditor, pageWidth, margin, company);
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
          drawCorporateHeader(doc, title, subtitle, isVatAuditor, pageWidth, margin, company);
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
            textColor: rowStyle.textColor || [255, 255, 255],
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
    fixPageXOfY(doc, pageHeight, pageWidth, margin);

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

export function exportToPDFSimple(
  title: string,
  headers: string[],
  rows: string[][],
  orientation: "landscape" | "portrait" = "landscape",
  subtitle?: string,
  company?: CompanyProfile
): void {
  try {
    const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    // Corporate header
    const tableStartY = drawCorporateHeader(doc, title, subtitle, false, pageWidth, margin, company);

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
        drawFooter(doc, data.pageNumber, TOTAL_PLACEHOLDER, pageWidth, pageHeight, margin, company);
      },
    });

    // Second pass: fix Page X of Y
    fixPageXOfY(doc, pageHeight, pageWidth, margin);

    const rawFilename = title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const safeFilename = rawFilename.replace(/\.pdf$/i, "");
    doc.save(`${safeFilename}.pdf`);
  } catch (error: any) {
    console.error("Export PDF Simple Error:", error);
    throw new Error(`PDF export failed: ${error.message || "Unknown error"}`);
  }
}

// ============================================================
// EXPORT CSV ENGINE
// UTF-8 BOM always injected, RFC 4180 compliant, VAT masking,
// numeric values unquoted, proper escaping for ৳ symbol
// ============================================================

export function exportToCSV(options: CSVOptions): void {
  const {
    title,
    columns,
    data,
    isVatAuditor = false,
    vatMaskedColumns = [],
    filename,
  } = options;

  try {
    const vatMaskSet = new Set(vatMaskedColumns);
    const visibleColumns = getVisibleColumns(columns, isVatAuditor, vatMaskedColumns);

    // Build header row — labels are always text, so use text escaping
    const headerRow = visibleColumns
      .map((c) => escapeCSVField(c.label, false))
      .join(",");

    // Build data rows
    const dataRows = data.map((item: any) =>
      visibleColumns
        .map((c) => {
          const rawValue = formatCellValue(
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

    // UTF-8 BOM is ALWAYS injected for Excel compatibility (preserves ৳ symbol)
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

export function exportToCSVSimple(
  title: string,
  headers: string[],
  rows: string[][]
): void {
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

export async function importFromCSV(opts: ImportCSVOpts): Promise<ImportResult> {
  const { apiPath, formFields, onProgress, batchSize = 10 } = opts;

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
              const num = Number(value.replace(/[,$\u09F3]/g, ""));
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

        // ── Batch insert: groups of batchSize rows per API call ──
        for (let batchStart = 0; batchStart < validatedRecords.length; batchStart += batchSize) {
          const batch = validatedRecords.slice(batchStart, batchStart + batchSize);
          const batchRecords = batch.map((b) => b.record);

          try {
            const res = await fetch(apiPath, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ data: batchRecords, batchMode: true }),
            });

            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: res.statusText }));
              // If batch fails, fall back to individual inserts for this batch
              for (const { record, rowIndex } of batch) {
                try {
                  const singleRes = await fetch(apiPath, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(record),
                  });
                  if (!singleRes.ok) {
                    const singleErr = await singleRes
                      .json()
                      .catch(() => ({ error: singleRes.statusText }));
                    failed++;
                    errors.push(`Row ${rowIndex}: ${singleErr.error || `HTTP ${singleRes.status}`}`);
                  } else {
                    imported++;
                  }
                } catch (singleErr: any) {
                  failed++;
                  errors.push(`Row ${rowIndex}: ${singleErr.message || "Insert failed"}`);
                }
                onProgress?.(imported + failed, rows.length);
              }
            } else {
              // Batch succeeded — all rows in batch are imported
              imported += batch.length;
              onProgress?.(imported + failed, rows.length);
            }
          } catch (err: any) {
            // Network or other error — fall back to individual inserts
            for (const { record, rowIndex } of batch) {
              try {
                const singleRes = await fetch(apiPath, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(record),
                });
                if (!singleRes.ok) {
                  const singleErr = await singleRes
                    .json()
                    .catch(() => ({ error: singleRes.statusText }));
                  failed++;
                  errors.push(`Row ${rowIndex}: ${singleErr.error || `HTTP ${singleRes.status}`}`);
                } else {
                  imported++;
                }
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

/** Get list of masked column keys from a column definition array */
export function getVatMaskedKeys(columns: ColumnDef[], extraMasked?: string[]): string[] {
  return columns.filter((c) => isVatMasked(c.key, extraMasked)).map((c) => c.key);
}

// ============================================================
// INVOICE PDF CANVAS ENGINE — Phase 11 Refactoring
// Corporate criteria: metadata matrix, payment summary,
// legal compliance footer, invoice export orchestration
// ============================================================

// ── New Types ──

/** Invoice metadata for two-column metadata matrix rendering */
export interface InvoiceMetadata {
  documentNo: string;           // PO Number or Invoice Number
  counterpartyCode?: string;    // Supplier Code or Customer Code
  counterpartyName: string;     // Supplier Name or Customer Name
  counterpartyMobile?: string;  // Counterparty phone
  counterpartyAddress?: string; // Counterparty address
  creationDate: string;         // Document creation date
  dueDate?: string;             // Expected delivery or payment due date
  previousOutstanding?: number; // Previous outstanding balance
  balanceStatus?: string;       // "Clear", "Due", "Overdue"
  branchLocation?: string;      // Specific Branch/Showroom Location
}

/** Payment type breakdown for invoice rendering */
export interface PaymentBreakdown {
  cash: number;     // Cash amount collected
  bank: number;     // Bank transfer amount
  mfs: number;      // Mobile Financial Services (bKash/Nagad)
  card: number;     // Card payment amount
}

/** Legal compliance footer configuration */
export interface LegalFooterConfig {
  legalText?: string;      // Default: "This is a system-generated secure document. No physical seal or manual signature is required."
  greetingText?: string;   // Default: "Thank you for choosing our enterprise solutions."
}

/** Extended PDF options for invoice-specific rendering */
export interface InvoicePDFOptions extends PDFOptions {
  metadata?: InvoiceMetadata;
  paymentBreakdown?: PaymentBreakdown;
  legalFooter?: LegalFooterConfig;
}

// ── Helper: Format currency for invoice rendering ──

function invoiceCurrencyFmt(value: number, company?: CompanyProfile): string {
  const symbol = company?.currencySymbol || "\u09F3";
  const formatted = value.toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}

// ── New Drawing Functions ──

/**
 * Draw a two-column metadata matrix BELOW the header block.
 * LEFT COLUMN:  Document No, Counterparty Code, Counterparty Name, Mobile, Address
 * RIGHT COLUMN: Creation Date, Due Date, Previous Outstanding (formatted with currency), Balance Status
 *
 * Returns the Y position after the metadata matrix.
 */
export function drawMetadataMatrix(
  doc: jsPDF,
  metadata: InvoiceMetadata,
  startY: number,
  pageWidth: number,
  margin: number,
  company?: CompanyProfile
): number {
  const contentWidth = pageWidth - margin * 2;
  const colWidth = contentWidth / 2;
  const labelWidth = 38;
  const rowHeight = 5.5;
  const sectionPadding = 2;

  // ── Section title ──
  let currentY = startY + sectionPadding;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(10, 22, 40);
  doc.text("Document Information", margin, currentY);
  currentY += 1;

  // ── Light gray background for the entire matrix ──
  // Count rows: LEFT has 5 rows, RIGHT has 4 rows → 5 rows total
  const totalRows = 5;
  const matrixHeight = totalRows * rowHeight + sectionPadding * 2;
  doc.setFillColor(248, 249, 250); // #f8f9fa
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, currentY, contentWidth, matrixHeight, 1, 1, "FD");

  const matrixStartY = currentY + sectionPadding;

  // ── LEFT COLUMN ──
  const leftRows: Array<{ label: string; value: string }> = [
    { label: "Document No", value: metadata.documentNo || "\u2014" },
    { label: "Counterparty Code", value: metadata.counterpartyCode || "\u2014" },
    { label: "Counterparty Name", value: metadata.counterpartyName || "\u2014" },
    { label: "Mobile", value: metadata.counterpartyMobile || "\u2014" },
    { label: "Address", value: metadata.counterpartyAddress || "\u2014" },
  ];

  // ── RIGHT COLUMN ──
  const rightRows: Array<{ label: string; value: string }> = [
    { label: "Creation Date", value: formatCellValue(metadata.creationDate, "date") },
    {
      label: "Due Date",
      value: metadata.dueDate ? formatCellValue(metadata.dueDate, "date") : "\u2014",
    },
    {
      label: "Previous Outstanding",
      value:
        metadata.previousOutstanding !== undefined && metadata.previousOutstanding !== null
          ? invoiceCurrencyFmt(metadata.previousOutstanding, company)
          : "\u2014",
    },
    { label: "Balance Status", value: metadata.balanceStatus || "\u2014" },
  ];

  // Add branch location to right column if present
  if (metadata.branchLocation) {
    rightRows.push({ label: "Branch", value: metadata.branchLocation });
  }

  doc.setFontSize(7);

  // Draw LEFT column rows
  leftRows.forEach((row, i) => {
    const rowY = matrixStartY + i * rowHeight + 3.5;

    // Label (bold)
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text(`${row.label}:`, margin + 3, rowY);

    // Value (normal)
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    const valueX = margin + 3 + labelWidth;
    const maxValueWidth = colWidth - labelWidth - 6;
    const displayValue =
      doc.getTextWidth(row.value) > maxValueWidth
        ? doc.splitTextToSize(row.value, maxValueWidth)[0]
        : row.value;
    doc.text(displayValue, valueX, rowY);

    // Light separator line
    if (i < leftRows.length - 1) {
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.1);
      doc.line(margin + 3, rowY + 1.5, margin + colWidth - 3, rowY + 1.5);
    }
  });

  // Draw RIGHT column rows
  rightRows.forEach((row, i) => {
    const rowY = matrixStartY + i * rowHeight + 3.5;
    const colX = margin + colWidth;

    // Label (bold)
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text(`${row.label}:`, colX + 3, rowY);

    // Value (normal)
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    const valueX = colX + 3 + labelWidth;
    const maxValueWidth = colWidth - labelWidth - 6;
    const displayValue =
      doc.getTextWidth(row.value) > maxValueWidth
        ? doc.splitTextToSize(row.value, maxValueWidth)[0]
        : row.value;
    doc.text(displayValue, valueX, rowY);

    // Light separator line
    if (i < rightRows.length - 1) {
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.1);
      doc.line(colX + 3, rowY + 1.5, colX + colWidth - 3, rowY + 1.5);
    }
  });

  // Vertical divider between left and right columns
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(margin + colWidth, currentY + 1, margin + colWidth, currentY + matrixHeight - 1);

  return currentY + matrixHeight + 3;
}

/**
 * Draw a payment summary sub-table at the bottom-left of the invoice.
 * Maps Payment Type Breakdowns: Cash / Bank / MFS / Card alongside amounts.
 * Only renders if at least one payment amount > 0.
 *
 * Returns the Y position after the payment block.
 */
export function drawPaymentSummaryBlock(
  doc: jsPDF,
  breakdown: PaymentBreakdown,
  startY: number,
  pageWidth: number,
  margin: number,
  company?: CompanyProfile
): number {
  // Only render if at least one payment amount > 0
  if (breakdown.cash <= 0 && breakdown.bank <= 0 && breakdown.mfs <= 0 && breakdown.card <= 0) {
    return startY;
  }

  const contentWidth = pageWidth - margin * 2;
  const tableWidth = contentWidth * 0.5; // Left half of the page
  const rowHeight = 5.5;
  const sectionPadding = 2;

  let currentY = startY + sectionPadding;

  // ── Section title ──
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(10, 22, 40);
  doc.text("Payment Summary", margin, currentY);
  currentY += 1;

  // ── Build rows ──
  const rows: Array<{ type: string; amount: string }> = [];

  if (breakdown.cash > 0) {
    rows.push({ type: "Cash", amount: invoiceCurrencyFmt(breakdown.cash, company) });
  }
  if (breakdown.bank > 0) {
    rows.push({ type: "Bank Transfer", amount: invoiceCurrencyFmt(breakdown.bank, company) });
  }
  if (breakdown.mfs > 0) {
    rows.push({ type: "MFS (bKash/Nagad)", amount: invoiceCurrencyFmt(breakdown.mfs, company) });
  }
  if (breakdown.card > 0) {
    rows.push({ type: "Card Payment", amount: invoiceCurrencyFmt(breakdown.card, company) });
  }

  const total = breakdown.cash + breakdown.bank + breakdown.mfs + breakdown.card;

  // ── Light background for payment block ──
  const matrixHeight = (rows.length + 1) * rowHeight + sectionPadding * 2; // +1 for total row
  doc.setFillColor(248, 249, 250); // #f8f9fa
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, currentY, tableWidth, matrixHeight, 1, 1, "FD");

  const matrixStartY = currentY + sectionPadding;

  doc.setFontSize(7);

  // Draw data rows
  rows.forEach((row, i) => {
    const rowY = matrixStartY + i * rowHeight + 3.5;

    // Type label
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    doc.text(row.type, margin + 4, rowY);

    // Amount (right-aligned within the block)
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    const amountWidth = doc.getTextWidth(row.amount);
    doc.text(row.amount, margin + tableWidth - 4 - amountWidth, rowY);

    // Separator line
    if (i < rows.length - 1) {
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.1);
      doc.line(margin + 3, rowY + 1.5, margin + tableWidth - 3, rowY + 1.5);
    }
  });

  // ── Total row ──
  const totalY = matrixStartY + rows.length * rowHeight + 3.5;

  // Separator above total
  doc.setDrawColor(10, 22, 40);
  doc.setLineWidth(0.3);
  doc.line(margin + 3, totalY - 3, margin + tableWidth - 3, totalY - 3);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(10, 22, 40);
  doc.text("Total", margin + 4, totalY);

  const totalAmount = invoiceCurrencyFmt(total, company);
  const totalAmountWidth = doc.getTextWidth(totalAmount);
  doc.text(totalAmount, margin + tableWidth - 4 - totalAmountWidth, totalY);

  return currentY + matrixHeight + 3;
}

/**
 * Append legal compliance footer text just above the navy footer bar.
 * - Italicized legal text: system-generated document disclaimer
 * - Customizable customer greeting
 *
 * Returns the Y position after the legal text.
 */
export function drawLegalComplianceFooter(
  doc: jsPDF,
  config: LegalFooterConfig,
  pageWidth: number,
  pageHeight: number,
  margin: number,
  _company?: CompanyProfile
): number {
  const legalText =
    config.legalText ||
    "This is a system-generated secure document. No physical seal or manual signature is required.";
  const greetingText =
    config.greetingText || "Thank you for choosing our enterprise solutions.";

  // Position just above the navy footer bar (which starts at pageHeight - 12)
  // If financial footer is also present, we need to go above the signature block
  // Default: place legal text at pageHeight - 40 (above financial footer at pageHeight - 28)
  const legalY = pageHeight - 42;
  const greetingY = legalY + 4;

  doc.setFontSize(6);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(140, 140, 140); // gray

  // Legal text (left-aligned)
  const maxLegalWidth = pageWidth - margin * 2;
  const legalLines = doc.splitTextToSize(legalText, maxLegalWidth);
  legalLines.forEach((line: string, i: number) => {
    doc.text(line, margin, legalY + i * 3);
  });

  // Greeting text (left-aligned, after legal lines)
  const greetingStartY = legalY + legalLines.length * 3 + 1;
  const greetingLines = doc.splitTextToSize(greetingText, maxLegalWidth);
  greetingLines.forEach((line: string, i: number) => {
    doc.text(line, margin, greetingStartY + i * 3);
  });

  return greetingStartY + greetingLines.length * 3;
}

// ── Invoice Export Orchestrator ──

/**
 * High-level invoice PDF export function that orchestrates all new blocks:
 * 1. Corporate header (existing drawCorporateHeader)
 * 2. Metadata matrix (NEW drawMetadataMatrix) — if metadata provided
 * 3. Main table (existing autoTable pattern)
 * 4. Payment summary block (NEW drawPaymentSummaryBlock) — if breakdown provided
 * 5. Legal compliance footer (NEW drawLegalComplianceFooter)
 * 6. Standard footer (existing drawFooter with financialFooter signatures)
 * 7. Fix Page X of Y (existing fixPageXOfY)
 * 8. Save PDF
 */
export function exportInvoicePDF(options: InvoicePDFOptions): void {
  const {
    title,
    subtitle,
    orientation = "portrait",
    columns,
    data,
    isVatAuditor = false,
    vatMaskedColumns = [],
    filename,
    summaryRows,
    customHeader,
    company,
    financialFooter,
    metadata,
    paymentBreakdown,
    legalFooter,
  } = options;

  try {
    const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const vatMaskSet = new Set(vatMaskedColumns);
    const TOTAL_PLACEHOLDER = "{total}";

    // ── 1. Corporate Header ──
    let currentY = drawCorporateHeader(
      doc,
      title,
      subtitle,
      isVatAuditor,
      pageWidth,
      margin,
      company
    );

    // ── 2. Metadata Matrix (if provided) ──
    if (metadata) {
      currentY = drawMetadataMatrix(doc, metadata, currentY, pageWidth, margin, company);
    }

    // ── Adjust bottom margin for financial footer + legal footer ──
    const bottomMargin = financialFooter ? 44 : legalFooter ? 48 : 18;

    // ── 3. Main Table ──
    const visibleColumns = getVisibleColumns(columns, isVatAuditor, vatMaskedColumns);
    const headers = visibleColumns.map((c) => c.label);
    const body = data.map((item: any) =>
      visibleColumns.map((c) =>
        formatCellValue(item[c.key], c.type, isVatAuditor, vatMaskSet.has(c.key))
      )
    );

    // autoTable Configuration
    const headStyles: any = {
      fillColor: [37, 99, 235],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "left",
      cellPadding: 3,
    };

    const alternateRowStyles: any = {
      fillColor: [240, 244, 252],
    };

    const styles: any = {
      fontSize: 7,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      lineWidth: 0.1,
      lineColor: [203, 213, 225],
    };

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

    // Track the last page number to detect page breaks for legal footer placement
    let lastDrawnPage = 1;

    autoTable(doc, {
      head: [headers],
      body,
      startY: currentY,
      margin: { left: margin, right: margin, bottom: bottomMargin },
      styles,
      headStyles,
      alternateRowStyles,
      columnStyles: Object.keys(columnStyles).length > 0 ? columnStyles : undefined,
      didDrawPage: (drawData: any) => {
        lastDrawnPage = drawData.pageNumber;

        // ── 5. Legal Compliance Footer (on every page) ──
        if (legalFooter) {
          drawLegalComplianceFooter(doc, legalFooter, pageWidth, pageHeight, margin, company);
        }

        // ── 6. Standard Footer ──
        drawFooter(
          doc,
          drawData.pageNumber,
          TOTAL_PLACEHOLDER,
          pageWidth,
          pageHeight,
          margin,
          company,
          financialFooter
        );

        // Custom header callback
        if (customHeader) {
          customHeader(doc, drawData.pageNumber, pageWidth, pageHeight);
        }
      },
    });

    // ── 4. Payment Summary Block (after main table) ──
    if (paymentBreakdown) {
      const lastTable = (doc as any).lastAutoTable;
      let paymentY = lastTable ? lastTable.finalY + 6 : currentY + 30;

      // Ensure we're on the correct page
      const currentPage = doc.getNumberOfPages();
      if (currentPage !== lastDrawnPage) {
        doc.setPage(lastDrawnPage);
      }

      // Check if payment block fits on the current page
      if (paymentY > pageHeight - bottomMargin - 20) {
        doc.addPage();
        drawCorporateHeader(doc, title, subtitle, isVatAuditor, pageWidth, margin, company);
        if (legalFooter) {
          drawLegalComplianceFooter(doc, legalFooter, pageWidth, pageHeight, margin, company);
        }
        drawFooter(
          doc,
          doc.getNumberOfPages(),
          TOTAL_PLACEHOLDER,
          pageWidth,
          pageHeight,
          margin,
          company,
          financialFooter
        );
        paymentY = 38;
      }

      paymentY = drawPaymentSummaryBlock(
        doc,
        paymentBreakdown,
        paymentY,
        pageWidth,
        margin,
        company
      );
    }

    // ── Summary Rows ──
    if (summaryRows && summaryRows.length > 0) {
      const lastTable = (doc as any).lastAutoTable;
      const summaryStartY = lastTable ? lastTable.finalY + 4 : currentY + 30;

      let currentSummaryY: number;
      if (summaryStartY > pageHeight - (financialFooter ? 50 : legalFooter ? 54 : 30)) {
        doc.addPage();
        drawCorporateHeader(doc, title, subtitle, isVatAuditor, pageWidth, margin, company);
        if (legalFooter) {
          drawLegalComplianceFooter(doc, legalFooter, pageWidth, pageHeight, margin, company);
        }
        drawFooter(
          doc,
          doc.getNumberOfPages(),
          TOTAL_PLACEHOLDER,
          pageWidth,
          pageHeight,
          margin,
          company,
          financialFooter
        );
        currentSummaryY = 36;
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

        if (currentSummaryY > pageHeight - (financialFooter ? 50 : legalFooter ? 54 : 25)) {
          doc.addPage();
          drawCorporateHeader(doc, title, subtitle, isVatAuditor, pageWidth, margin, company);
          if (legalFooter) {
            drawLegalComplianceFooter(doc, legalFooter, pageWidth, pageHeight, margin, company);
          }
          drawFooter(
            doc,
            doc.getNumberOfPages(),
            TOTAL_PLACEHOLDER,
            pageWidth,
            pageHeight,
            margin,
            company,
            financialFooter
          );
          currentSummaryY = 36;
        }

        autoTable(doc, {
          body: [summaryRow.cells],
          startY: currentSummaryY,
          margin: { left: margin, right: margin, bottom: bottomMargin },
          styles: {
            fontSize: rowStyle.fontSize || 8,
            cellPadding: 3,
            textColor: rowStyle.textColor || [255, 255, 255],
            fontStyle: rowStyle.fontStyle || "bold",
            lineWidth: 0.1,
            lineColor: [203, 213, 225],
          },
          bodyStyles: {
            fillColor: rowStyle.fillColor || [10, 22, 40],
          },
          columnStyles: Object.keys(columnStyles).length > 0 ? columnStyles : undefined,
          didDrawPage: (drawData: any) => {
            if (legalFooter) {
              drawLegalComplianceFooter(doc, legalFooter, pageWidth, pageHeight, margin, company);
            }
            drawFooter(
              doc,
              drawData.pageNumber,
              TOTAL_PLACEHOLDER,
              pageWidth,
              pageHeight,
              margin,
              company,
              financialFooter
            );
          },
        });

        const lastSummaryTable = (doc as any).lastAutoTable;
        if (lastSummaryTable) {
          currentSummaryY = lastSummaryTable.finalY + 2;
        }
      });
    }

    // ── 7. Fix Page X of Y ──
    fixPageXOfY(doc, pageHeight, pageWidth, margin);

    // ── 8. Save PDF ──
    const rawFilename =
      filename || title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const safeFilename = rawFilename.replace(/\.pdf$/i, "");
    doc.save(`${safeFilename}.pdf`);
  } catch (error: any) {
    console.error("Export Invoice PDF Error:", error);
    throw new Error(`Invoice PDF export failed: ${error.message || "Unknown error"}`);
  }
}
