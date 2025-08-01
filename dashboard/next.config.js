/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
  // Environment variables validation
  env: {
    CUSTOM_NODE_ENV: process.env.NODE_ENV,
  },
  // Only allow specific domains for images
  images: {
    domains: ['avatars.githubusercontent.com'],
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // Output for Cloudflare Pages
  output: 'export',
  distDir: 'out',
  trailingSlash: true,
  // Disable server-side features for static export
  experimental: {
    // esmExternals: false, // THIS IS THE DEFAULT
  },
};

module.exports = nextConfig;