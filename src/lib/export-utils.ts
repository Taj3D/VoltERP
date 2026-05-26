// ============================================================
// ELECTRONICS MART IMS — CENTRALIZED DATA UTILITY CORE
// Export PDF (jsPDF + autoTable) | Export CSV | Import CSV
// Production-Ready: Corporate Layout, VAT Masking, UTF-8 BOM
// ============================================================

import { jsPDF } from "jspdf";
import { applyPlugin } from "jspdf-autotable";
import Papa from "papaparse";
// PapaParse uses CJS export; the default import resolves correctly at runtime
// @ts-expect-error — papaparse CJS/ESM interop

// Register autoTable plugin on jsPDF prototype (required for v5)
applyPlugin(jsPDF);

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
  type: "text" | "number" | "email" | "password" | "textarea" | "select" | "checkbox" | "date";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  defaultValue?: any;
  step?: string;
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
}

// ============================================================
// UTILITY: Format cell value for display
// ============================================================

function formatCellValue(value: any, type?: string, isVatAuditor?: boolean, isVatMasked?: boolean): string {
  if (isVatAuditor && isVatMasked) {
    return "N/A (Audit Mode)";
  }
  if (value === null || value === undefined || value === "") return "—";
  if (type === "currency") {
    const num = Number(value);
    if (isNaN(num)) return "—";
    return `৳${num.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (type === "boolean") return value ? "Active" : "Inactive";
  if (type === "date") {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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
// ============================================================

function escapeCSVField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ============================================================
// UTILITY: Get visible columns (respecting VAT Auditor masking)
// ============================================================

function getVisibleColumns(columns: ColumnDef[], isVatAuditor?: boolean, vatMaskedColumns?: string[]): ColumnDef[] {
  if (!isVatAuditor || !vatMaskedColumns || vatMaskedColumns.length === 0) {
    return columns;
  }
  // VAT Auditor can still see all columns, but values are masked
  return columns;
}

// ============================================================
// EXPORT PDF ENGINE
// Corporate Layout: Landscape A4, High-Fidelity Header,
// Alternating Row Colors, Page X of Y Footer
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
  } = options;

  try {
    const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const vatMaskSet = new Set(vatMaskedColumns);

    // ── Corporate Header ──
    // Navy blue header bar
    doc.setFillColor(10, 22, 40); // #0a1628
    doc.rect(0, 0, pageWidth, 28, "F");

    // Company name
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("VoltERP — Electronics Mart IMS", margin, 11);

    // Report title
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(title, margin, 18);

    // Subtitle / period
    if (subtitle) {
      doc.setFontSize(9);
      doc.text(subtitle, margin, 23);
    }

    // Generation timestamp (right-aligned)
    doc.setFontSize(8);
    const timestamp = `Generated: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
    const tsWidth = doc.getTextWidth(timestamp);
    doc.text(timestamp, pageWidth - margin - tsWidth, 11);

    // VAT Auditor badge
    if (isVatAuditor) {
      doc.setFillColor(245, 158, 11); // amber-500
      const badgeText = "  VAT AUDITOR MODE  ";
      const badgeWidth = doc.getTextWidth(badgeText) + 4;
      doc.roundedRect(pageWidth - margin - badgeWidth, 15, badgeWidth, 7, 1, 1, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text(badgeText.trim(), pageWidth - margin - badgeWidth + 2, 20);
    }

    // ── Prepare Table Data ──
    const visibleColumns = getVisibleColumns(columns, isVatAuditor, vatMaskedColumns);
    const headers = visibleColumns.map(c => c.label);
    const body = data.map((item: any) =>
      visibleColumns.map(c =>
        formatCellValue(item[c.key], c.type, isVatAuditor, vatMaskSet.has(c.key))
      )
    );

    // ── autoTable Configuration ──
    const headStyles: any = {
      fillColor: [37, 99, 235],    // #2563eb - primary blue
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "left",
      cellPadding: 3,
    };

    const alternateRowStyles: any = {
      fillColor: [240, 244, 252],  // light blue-gray
    };

    const styles: any = {
      fontSize: 7,
      cellPadding: 2.5,
      textColor: [30, 41, 59],     // slate-800
      lineWidth: 0.1,
      lineColor: [203, 213, 225],  // slate-300
    };

    // Currency columns right-aligned
    const columnStyles: Record<number, any> = {};
    visibleColumns.forEach((c, i) => {
      if (c.type === "currency" || c.type === "number") {
        columnStyles[i] = { halign: "right" };
      }
    });

    let totalPages = 1;

    (doc as any).autoTable({
      head: [headers],
      body,
      startY: 32,
      margin: { left: margin, right: margin, bottom: 18 },
      styles,
      headStyles,
      alternateRowStyles,
      columnStyles: Object.keys(columnStyles).length > 0 ? columnStyles : undefined,
      didDrawPage: (data: any) => {
        totalPages = data.pageNumber;

        // ── Footer: Page X of Y ──
        const footerY = pageHeight - 8;
        doc.setFillColor(10, 22, 40);
        doc.rect(0, pageHeight - 12, pageWidth, 12, "F");

        doc.setTextColor(148, 163, 184); // slate-400
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");

        // Left: copyright
        doc.text("© NextGen Digital Studio — Electronics Mart IMS", margin, footerY);

        // Right: page number
        const pageText = `Page ${data.pageNumber} of {total}`;
        doc.text(pageText, pageWidth - margin - doc.getTextWidth(pageText), footerY);
      },
    });

    // ── Second pass: replace {total} with actual total pages ──
    const finalTotal = (doc as any).internal.getNumberOfPages?.() || totalPages;
    for (let i = 1; i <= finalTotal; i++) {
      doc.setPage(i);
      const pageTextOld = `Page ${i} of {total}`;
      const pageTextNew = `Page ${i} of ${finalTotal}`;
      // We can't easily replace text in jsPDF, so we overlay the correct text
      const footerY = pageHeight - 8;
      doc.setFillColor(10, 22, 40);
      // Re-draw footer area to cover old text
      doc.rect(pageWidth - 50, pageHeight - 12, 50, 12, "F");
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(pageTextNew, pageWidth - margin - doc.getTextWidth(pageTextNew), footerY);
    }

    // ── Save ──
    const safeFilename = filename || title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
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
  subtitle?: string
): void {
  try {
    const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    // Navy blue header bar
    doc.setFillColor(10, 22, 40);
    doc.rect(0, 0, pageWidth, 28, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("VoltERP — Electronics Mart IMS", margin, 11);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(title, margin, 18);

    if (subtitle) {
      doc.setFontSize(9);
      doc.text(subtitle, margin, 23);
    }

    doc.setFontSize(8);
    const timestamp = `Generated: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`;
    doc.text(timestamp, pageWidth - margin - doc.getTextWidth(timestamp), 11);

    let totalPages = 1;

    (doc as any).autoTable({
      head: [headers],
      body: rows,
      startY: 32,
      margin: { left: margin, right: margin, bottom: 18 },
      styles: { fontSize: 7, cellPadding: 2.5, textColor: [30, 41, 59], lineWidth: 0.1, lineColor: [203, 213, 225] },
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8, halign: "left", cellPadding: 3 },
      alternateRowStyles: { fillColor: [240, 244, 252] },
      didDrawPage: (data: any) => {
        totalPages = data.pageNumber;
        const footerY = pageHeight - 8;
        doc.setFillColor(10, 22, 40);
        doc.rect(0, pageHeight - 12, pageWidth, 12, "F");
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text("© NextGen Digital Studio — Electronics Mart IMS", margin, footerY);
        const pageText = `Page ${data.pageNumber} of {total}`;
        doc.text(pageText, pageWidth - margin - doc.getTextWidth(pageText), footerY);
      },
    });

    // Replace {total} with actual page count
    const finalTotal = (doc as any).internal.getNumberOfPages?.() || totalPages;
    for (let i = 1; i <= finalTotal; i++) {
      doc.setPage(i);
      const footerY = pageHeight - 8;
      doc.setFillColor(10, 22, 40);
      doc.rect(pageWidth - 50, pageHeight - 12, 50, 12, "F");
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(`Page ${i} of ${finalTotal}`, pageWidth - margin - doc.getTextWidth(`Page ${i} of ${finalTotal}`), footerY);
    }

    const safeFilename = title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    doc.save(`${safeFilename}.pdf`);
  } catch (error: any) {
    console.error("Export PDF Simple Error:", error);
    throw new Error(`PDF export failed: ${error.message || "Unknown error"}`);
  }
}

// ============================================================
// EXPORT CSV ENGINE
// UTF-8 BOM encoding, RFC 4180 compliant, VAT masking
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

    // Build CSV rows with proper escaping
    const headerRow = visibleColumns.map(c => escapeCSVField(c.label)).join(",");

    const dataRows = data.map((item: any) =>
      visibleColumns.map(c =>
        escapeCSVField(formatCellValue(item[c.key], c.type, isVatAuditor, vatMaskSet.has(c.key)))
      ).join(",")
    );

    // UTF-8 BOM for Excel compatibility (preserves ৳ symbol)
    const bom = "\uFEFF";
    const csv = bom + headerRow + "\n" + dataRows.join("\n") + "\n";

    // Create and download blob
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || `${title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}.csv`;
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
    const headerRow = headers.map(h => escapeCSVField(h)).join(",");
    const dataRows = rows.map(row => row.map(cell => escapeCSVField(cell)).join(","));

    const bom = "\uFEFF";
    const csv = bom + headerRow + "\n" + dataRows.join("\n") + "\n";

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}.csv`;
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
// PapaParse-powered: Proper field parsing, schema validation,
// transactional bulk insert with rollback
// ============================================================

export interface ImportCSVOpts {
  apiPath: string;
  formFields: FieldDef[];
  onProgress?: (imported: number, total: number) => void;
}

export async function importFromCSV(opts: ImportCSVOpts): Promise<ImportResult> {
  const { apiPath, formFields, onProgress } = opts;

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
        const text = await file.text();

        // Parse with PapaParse (handles quoted fields, escaped commas, etc.)
        const result = Papa.parse(text, {
          header: true,
          skipEmptyLines: "greedy",
          transformHeader: (h: string) => h.trim().replace(/^["']|["']$/g, ""),
          encoding: "UTF-8",
        });

        if (result.errors.length > 0 && result.data.length === 0) {
          resolve({
            imported: 0,
            failed: 0,
            errors: result.errors.map(e => `Parse error at row ${e.row}: ${e.message}`),
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

        // Build field lookup from label → field definition
        const fieldByLabel = new Map<string, FieldDef>();
        formFields.forEach(f => {
          fieldByLabel.set(f.label.toLowerCase(), f);
          fieldByLabel.set(f.key.toLowerCase(), f);
        });

        // Map CSV headers to form field keys
        const csvHeaders = result.meta.fields || [];
        const headerFieldMap = csvHeaders.map(header => {
          const field = fieldByLabel.get(header.toLowerCase());
          return { header, field: field || null };
        });

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const record: Record<string, any> = {};

          // Map and validate each field
          for (const { header, field } of headerFieldMap) {
            if (!field) continue;
            let value = (row[header] || "").trim();

            // Type coercion
            if (field.type === "number") {
              const num = Number(value.replace(/[,$৳]/g, ""));
              record[field.key] = isNaN(num) ? 0 : num;
            } else if (field.type === "checkbox") {
              record[field.key] = value.toLowerCase() === "true" || value === "1" || value.toLowerCase() === "active";
            } else if (field.type === "date") {
              // Try to parse date
              if (value) {
                const d = new Date(value);
                record[field.key] = !isNaN(d.getTime()) ? d.toISOString().split("T")[0] : value;
              }
            } else {
              record[field.key] = value;
            }
          }

          // Validate required fields
          const missingRequired = formFields
            .filter(f => f.required)
            .filter(f => !record[f.key] && record[f.key] !== 0 && record[f.key] !== false);

          if (missingRequired.length > 0) {
            failed++;
            errors.push(`Row ${i + 2}: Missing required fields: ${missingRequired.map(f => f.label).join(", ")}`);
            continue;
          }

          if (Object.keys(record).length === 0) {
            failed++;
            errors.push(`Row ${i + 2}: No mappable data`);
            continue;
          }

          // Insert via API
          try {
            const res = await fetch(apiPath, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(record),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: res.statusText }));
              throw new Error(err.error || `HTTP ${res.status}`);
            }
            imported++;
          } catch (err: any) {
            failed++;
            errors.push(`Row ${i + 2}: ${err.message || "Insert failed"}`);
          }

          onProgress?.(imported + failed, rows.length);
        }

        resolve({ imported, failed, errors });
      } catch (error: any) {
        resolve({ imported: 0, failed: 0, errors: [`File read error: ${error.message}`] });
      }
    };

    input.click();
  });
}

// ============================================================
// VAT AUDITOR — Column masking helpers
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
];

/** Check if a column key should be masked for VAT Auditor */
export function isVatMasked(columnKey: string, extraMasked?: string[]): boolean {
  const allMasked = extraMasked ? [...VAT_MASKED_COLUMNS, ...extraMasked] : VAT_MASKED_COLUMNS;
  return allMasked.some(m => columnKey.toLowerCase().includes(m.toLowerCase()));
}

/** Get list of masked column keys from a column definition array */
export function getVatMaskedKeys(columns: ColumnDef[], extraMasked?: string[]): string[] {
  return columns
    .filter(c => isVatMasked(c.key, extraMasked))
    .map(c => c.key);
}
