// ============================================================
// VoltERP — Vercel Blob Storage Utility
// Uploads company logos / brand images to Vercel Blob CDN.
//
// Architecture:
//   - PRIMARY: Vercel Blob (edge-cached CDN URL, ~50ms global)
//   - FALLBACK: base64 in Turso DB (when BLOB_READ_WRITE_TOKEN not set,
//               e.g., local dev or before blob store is provisioned)
//
// Setup (one-time, in Vercel dashboard):
//   1. Go to project → Storage → Create Blob Store
//   2. Copy BLOB_READ_WRITE_TOKEN to env vars
//   3. Redeploy — uploads automatically switch to Blob
// ============================================================

import { put, del } from '@vercel/blob';

/** Whether Vercel Blob is configured (token present) */
export function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Upload a base64-encoded image to Vercel Blob.
 *
 * @param base64Data - Raw base64 string (WITHOUT data: prefix) OR full data URL
 * @param filename   - Target filename (e.g., "company-logo-cmqhcp83.png")
 * @param contentType - MIME type (e.g., "image/png")
 * @returns Object with either { url, storedInBlob: true } on success,
 *          or { base64, storedInBlob: false } when Blob not configured.
 */
export async function uploadImageToBlob(
  base64Data: string,
  filename: string,
  contentType: string
): Promise<{ url: string; storedInBlob: true } | { base64: string; storedInBlob: false }> {
  // Strip data URL prefix if present
  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');

  // If Blob not configured, return base64 for DB storage (graceful fallback)
  if (!isBlobConfigured()) {
    return { base64: cleanBase64, storedInBlob: false };
  }

  // Convert base64 → Buffer for Vercel Blob upload
  const buffer = Buffer.from(cleanBase64, 'base64');

  const blob = await put(filename, buffer, {
    access: 'public',
    contentType,
    addRandomSuffix: false, // deterministic URLs so re-upload overwrites
  });

  return { url: blob.url, storedInBlob: true };
}

/**
 * Delete a file from Vercel Blob by URL.
 * Silently skips if Blob not configured or URL is invalid.
 */
export async function deleteBlobByUrl(url: string): Promise<void> {
  if (!isBlobConfigured() || !url || !url.startsWith('http')) return;
  try {
    await del(url);
  } catch (err) {
    // Non-fatal — orphaned blobs are cleaned up via Vercel dashboard
    console.warn('[blob] Failed to delete:', err);
  }
}

/**
 * Build a deterministic blob path for a company logo.
 * Format: company-logos/{companyId}-logo.png
 */
export function logoBlobPath(companyId: string, ext: string = 'png'): string {
  return `company-logos/${companyId}-logo.${ext}`;
}

/**
 * Build a deterministic blob path for a brand logo.
 * Format: company-logos/{companyId}-brand.png
 */
export function brandLogoBlobPath(companyId: string, ext: string = 'png'): string {
  return `company-logos/${companyId}-brand.${ext}`;
}

/**
 * Detect image extension from base64 data URL or MIME type.
 */
export function detectExtension(input: string): string {
  if (input.startsWith('data:image/png')) return 'png';
  if (input.startsWith('data:image/jpeg') || input.startsWith('data:image/jpg')) return 'jpg';
  if (input.startsWith('data:image/webp')) return 'webp';
  if (input.startsWith('data:image/gif')) return 'gif';
  if (input.startsWith('data:image/svg')) return 'svg';
  return 'png'; // default
}

/**
 * Detect MIME type from base64 data URL.
 */
export function detectContentType(input: string): string {
  if (input.startsWith('data:image/png')) return 'image/png';
  if (input.startsWith('data:image/jpeg') || input.startsWith('data:image/jpg')) return 'image/jpeg';
  if (input.startsWith('data:image/webp')) return 'image/webp';
  if (input.startsWith('data:image/gif')) return 'image/gif';
  if (input.startsWith('data:image/svg')) return 'image/svg+xml';
  return 'image/png';
}
