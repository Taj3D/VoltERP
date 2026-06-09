/**
 * VoltERP — Centralized Number Formatting
 * GUARANTEES Latin digits (0-9) in all environments.
 *
 * Problem: Intl.NumberFormat('en-US') and bare .toLocaleString() can produce
 * Bengali numerals (০-৯) on BD-locale servers, causing garbled display.
 * Solution: All formatters include a Bengali-to-Latin digit replacement pass.
 */

// Bengali digit range: U+09E6 (০) to U+09EF (৯)
const BENGALI_DIGIT_RE = /[\u09E6-\u09EF]/g;

/** Convert any Bengali digits in a string to Latin equivalents */
export function toLatinDigits(s: string): string {
  return s.replace(BENGALI_DIGIT_RE, d => String(d.charCodeAt(0) - 0x09E6 + 0x0030));
}

/** Format a number with guaranteed Latin digits and 2 decimal places (currency format) */
export function fmtCurrency(value: number): string {
  const s = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(value);
  return toLatinDigits(s);
}

/** Format a number with guaranteed Latin digits, no fixed decimals (general number) */
export function fmtNumber(value: number): string {
  const s = new Intl.NumberFormat('en-US', {
    useGrouping: true,
  }).format(value);
  return toLatinDigits(s);
}

/** Format a number with guaranteed Latin digits and specified decimal places */
export function fmtDecimal(value: number, decimals: number = 2): string {
  const s = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(value);
  return toLatinDigits(s);
}

/** Format a number as Tk. prefixed currency string with guaranteed Latin digits */
export function fmtBDT(value: number): string {
  return `Tk. ${fmtCurrency(value)}`;
}

/** Safely format any value as currency, returning "—" for null/undefined */
export function fmtSafeCurrency(value: any): string {
  if (value === 'N/A (Audit Mode)' || value === 'N/A (Restricted)') return value;
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (isNaN(n)) return '—';
  return fmtBDT(n);
}

/** Safely format any value as a number */
export function fmtSafeNumber(value: any): string {
  if (value === 'N/A (Audit Mode)' || value === 'N/A (Restricted)') return value;
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (isNaN(n)) return '—';
  return fmtNumber(n);
}
