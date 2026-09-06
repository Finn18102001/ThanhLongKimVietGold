import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // CCCD uploads send optimized WebP via FormData; align with Product 10MB ceiling.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.thanglongkimviet.vn",
        pathname: "/product-media/**",
      },
    ],
  },
};

export default nextConfig;
