/** @type {import('next').NextConfig} */
const nextConfig = {
  // Base path for hosting on gradualsystems.io/SwiftConcur
  basePath: '/SwiftConcur',
  
  // Enable trailing slashes for better SEO
  trailingSlash: true,
  
  // TypeScript and ESLint config for deployment
  typescript: {
    // Ignore build errors on production (temporary)
    ignoreBuildErrors: process.env.NODE_ENV === 'production',
  },
  eslint: {
    // Ignore ESLint errors during builds (temporary)
    ignoreDuringBuilds: true,
  },
  
  // Environment variables validation
  env: {
    CUSTOM_NODE_ENV: process.env.NODE_ENV,
  },
  
  // Image optimization
  images: {
    domains: ['avatars.githubusercontent.com'],
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  
  // Security headers for production
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
};

module.exports = nextConfig;