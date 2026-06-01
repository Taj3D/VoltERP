"use client";
// ============================================================
// VoltERP — Golden Handover Terminal (Phase 20)
// Dynamic import wrapper with SSR disabled
// ============================================================

import dynamic from "next/dynamic";

const GoldenHandoverPage = dynamic(
  () => import("@/components/GoldenHandoverPage"),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a1628] via-[#132240] to-[#0a1628]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-amber-400 text-lg font-semibold">VoltERP Golden Handover Terminal</p>
          <p className="text-slate-500 text-sm mt-2">Initializing Master Deployment Pipeline...</p>
        </div>
      </div>
    ),
  }
);

export default function Page() {
  return <GoldenHandoverPage />;
}
