import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Security headers for SOC-2 compliance
const securityHeaders = {
  // HSTS - Force HTTPS
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  
  // Prevent clickjacking
  'X-Frame-Options': 'DENY',
  
  // XSS Protection
  'X-XSS-Protection': '1; mode=block',
  
  // Referrer Policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // Permissions Policy
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  
  // Content Security Policy
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://checkout.stripe.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.stripe.com https://*.supabase.co wss://*.supabase.co",
    "frame-src 'self' https://js.stripe.com https://checkout.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ].join('; '),
};

// Rate limiting configuration
const rateLimits = {
  '/api/auth/': { requests: 5, window: 60 }, // 5 requests per minute for auth
  '/api/scim/': { requests: 100, window: 60 }, // 100 requests per minute for SCIM
  '/api/stripe/': { requests: 50, window: 60 }, // 50 requests per minute for billing
  '/api/': { requests: 1000, window: 60 }, // 1000 requests per minute for general API
};

// In-memory rate limiting store (use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function isRateLimited(ip: string, endpoint: string): boolean {
  const now = Date.now();
  const key = `${ip}:${endpoint}`;
  
  // Find matching rate limit rule
  let rateLimit = rateLimits['/api/']; // Default
  for (const [pattern, limit] of Object.entries(rateLimits)) {
    if (endpoint.startsWith(pattern)) {
      rateLimit = limit;
      break;
    }
  }
  
  const windowMs = rateLimit.window * 1000;
  const current = rateLimitStore.get(key);
  
  if (!current || now > current.resetTime) {
    // New window
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return false;
  }
  
  if (current.count >= rateLimit.requests) {
    return true;
  }
  
  current.count++;
  return false;
}

// Security middleware
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();
  
  // Legacy redirect for auth callback
  if (pathname === '/SwiftConcur' && request.nextUrl.searchParams.has('code')) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/callback';
    return NextResponse.redirect(url);
  }
  
  // Get client IP
  const ip = request.ip ?? 
    request.headers.get('x-forwarded-for')?.split(',')[0] ?? 
    request.headers.get('x-real-ip') ?? 
    'unknown';
  
  // Apply security headers to all requests
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  // Add request ID for audit tracking
  const requestId = request.headers.get('cf-ray') ?? 
    request.headers.get('x-request-id') ?? 
    `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  response.headers.set('X-Request-ID', requestId);
  
  // API-specific security measures
  if (pathname.startsWith('/api/')) {
    // Rate limiting
    if (isRateLimited(ip, pathname)) {
      console.warn(`Rate limit exceeded for ${ip} on ${pathname}`);
      return new NextResponse(
        JSON.stringify({ 
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.'
        }),
        { 
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
            ...Object.fromEntries(Object.entries(securityHeaders)),
          }
        }
      );
    }
    
    // API security headers
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    
    // CORS for API endpoints
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Max-Age': '86400', // 24 hours
          ...Object.fromEntries(Object.entries(securityHeaders)),
        },
      });
    }
  }
  
  // SSO callback security
  if (pathname.startsWith('/api/auth/sso/callback')) {
    const state = request.nextUrl.searchParams.get('state');
    const code = request.nextUrl.searchParams.get('code');
    
    // Basic validation - detailed validation happens in the route handler
    if (!state && !code && !request.nextUrl.searchParams.get('mock')) {
      console.warn(`Invalid SSO callback from ${ip}: missing state and code`);
      return NextResponse.redirect(
        `${request.nextUrl.origin}/login?error=invalid_callback`
      );
    }
  }
  
  // SCIM endpoint security
  if (pathname.startsWith('/api/scim/')) {
    const authHeader = request.headers.get('Authorization');
    
    // Require Bearer token for SCIM endpoints
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new NextResponse(
        JSON.stringify({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '401',
          detail: 'Bearer token required for SCIM endpoints'
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/scim+json',
            'WWW-Authenticate': 'Bearer',
            ...Object.fromEntries(Object.entries(securityHeaders)),
          }
        }
      );
    }
    
    // Set SCIM-specific headers
    response.headers.set('Content-Type', 'application/scim+json');
  }
  
  // Webhook security
  if (pathname.startsWith('/api/stripe/webhook') || 
      pathname.startsWith('/api/github/marketplace/webhook')) {
    
    // Webhooks should only accept POST
    if (request.method !== 'POST') {
      return new NextResponse('Method not allowed', { status: 405 });
    }
    
    // Check for webhook signature headers
    const stripeSignature = request.headers.get('stripe-signature');
    const githubSignature = request.headers.get('x-hub-signature-256');
    
    if (pathname.includes('stripe') && !stripeSignature) {
      console.warn(`Stripe webhook without signature from ${ip}`);
      return new NextResponse('Missing signature', { status: 400 });
    }
    
    if (pathname.includes('github') && !githubSignature) {
      console.warn(`GitHub webhook without signature from ${ip}`);
      return new NextResponse('Missing signature', { status: 400 });
    }
  }
  
  // Dashboard authentication check (basic - detailed auth in pages)
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/billing') || 
      pathname.startsWith('/settings') || pathname.startsWith('/profile')) {
    
    // This is a basic check - actual authentication happens in the layout
    const hasSession = request.cookies.has('sb-access-token') || 
                      request.cookies.has('sso_session');
    
    if (!hasSession) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }
  
  // Prevent access to internal/admin routes
  if (pathname.startsWith('/_next/') || 
      pathname.startsWith('/admin/') ||
      pathname.includes('.env') ||
      pathname.includes('config')) {
    
    // Allow _next static files but block sensitive paths
    if (!pathname.startsWith('/_next/static/') && 
        !pathname.startsWith('/_next/image/')) {
      return new NextResponse('Not Found', { status: 404 });
    }
  }
  
  // Log security events for monitoring
  if (process.env.NODE_ENV === 'production') {
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const securityEvent = {
      timestamp: new Date().toISOString(),
      ip,
      userAgent,
      method: request.method,
      path: pathname,
      requestId,
    };
    
    // In production, send to monitoring service
    console.log('SECURITY_LOG', JSON.stringify(securityEvent));
  }
  
  return response;
}

// Configure which paths the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};