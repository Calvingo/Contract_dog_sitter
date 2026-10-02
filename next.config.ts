import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  serverExternalPackages: ["pdf-lib", "@pdf-lib/fontkit"],
};

export default nextConfig;
