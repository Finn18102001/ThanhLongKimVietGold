import type { NextConfig } from "next";
import { BRAND_ASSET_VERSION } from "./src/shared/brand/assets";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/brand/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/invoice/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
  experimental: {
    // CCCD uploads send optimized WebP via FormData; align with Product 10MB ceiling.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    localPatterns: [
      { pathname: "**", search: "" },
      { pathname: "/brand/tlkv-logo-mark.png", search: `?v=${BRAND_ASSET_VERSION}` },
    ],
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
