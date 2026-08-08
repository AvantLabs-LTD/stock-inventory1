import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["exceljs"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  allowedDevOrigins: [
    "preview-chat-294f3805-68cd-4ed5-94a5-347ea73b3d4e.space-z.ai",
  ],
};

export default nextConfig;
