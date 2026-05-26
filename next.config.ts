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
  },
  allowedDevOrigins: [
    "http://21.0.11.89:3000",
    "http://21.0.11.89:81",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:81",
  ],
};

export default nextConfig;
