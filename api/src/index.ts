import { Router } from 'itty-router';
import { handleWarnings } from './handlers/warnings';
import { handleRun } from './handlers/runs';
import { handleTrend } from './handlers/trends';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { corsMiddleware, addCorsHeaders } from './middleware/cors';
import { processAISummary } from './services/openai';
import type { Env, RequestWithRepo } from './types';

// Export Durable Objects
export { RepoShard } from './durable-objects/RepoShard';

/**
 * Main router setup
 */
const router = Router<RequestWithRepo, [Env, ExecutionContext]>();

// Global middleware
router.all('*', corsMiddleware);

// Health check endpoint (no auth required)
router.get('/health', async (request, env, _ctx) => {
  try {
    // Basic health check with optional service status
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: env.ENVIRONMENT || 'unknown',
    };
    
    // Optional: Check external service health (non-blocking)
    if (request.url.includes('detailed=true')) {
      const checks = await Promise.allSettled([
        checkSupabaseHealth(env),
        checkOpenAIHealth(env),
        checkR2Health(env),
      ]);
      
      (health as any).services = {
        database: checks[0].status === 'fulfilled' ? checks[0].value : false,
        ai: checks[1].status === 'fulfilled' ? checks[1].value : false,
        storage: checks[2].status === 'fulfilled' ? checks[2].value : false,
      };
    }
    
    return new Response(JSON.stringify(health), {
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Health check error:', error);
    return new Response(JSON.stringify({
      status: 'unhealthy',
      error: 'Health check failed',
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Protected API routes (require authentication and rate limiting)
router.all('/v1/*', rateLimitMiddleware, authMiddleware);

// API endpoints
router.post('/v1/warnings', handleWarnings);
router.get('/v1/runs/:run_id', handleRun);
router.get('/v1/repos/:repo_id/trend', handleTrend);

// Catch-all 404 handler
router.all('*', () => new Response(JSON.stringify({
  success: false,
  error: 'Endpoint not found',
}), {
  status: 404,
  headers: { 'Content-Type': 'application/json' },
}));

/**
 * Main fetch handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const response = await router.handle(request, env, ctx);
      
      // Add CORS headers to response
      return addCorsHeaders(response, request, env);
      
    } catch (error) {
      console.error('Worker error:', error);
      
      const errorResponse = new Response(JSON.stringify({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString(),
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
      
      return addCorsHeaders(errorResponse, request, env);
    }
  },
  
  /**
   * Queue handler for async AI processing
   */
  async queue(
    batch: MessageBatch<any>,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    console.log(`Processing AI queue batch with ${batch.messages.length} messages`);
    
    for (const message of batch.messages) {
      try {
        console.log(`Processing AI summary for run ${message.body.run_id}`);
        
        await processAISummary(message.body, env);
        message.ack();
        
        console.log(`AI summary completed for run ${message.body.run_id}`);
        
      } catch (error) {
        console.error('AI processing error:', error);
        
        // Retry logic - retry up to 3 times
        const retryCount = message.attempts || 0;
        if (retryCount < 3) {
          console.log(`Retrying AI summary for run ${message.body.run_id} (attempt ${retryCount + 1})`);
          message.retry();
        } else {
          console.error(`Max retries exceeded for run ${message.body.run_id}, giving up`);
          message.ack(); // Acknowledge to prevent infinite retries
        }
      }
    }
  },
  
  /**
   * Scheduled handler for maintenance tasks
   */
  async scheduled(_event: ScheduledEvent, _env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log('Running scheduled maintenance tasks');
    
    try {
      // Cleanup tasks can be added here
      // For example: cleanup old rate limit entries, refresh materialized views, etc.
      
      console.log('Scheduled maintenance completed');
      
    } catch (error) {
      console.error('Scheduled task error:', error);
    }
  },
};

/**
 * Health check functions
 */
async function checkSupabaseHealth(env: Env): Promise<boolean> {
  try {
    const { createSupabaseService } = await import('./services/supabase');
    const supabase = createSupabaseService(env);
    return await supabase.healthCheck();
  } catch (error) {
    console.error('Supabase health check failed:', error);
    return false;
  }
}

async function checkOpenAIHealth(env: Env): Promise<boolean> {
  try {
    const { OpenAIService } = await import('./services/openai');
    const openai = new OpenAIService(env);
    return await openai.healthCheck();
  } catch (error) {
    console.error('OpenAI health check failed:', error);
    return false;
  }
}

async function checkR2Health(env: Env): Promise<boolean> {
  try {
    // Simple R2 health check - try to list objects
    await env.XCRESULT_BUCKET.list({ limit: 1 });
    return true;
  } catch (error) {
    console.error('R2 health check failed:', error);
    return false;
  }
}