import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  poweredByHeader: false,
  serverExternalPackages: ["lunar-javascript"],
};

export default nextConfig;
