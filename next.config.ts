import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Allow production builds to proceed even if lint errors exist (for Vercel deploy)
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
