import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  poweredByHeader: false,
  serverExternalPackages: ["lunar-javascript", "ip2region.js"],
};

export default nextConfig;
