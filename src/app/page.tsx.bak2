"use client";
// ============================================================
// ELECTRONICS MART - INVENTORY MANAGEMENT SYSTEM
// Thin wrapper with dynamic import (SSR disabled) to prevent
// OOM from the 336K SPA component during server-side rendering
// ============================================================

import dynamic from "next/dynamic";

const ElectronicsMartApp = dynamic(
  () => import("@/components/ElectronicsMartApp"),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a1628] via-[#132240] to-[#0a1628]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading Electronics Mart...</p>
        </div>
      </div>
    ),
  }
);

export default function Page() {
  return <ElectronicsMartApp />;
}
