// ============================================================
// VoltERP — Company Branding Cache
// Client-side caching utility for company profile data used
// in PDF generation. Avoids redundant API calls when exporting
// multiple reports in a session.
// ============================================================

import type { CompanyProfile } from "./export-utils";

/** Module-level cache — persists for the lifetime of the browser session */
let cachedProfile: CompanyProfile | null = null;

/** Whether a fetch is currently in-flight (prevents duplicate requests) */
let fetchPromise: Promise<CompanyProfile | null> | null = null;

/**
 * Returns the cached company profile if available, or null if not yet loaded.
 * Use this for synchronous access (e.g., when a PDF export already has data).
 */
export function getCachedCompanyProfile(): CompanyProfile | null {
  return cachedProfile;
}

/**
 * Fetches the company branding profile from /api/company-branding
 * and caches it in memory. Returns the profile or null on failure.
 *
 * Uses the authenticated apiFetch to include the Bearer token,
 * since the company-branding endpoint requires authentication.
 *
 * - If a fetch is already in-flight, returns the same promise (deduplication).
 * - If the cache is already populated, returns it immediately (no network call).
 * - On failure, returns null silently (callers should fall back to defaults).
 */
export async function loadCompanyProfile(): Promise<CompanyProfile | null> {
  // Return cache if already loaded
  if (cachedProfile) {
    return cachedProfile;
  }

  // Deduplicate in-flight requests
  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = (async () => {
    try {
      // Use dynamic import to avoid circular dependency with api-client
      const { apiFetch } = await import("./api-client");
      const data = await apiFetch("/api/company-branding");
      if (data?.company) {
        cachedProfile = data.company as CompanyProfile;
        return cachedProfile;
      }
      console.warn("[CompanyBrandingCache] API returned no company data:", data);
      return null;
    } catch (e) {
      // Silently fail — callers use fallback defaults
      console.warn("[CompanyBrandingCache] Failed to load:", e);
      return null;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

/**
 * Clears the cached company profile.
 * Call this when the admin updates company branding so the next
 * PDF export fetches fresh data.
 */
export function clearCompanyProfileCache(): void {
  cachedProfile = null;
  fetchPromise = null;
}
