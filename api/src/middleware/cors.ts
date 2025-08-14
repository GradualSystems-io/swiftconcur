import type { Env } from '../types';

/**
 * CORS middleware with security-focused configuration
 */
export async function corsMiddleware(
  request: Request,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response | void> {
  const origin = request.headers.get('Origin');
  const method = request.method;
  
  // Handle preflight OPTIONS requests
  if (method === 'OPTIONS') {
    return handlePreflightRequest(request, origin, env);
  }
  
  // For non-preflight requests, we'll add CORS headers in the response
  // This is handled by addCorsHeaders function
}

/**
 * Handle CORS preflight requests
 */
function handlePreflightRequest(request: Request, origin: string | null, env: Env): Response {
  const allowedOrigins = getAllowedOrigins(env);
  const requestedMethod = request.headers.get('Access-Control-Request-Method');
  const requestedHeaders = request.headers.get('Access-Control-Request-Headers');
  
  // Check if origin is allowed
  if (!origin || !isOriginAllowed(origin, allowedOrigins)) {
    return new Response(null, {
      status: 403,
      statusText: 'CORS: Origin not allowed',
    });
  }
  
  // Check if method is allowed
  const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
  if (!requestedMethod || !allowedMethods.includes(requestedMethod)) {
    return new Response(null, {
      status: 403,
      statusText: 'CORS: Method not allowed',
    });
  }
  
  // Build CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': allowedMethods.join(', '),
    'Access-Control-Allow-Headers': getAllowedHeaders(requestedHeaders),
    'Access-Control-Max-Age': '86400', // 24 hours
    'Access-Control-Allow-Credentials': 'false', // Explicitly disable credentials
    'Vary': 'Origin',
  };
  
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * Add CORS headers to response
 */
export function addCorsHeaders(response: Response, request: Request, env: Env): Response {
  const origin = request.headers.get('Origin');
  const allowedOrigins = getAllowedOrigins(env);
  
  if (!origin || !isOriginAllowed(origin, allowedOrigins)) {
    return response;
  }
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset',
    'Access-Control-Allow-Credentials': 'false',
    'Vary': 'Origin',
  };
  
  // Create new response with CORS headers
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      ...corsHeaders,
    },
  });
  
  return newResponse;
}

/**
 * Get allowed origins based on environment
 */
function getAllowedOrigins(env: Env): string[] {
  const baseOrigins = [
    'https://swiftconcur.dev',
    'https://app.swiftconcur.dev',
    'https://dashboard.swiftconcur.dev',
  ];
  
  if (env.ENVIRONMENT === 'development') {
    return [
      ...baseOrigins,
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
    ];
  }
  
  return baseOrigins;
}

/**
 * Check if origin is in allowed list
 */
function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  // Exact match check
  if (allowedOrigins.includes(origin)) {
    return true;
  }
  
  // Pattern matching for subdomain wildcards (if needed in future)
  // For now, we use exact matching for security
  return false;
}

/**
 * Get allowed headers, filtering potentially dangerous ones
 */
function getAllowedHeaders(requestedHeaders: string | null): string {
  const defaultHeaders = [
    'Accept',
    'Accept-Language',
    'Content-Language',
    'Content-Type',
    'Authorization',
    'X-Requested-With',
  ];
  
  if (!requestedHeaders) {
    return defaultHeaders.join(', ');
  }
  
  // Parse requested headers and filter
  const requested = requestedHeaders
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(h => h.length > 0);
  
  // Dangerous headers to block
  const blockedHeaders = [
    'cookie',
    'set-cookie',
    'x-forwarded-for',
    'x-real-ip', 
    'host',
    'connection',
    'upgrade',
  ];
  
  // Allow requested headers if they're not blocked
  const allowedRequested = requested.filter(h => 
    !blockedHeaders.includes(h) && 
    (defaultHeaders.includes(h) || h.startsWith('x-custom-'))
  );
  
  // Combine default and allowed requested headers
  const allAllowed = [...new Set([...defaultHeaders, ...allowedRequested])];
  
  return allAllowed.join(', ');
}