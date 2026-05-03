/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

// NOTE:
// - Next.js dev tooling (especially Turbopack) often requires 'unsafe-eval'.
// - In production we avoid 'unsafe-eval'.
// - We keep connect-src permissive to support API + WS across environments.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self'${isDev ? " 'unsafe-eval'" : ""} 'unsafe-inline'`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data: https: http:",
  "connect-src 'self' https: http: ws: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle so the production Docker image can
  // drop full node_modules and run via `node server.js`.
  output: "standalone",
  transpilePackages: [],
  /**
   * In dev, proxy same-origin `/api/*` to Django.
   * Docker note: 127.0.0.1 points to the frontend container itself, so default
   * to the backend container DNS name unless API_PROXY_TARGET is explicitly set.
   */
  async rewrites() {
    if (process.env.NODE_ENV !== "development") {
      return [];
    }
    const target = (process.env.API_PROXY_TARGET || "http://emr-backend-local:8001").replace(/\/$/, "");
    return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
        pathname: '/wikipedia/**',
      },
    ],
  },
  experimental: {
    optimizeCss: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

// Conditionally use bundle analyzer if available
let finalConfig = nextConfig;
if (process.env.ANALYZE === 'true') {
  try {
    const withBundleAnalyzer = require('@next/bundle-analyzer');
    finalConfig = withBundleAnalyzer()(nextConfig);
  } catch (error) {
    console.warn('Bundle analyzer not available, continuing without it');
  }
}

export default finalConfig;

