'use client';

/**
 * Feature Flag Provider for Electronics Mart IMS
 * =============================================
 *
 * Provides client-side access to feature flags via React Context.
 * Flags are fetched once on mount from /api/feature-flags and cached.
 *
 * Usage:
 *   // In root layout:
 *   <FeatureFlagProvider>
 *     <App />
 *   </FeatureFlagProvider>
 *
 *   // In any component:
 *   const { isEnabled } = useFeatureFlags();
 *   if (isEnabled('new_dashboard')) { return <NewDashboard />; }
 *   return <OldDashboard />;
 *
 *   // Or with hook:
 *   const enabled = useFeatureFlag('new_dashboard');
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export interface FeatureFlagState {
  [key: string]: boolean;
}

interface FeatureFlagContextValue {
  flags: FeatureFlagState;
  isEnabled: (key: string) => boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue | null>(null);

interface FeatureFlagProviderProps {
  children: React.ReactNode;
  /**
   * Initial flags to use before fetching from API (for SSR).
   * If not provided, all flags default to false until API responds.
   */
  initialFlags?: FeatureFlagState;
}

export function FeatureFlagProvider({ children, initialFlags }: FeatureFlagProviderProps) {
  const [flags, setFlags] = useState<FeatureFlagState>(initialFlags || {});
  const [loading, setLoading] = useState(!initialFlags);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/feature-flags', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) throw new Error(`Failed to fetch flags: ${res.status}`);
      const data = await res.json();
      const flagMap: FeatureFlagState = {};
      for (const flag of data.flags || []) {
        flagMap[flag.key] = flag.enabled;
      }
      setFlags(flagMap);
    } catch (err) {
      setError((err as Error).message);
      // On error, fall back to safe defaults (all features off)
      console.warn('[feature-flags] Failed to load, using safe defaults:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isEnabled = useCallback(
    (key: string) => {
      // If flags are loaded, use them
      if (key in flags) return flags[key];
      // During loading, use safe default (false for most, true for critical UI)
      return false;
    },
    [flags]
  );

  return (
    <FeatureFlagContext.Provider value={{ flags, isEnabled, loading, error, refresh }}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

/**
 * Hook to access all feature flags.
 */
export function useFeatureFlags(): FeatureFlagContextValue {
  const ctx = useContext(FeatureFlagContext);
  if (!ctx) {
    // Return safe defaults if provider is missing
    return {
      flags: {},
      isEnabled: () => false,
      loading: false,
      error: 'FeatureFlagProvider not mounted',
      refresh: async () => {},
    };
  }
  return ctx;
}

/**
 * Hook to check a single feature flag.
 * Returns false during loading (safe default).
 */
export function useFeatureFlag(key: string): boolean {
  const { isEnabled } = useFeatureFlags();
  return isEnabled(key);
}
