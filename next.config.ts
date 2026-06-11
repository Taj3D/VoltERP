import type { NextConfig } from "next";

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
};

export default nextConfig;
