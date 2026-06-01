"use client";
// ============================================================
// VoltERP — Electronics Mart Inventory Management System
// Dynamic import wrapper with SSR disabled
// ============================================================

import dynamic from "next/dynamic";

const ElectronicsMartApp = dynamic(
  () => import("@/components/ElectronicsMartApp"),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a1628] via-[#132240] to-[#0a1628]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-blue-400 text-lg font-semibold">VoltERP</p>
          <p className="text-slate-500 text-sm mt-2">Loading Electronics Mart IMS...</p>
        </div>
      </div>
    ),
  }
);

export default function Page() {
  return <ElectronicsMartApp />;
}
