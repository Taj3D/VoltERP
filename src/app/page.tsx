"use client";
// ============================================================
// ELECTRONICS MART — ROOT PAGE
//
// PERFORMANCE ARCHITECTURE (v3.1 — fix for "site not loading"
// on slow PC/mobile connections):
//
//  1. The server renders <LoginPage /> as the DEFAULT content.
//     Anonymous visitors see the login form INSTANTLY in the
//     initial HTML — zero JS needed to display it.
//
//  2. On the client, after hydration, useAuth() runs
//     initAuthState() inside useEffect. If the user has a valid
//     token in localStorage, isAuthenticated becomes true and
//     we dynamically import + mount the heavy ElectronicsMartApp
//     (6616 lines, ~650KB JS). This bundle only loads for
//     AUTHENTICATED users, never for first-time visitors.
//
//  3. This eliminates the previous "BAILOUT_TO_CLIENT_SIDE_RENDERING"
//     blank-screen-then-spinner problem where every visitor had
//     to download the entire ERP bundle before seeing anything.
//
// The BootScreen in layout.tsx still provides a branded loading
// state during the brief hydration window, but the LoginPage HTML
// is already in the document so it appears immediately.
// ============================================================

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/hooks/useAuth";
import LoginPage from "@/components/LoginPage";

// Heavy ERP app — only loaded AFTER authentication succeeds.
// ssr:false because it uses browser-only APIs and is too large
// for server rendering (6616 lines). But since it only loads
// for authenticated users, first-time visitors never pay this cost.
const ElectronicsMartApp = dynamic(
  () => import("@/components/ElectronicsMartApp"),
  {
    ssr: false,
    loading: () => (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background:
            "linear-gradient(135deg, #0a1628 0%, #132240 50%, #0a1628 100%)",
        }}
      >
        <div className="text-center" style={{ padding: "1rem" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              border: "4px solid rgba(96, 165, 250, 0.2)",
              borderTopColor: "#60a5fa",
              borderRadius: "50%",
              animation: "em-spin 0.8s linear infinite",
              margin: "0 auto 1rem",
            }}
          />
          <p
            style={{
              color: "#94a3b8",
              fontSize: "0.875rem",
              margin: 0,
            }}
          >
            Loading Electronics Mart...
          </p>
          <style>{`
            @keyframes em-spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      </div>
    ),
  }
);

export default function Page() {
  const { isAuthenticated } = useAuth();
  // Track mount to avoid hydration mismatch — server always renders
  // LoginPage, client swaps to ERP app only after mount + auth check.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Authenticated users get the full ERP app (client-only).
  // Everyone else (including SSR + first paint) sees the login page.
  if (mounted && isAuthenticated) {
    return <ElectronicsMartApp />;
  }

  return <LoginPage />;
}
