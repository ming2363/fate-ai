import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  poweredByHeader: false,
  serverExternalPackages: ["lunar-javascript", "ip2region.js"],
  experimental: { cpus: 1 }, // Deployment host has less than 1 GiB RAM.
};

export default nextConfig;
