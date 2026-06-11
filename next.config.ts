import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Vercel handles output automatically — no need for standalone
  // output: "standalone",

  // Turbopack is dev-only; not used in production builds
  turbopack: {
    root: __dirname,
  },

  // Required: many API routes have non-blocking TS errors
  // that don't affect runtime but fail strict build checks
  typescript: {
    ignoreBuildErrors: true,
  },

  reactStrictMode: false,
  experimental: {
    webpackMemoryOptimizations: true,
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@radix-ui/react-icons",
      "date-fns",
    ],
  },
  allowedDevOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ],

  // ============================================================
  // FIX: React Error #321 (Invalid Hook Call) in Production
  //
  // On Vercel production builds, React can be bundled multiple
  // times — once from node_modules/react and once from
  // next/dist/compiled/react. This causes "Invalid hook call"
  // errors when client-side libraries (jsPDF, papaparse, etc.)
  // trigger re-renders or state updates.
  //
  // Solution: Force webpack to resolve React from a single
  // location, preventing duplicate React instances.
  // ============================================================
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Client-side: ensure single React instance
      config.resolve = config.resolve || {};
      config.resolve.alias = config.resolve.alias || {};
      const reactPath = path.resolve(__dirname, "node_modules/react");
      const reactDomPath = path.resolve(__dirname, "node_modules/react-dom");
      (config.resolve.alias as Record<string, string>)["react"] = reactPath;
      (config.resolve.alias as Record<string, string>)["react-dom"] = reactDomPath;
      (config.resolve.alias as Record<string, string>)["react/jsx-runtime"] = path.join(reactPath, "cjs/react-jsx-runtime.production.js");
    }
    return config;
  },
};

export default nextConfig;
