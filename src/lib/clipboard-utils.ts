/**
 * VoltERP — Clipboard Utilities
 * Copy table data to clipboard in TSV (tab-separated) format
 * for pasting into Excel/Google Sheets
 */

import { ColumnDef } from "./export-utils";
import { toLatinDigits } from "./number-format";

const AUDIT_MASK = "N/A (Audit Mode)";

/**
 * Copy table data to clipboard as tab-separated values
 * @param options - Copy options with title, columns, data, and optional VAT masking
 */
export async function copyTableToClipboard(options: {
  title: string;
  columns: ColumnDef[];
  data: any[];
  isVatAuditor?: boolean;
  vatMaskedColumns?: string[];
}): Promise<{ success: boolean; message: string }> {
  const { title, columns, data, isVatAuditor = false, vatMaskedColumns = [] } = options;
  const vatMaskSet = new Set(vatMaskedColumns);

  try {
    // Build header row
    const headerRow = columns.map(c => c.label).join('\t');

    // Build data rows
    const dataRows = data.map(item => {
      return columns.map(c => {
        // VAT Auditor masking
        if (isVatAuditor && vatMaskSet.has(c.key)) return AUDIT_MASK;
        if (item[c.key] === AUDIT_MASK) return AUDIT_MASK;

        const value = item[c.key];
        if (value === null || value === undefined || value === '') return '';

        // Format based on type
        if (c.type === 'currency') {
          const num = Number(value);
          if (isNaN(num)) return String(value);
          return toLatinDigits(`Tk. ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        }
        if (c.type === 'number') {
          const num = Number(value);
          if (isNaN(num)) return String(value);
          return toLatinDigits(num.toLocaleString('en-US'));
        }
        if (c.type === 'boolean') return value ? 'Active' : 'Inactive';
        if (c.type === 'date') {
          if (!value) return '';
          try {
            return toLatinDigits(new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
          } catch {
            return String(value);
          }
        }
        return String(value);
      }).join('\t');
    });

    // Combine title + header + data
    const fullText = `${title}\n\n${headerRow}\n${dataRows.join('\n')}`;

    // Copy to clipboard
    await navigator.clipboard.writeText(fullText);

    return { success: true, message: `Copied ${data.length} rows to clipboard` };
  } catch (error: any) {
    // Fallback for older browsers or secure context issues
    try {
      const textArea = document.createElement('textarea');
      const headerRow = columns.map(c => c.label).join('\t');
      const dataRows = data.map(item =>
        columns.map(c => {
          if (isVatAuditor && vatMaskSet.has(c.key)) return AUDIT_MASK;
          return String(item[c.key] ?? '');
        }).join('\t')
      );
      textArea.value = `${title}\n\n${headerRow}\n${dataRows.join('\n')}`;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return { success: true, message: `Copied ${data.length} rows to clipboard` };
    } catch (fallbackError) {
      return { success: false, message: 'Failed to copy to clipboard' };
    }
  }
}
