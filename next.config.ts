import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
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
    "http://21.0.11.89:3000",
    "http://21.0.11.89:81",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:81",
    "https://preview-chat-fa2c15ed-30fa-4327-b586-0adccc59d359.space-z.ai",
    "http://preview-chat-fa2c15ed-30fa-4327-b586-0adccc59d359.space-z.ai",
  ],
};

export default nextConfig;
