import type { Env, RequestWithRepo } from '../types';
import { CryptoUtils } from '../utils/crypto';

/**
 * Authentication middleware with security best practices
 */
export async function authMiddleware(
  request: RequestWithRepo,
  env: Env,
  ctx: ExecutionContext
): Promise<Response | void> {
  // Skip auth for health check and CORS preflight
  const url = new URL(request.url);
  if (url.pathname === '/health' || request.method === 'OPTIONS') {
    return;
  }
  
  // Extract Authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Missing Authorization header',
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  // Validate Bearer token format
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Invalid Authorization header format. Expected: Bearer <token>',
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const token = authHeader.substring(7);
  
  // Basic token format validation
  if (!CryptoUtils.validateTokenFormat(token)) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Invalid token format',
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  try {
    // Look up token in KV store with timeout
    const lookupPromise = env.API_TOKENS.get(token);
    const timeoutPromise = new Promise<null>((_, reject) => 
      setTimeout(() => reject(new Error('Token lookup timeout')), 5000)
    );
    
    const repoId = await Promise.race([lookupPromise, timeoutPromise]);
    
    if (!repoId) {
      // Log potential security issue (but don't expose details)
      console.warn(`Invalid token attempt: ${token.substring(0, 10)}...`);
      
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid or expired token',
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Validate repo ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(repoId)) {
      console.error(`Invalid repo ID format in token: ${repoId}`);
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid token data',
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Add repo ID to request for downstream handlers
    request.repoId = repoId;
    
    // Security headers for authenticated requests
    const securityHeaders = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    };
    
    // Add security headers to request for downstream handlers
    Object.entries(securityHeaders).forEach(([key, value]) => {
      request.headers.set(`X-Security-${key}`, value);
    });
    
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Authentication service unavailable',
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Generate a new API token for a repository
 */
export async function generateApiToken(env: Env, repoId: string): Promise<string> {
  const token = await CryptoUtils.generateRepoToken(repoId);
  
  // Store token in KV with expiration (1 year)
  await env.API_TOKENS.put(token, repoId, {
    expirationTtl: 365 * 24 * 60 * 60, // 1 year in seconds
  });
  
  return token;
}

/**
 * Revoke an API token
 */
export async function revokeApiToken(env: Env, token: string): Promise<boolean> {
  try {
    await env.API_TOKENS.delete(token);
    return true;
  } catch (error) {
    console.error('Error revoking token:', error);
    return false;
  }
}