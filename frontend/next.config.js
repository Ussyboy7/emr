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
  // Django API routes require trailing slashes; without this, Next strips them
  // (308) and Django adds them back (301), causing an infinite redirect loop on /api/*.
  skipTrailingSlashRedirect: true,
  // Emit a self-contained server bundle so the production Docker image can
  // drop full node_modules and run via `node server.js`.
  output: "standalone",
  transpilePackages: [],
  async redirects() {
    return [
      {
        source: "/nursing/patient-vitals",
        destination: "/nursing/vitals-history",
        permanent: true,
      },
      {
        source: "/medical-records/reports/monthly-mr-return",
        destination: "/medical-records/reports/comprehensive",
        permanent: true,
      },
    ];
  },
  /**
   * `/api/*` is proxied by `app/api/[[...path]]/route.ts` so trailing slashes
   * are preserved for Django. Rewrites strip them and cause redirect loops.
   */
  async rewrites() {
    return [];
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

