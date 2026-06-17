"use client";
// ============================================================
// ELECTRONICS MART - INVENTORY MANAGEMENT SYSTEM
// Thin wrapper with dynamic import (SSR disabled) to prevent
// OOM from the 336K SPA component during server-side rendering.
//
// PERFORMANCE: The root layout.tsx injects an instant HTML boot
// screen that displays before any JS loads. This component
// removes that boot screen as soon as React mounts, then shows
// its own loading fallback while the main app chunk downloads.
// ============================================================

import { useEffect } from "react";
import dynamic from "next/dynamic";

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
          <p style={{ color: "#94a3b8", fontSize: "0.875rem", margin: 0 }}>
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
  // Remove the instant boot screen as soon as React mounts
  useEffect(() => {
    if (typeof window !== "undefined" && window.__removeBootScreen) {
      window.__removeBootScreen();
    } else {
      // Fallback: directly remove the element
      const el = document.getElementById("boot-screen");
      if (el) {
        el.style.transition = "opacity 0.3s ease";
        el.style.opacity = "0";
        setTimeout(() => {
          if (el && el.parentNode) el.parentNode.removeChild(el);
        }, 300);
      }
    }
  }, []);

  return <ElectronicsMartApp />;
}
