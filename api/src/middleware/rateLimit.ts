import type { Env, RequestWithRepo, RateLimitInfo } from '../types';
import { RepositoryService } from '../models/repository';
import { CryptoUtils } from '../utils/crypto';

/**
 * Rate limiting middleware with sliding window implementation
 */
export async function rateLimitMiddleware(
  request: RequestWithRepo,
  env: Env,
  ctx: ExecutionContext
): Promise<Response | void> {
  // Skip rate limiting for health checks
  const url = new URL(request.url);
  if (url.pathname === '/health') {
    return;
  }
  
  const repoId = request.repoId || 'anonymous';
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  
  try {
    // Get repository tier to determine limits
    const tier = await getRepositoryTier(env, repoId);
    const limits = RepositoryService.getPlanLimits(tier);
    
    // Create rate limit key combining repo and IP for additional security
    const rateLimitKey = CryptoUtils.generateRateLimitKey('rate_limit', `${repoId}:${clientIP}`);
    
    // Use sliding window rate limiting
    const windowStart = Math.floor(Date.now() / (60 * 60 * 1000)); // Hourly windows
    const currentWindowKey = `${rateLimitKey}:${windowStart}`;
    const previousWindowKey = `${rateLimitKey}:${windowStart - 1}`;
    
    // Get current and previous window counts
    const [currentCount, previousCount] = await Promise.all([
      env.RATE_LIMIT.get(currentWindowKey),
      env.RATE_LIMIT.get(previousWindowKey),
    ]);
    
    const current = parseInt(currentCount || '0');
    const previous = parseInt(previousCount || '0');
    
    // Calculate sliding window count
    const timeInCurrentWindow = (Date.now() % (60 * 60 * 1000)) / (60 * 60 * 1000);
    const slidingWindowCount = Math.floor(
      previous * (1 - timeInCurrentWindow) + current
    );
    
    const limit = limits.requestsPerHour;
    const remaining = Math.max(0, limit - slidingWindowCount - 1);
    
    // Check if limit exceeded
    if (slidingWindowCount >= limit) {
      const resetTime = new Date((windowStart + 1) * 60 * 60 * 1000);
      
      // Log rate limit violation for monitoring
      console.warn(`Rate limit exceeded for repo ${repoId} from IP ${clientIP}`);
      
      return new Response(JSON.stringify({
        success: false,
        error: 'Rate limit exceeded',
        details: {
          limit,
          remaining: 0,
          reset: resetTime.toISOString(),
          retryAfter: Math.ceil((resetTime.getTime() - Date.now()) / 1000),
        },
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetTime.toISOString(),
          'Retry-After': Math.ceil((resetTime.getTime() - Date.now()) / 1000).toString(),
        },
      });
    }
    
    // Increment counter (non-blocking)
    ctx.waitUntil(
      env.RATE_LIMIT.put(currentWindowKey, (current + 1).toString(), {
        expirationTtl: 2 * 60 * 60, // 2 hours to account for sliding window
      })
    );
    
    // Add rate limit headers to request for downstream handlers
    const rateLimitInfo: RateLimitInfo = {
      limit,
      remaining,
      reset: new Date((windowStart + 1) * 60 * 60 * 1000).toISOString(),
    };
    
    request.headers.set('X-RateLimit-Info', JSON.stringify(rateLimitInfo));
    
  } catch (error) {
    console.error('Rate limiting error:', error);
    
    // Fail open - allow request to proceed but log the error
    console.warn('Rate limiting failed, allowing request to proceed');
  }
}

/**
 * Get repository tier from cache or database
 */
async function getRepositoryTier(env: Env, repoId: string) {
  if (repoId === 'anonymous') {
    return 'free';
  }
  
  try {
    // Try to get from cache first
    const cacheKey = `repo_tier:${repoId}`;
    const cachedTier = await env.RATE_LIMIT.get(cacheKey);
    
    if (cachedTier) {
      return cachedTier as 'free' | 'pro' | 'enterprise';
    }
    
    // If not in cache, we'll default to free tier
    // In a real implementation, this would query Supabase
    const defaultTier = 'free';
    
    // Cache the result for 1 hour
    await env.RATE_LIMIT.put(cacheKey, defaultTier, {
      expirationTtl: 60 * 60,
    });
    
    return defaultTier;
    
  } catch (error) {
    console.error('Error getting repository tier:', error);
    return 'free'; // Default to free tier on error
  }
}

/**
 * Check if request should be subject to stricter rate limiting
 */
export function shouldApplyStrictLimits(request: Request): boolean {
  const userAgent = request.headers.get('User-Agent') || '';
  const contentLength = request.headers.get('Content-Length');
  
  // Apply stricter limits for:
  // 1. Requests without proper User-Agent
  // 2. Very large requests
  // 3. Suspicious patterns
  
  if (!userAgent || userAgent.length < 10) {
    return true;
  }
  
  if (contentLength && parseInt(contentLength) > 100 * 1024) { // > 100KB
    return true;
  }
  
  // Check for bot-like user agents
  const botPatterns = ['bot', 'crawler', 'spider', 'scraper'];
  if (botPatterns.some(pattern => userAgent.toLowerCase().includes(pattern))) {
    return true;
  }
  
  return false;
}

/**
 * Get current rate limit status for a repository
 */
export async function getRateLimitStatus(
  env: Env,
  repoId: string,
  clientIP: string
): Promise<RateLimitInfo> {
  const tier = await getRepositoryTier(env, repoId);
  const limits = RepositoryService.getPlanLimits(tier);
  const rateLimitKey = CryptoUtils.generateRateLimitKey('rate_limit', `${repoId}:${clientIP}`);
  
  const windowStart = Math.floor(Date.now() / (60 * 60 * 1000));
  const currentWindowKey = `${rateLimitKey}:${windowStart}`;
  const previousWindowKey = `${rateLimitKey}:${windowStart - 1}`;
  
  const [currentCount, previousCount] = await Promise.all([
    env.RATE_LIMIT.get(currentWindowKey),
    env.RATE_LIMIT.get(previousWindowKey),
  ]);
  
  const current = parseInt(currentCount || '0');
  const previous = parseInt(previousCount || '0');
  
  const timeInCurrentWindow = (Date.now() % (60 * 60 * 1000)) / (60 * 60 * 1000);
  const slidingWindowCount = Math.floor(
    previous * (1 - timeInCurrentWindow) + current
  );
  
  return {
    limit: limits.requestsPerHour,
    remaining: Math.max(0, limits.requestsPerHour - slidingWindowCount),
    reset: new Date((windowStart + 1) * 60 * 60 * 1000).toISOString(),
  };
}