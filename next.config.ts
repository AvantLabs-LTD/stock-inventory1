import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["exceljs"],
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  allowedDevOrigins: [
    "preview-chat-294f3805-68cd-4ed5-94a5-347ea73b3d4e.space-z.ai",
  ],
};

export default nextConfig;
