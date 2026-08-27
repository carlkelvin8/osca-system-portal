import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  // API URL from environment
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost/api/v1",
  },

  // Dev proxy: forwards /api/v1/* → FastAPI when NEXT_PUBLIC_API_URL is relative
  // Only active when the env var is not an absolute URL (i.e. local dev without Docker)
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
    if (apiUrl.startsWith("http")) return [];
    const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "9000",
      },
      {
        protocol: "https",
        hostname: "**.up.railway.app",
      },
    ],
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
