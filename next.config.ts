import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  output: 'export', // Still needed for static export
  trailingSlash: true, // Ensures compatibility with S3/CloudFront
  basePath: '/community', // Sets the subdirectory path
  assetPrefix: '/community/',
};

export default nextConfig;