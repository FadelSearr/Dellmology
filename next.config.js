const nextConfig = {
  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // CORS for Chrome extension token sync
        source: "/api/update-token",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },

  // Proxy Go engine SSE in development
  async rewrites() {
    return [
      {
        source: "/engine/:path*",
        destination: "http://localhost:8080/:path*",
      },
    ];
  },

  // Image optimization
  images: {
    unoptimized: true,
  },

  // Strict mode
  reactStrictMode: true,

  // PWA manifest link
  experimental: {},
};

module.exports = nextConfig;
