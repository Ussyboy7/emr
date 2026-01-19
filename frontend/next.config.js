/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [],
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

