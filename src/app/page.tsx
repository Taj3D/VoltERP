"use client";
// ============================================================
// VoltERP — Staging QA & Test Bed (Phase 19)
// Dynamic import wrapper with SSR disabled
// ============================================================

import dynamic from "next/dynamic";

const StagingQAPage = dynamic(
  () => import("@/components/StagingQAPage"),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a1628] via-[#132240] to-[#0a1628]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading Staging QA...</p>
        </div>
      </div>
    ),
  }
);

export default function Page() {
  return <StagingQAPage />;
}
