"use client";

// ============================================================
// BOOT SCREEN — Client Component
// Renders an instant loading screen that shows before the main
// app chunk finishes downloading. Converted from a raw HTML
// `dangerouslySetInnerHTML` block to a proper React component
// to eliminate the Next.js 16 hydration mismatch error.
//
// Behaviour:
//  - Server renders this component (SSR) so the boot screen is
//    in the initial HTML payload → visible instantly.
//  - On the client, React hydrates the same JSX → no mismatch.
//  - useEffect sets up:
//      * PerformanceObserver-based progress %
//      * Slow-connection warnings (10s / 20s)
//      * Self-removal once React has mounted
//  - A 30s hard fallback removal is kept in layout.tsx as a
//    last-resort safety net for extremely slow devices.
// ============================================================

import { useEffect, useRef, useState } from "react";

type Phase = "loading" | "slow" | "very-slow" | "hidden";

export function BootScreen() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState(0);
  const removedRef = useRef(false);

  useEffect(() => {
    // --- Progress tracking via PerformanceObserver ---
    let total = 0;
    let loaded = 0;
    let obs: PerformanceObserver | null = null;

    if (typeof window !== "undefined" && "PerformanceObserver" in window) {
      try {
        obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            total++;
            if ((entry as PerformanceResourceTiming).transferSize > 0 ||
                (entry as PerformanceResourceTiming).decodedBodySize > 0) {
              loaded++;
            }
          }
          if (total > 0) {
            setProgress(Math.min(99, Math.round((loaded / total) * 100)));
          }
        });
        obs.observe({ type: "resource", buffered: true } as PerformanceObserverInit);
      } catch {
        // PerformanceObserver not supported — progress stays at 0
      }
    }

    // --- Slow connection warnings ---
    const t1 = window.setTimeout(() => {
      setPhase((p) => (p === "loading" ? "slow" : p));
    }, 10000);

    const t2 = window.setTimeout(() => {
      setPhase((p) => (p === "loading" || p === "slow" ? "very-slow" : p));
    }, 20000);

    // --- Self-removal shortly after mount ---
    // This mirrors the previous behaviour where page.tsx removed the
    // boot screen as soon as React mounted. A tiny delay lets the
    // dynamic-import loading state of page.tsx paint first, avoiding
    // a flash of unstyled content.
    const removeTimer = window.setTimeout(() => {
      removeBootScreen();
    }, 200);

    function removeBootScreen() {
      if (removedRef.current) return;
      removedRef.current = true;
      setPhase("hidden");
      // Disconnect the observer to free resources
      if (obs) {
        try { obs.disconnect(); } catch { /* noop */ }
      }
      // After the CSS fade-out transition, the component returns null
      // (see render below) so the DOM node is removed by React.
    }

    // Expose for the fallback script in layout.tsx
    (window as unknown as { __removeBootScreen?: () => void }).__removeBootScreen = removeBootScreen;

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(removeTimer);
      if (obs) {
        try { obs.disconnect(); } catch { /* noop */ }
      }
    };
  }, []);

  // Once hidden, render nothing (React removes the DOM node)
  if (phase === "hidden") return null;

  const loadingText =
    phase === "loading"
      ? "Loading... Please wait"
      : phase === "slow"
      ? "Still loading... (slow connection)"
      : "Connection is very slow. Check your internet.";

  const textClass =
    phase === "slow"
      ? "boot-loading-text boot-warn"
      : phase === "very-slow"
      ? "boot-loading-text boot-error"
      : "boot-loading-text";

  return (
    <div id="boot-screen" aria-busy="true" aria-live="polite" role="status">
      <div className="boot-container">
        <div className="boot-logo" role="img" aria-label="Electronics Mart">
          <svg
            width="64"
            height="64"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="4" y="4" width="56" height="56" rx="12" fill="#0a1628" />
            <path
              d="M20 22h24v4H20zM20 30h24v4H20zM20 38h16v4H20z"
              fill="#60a5fa"
            />
            <circle cx="48" cy="40" r="3" fill="#34d399" />
          </svg>
        </div>
        <h1 className="boot-title">Electronics Mart</h1>
        <p className="boot-subtitle">Inventory Management System</p>
        <div
          className="boot-spinner"
          role="progressbar"
          aria-label="Loading"
        >
          <div className="boot-spinner-bar" />
        </div>
        <p className={textClass}>{loadingText}</p>
        <p className="boot-progress-text">
          {progress > 0 ? `${progress}% loaded` : ""}
        </p>
        <p className="boot-version">v3.0.0 &middot; Secured</p>
        {phase === "very-slow" && (
          <button
            className="boot-retry-btn"
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
          >
            Retry Loading
          </button>
        )}
      </div>
    </div>
  );
}
