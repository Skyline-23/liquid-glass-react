import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  experimental: {
    externalDir: true,
  },
  transpilePackages: ["@skyline23/liquid-glass-react"],
};

export default nextConfig;
