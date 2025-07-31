# Phase 3: Cloudflare Workers API - Enhanced Implementation Guide

## Overview
Build a serverless API using Cloudflare Workers to process GitHub Action results, store data in Supabase, generate AI summaries, and send notifications. This implementation focuses on low-latency responses and efficient data handling.

## Architecture

```
GitHub Action ─┐        ┌─► Supabase Postgres  ──► Metabase
              │        │                        (internal BI)
              ▼        │
   Cloudflare R2 (raw xcresult as object-store)
              │        │
              ▼        │
   Cloudflare Worker  ─┤  (Durable Object shard key = repo_id)
              │        ├─► OpenAI API (async via Queues)
              ▼        │
        Webhook Fan-out ➡ Slack / MS Teams / e-mail
```

## HTTP Contract

| Verb | Path | Auth | Body | 2xx Response |
|------|------|------|------|--------------|
| POST | /v1/warnings | Authorization: Bearer <repo-token> | multipart-form with fields: repo_id, run_id, warnings.json (≤ 50 KB) | { "status":"queued", "id":"<uuid>" } |
| GET | /v1/runs/{run_id} | same | – | full run JSON incl. AI summary |
| GET | /v1/repos/{repo_id}/trend | same | – | aggregate counts (7,30,90 d) |

## Project Structure
```
api/
├── src/
│   ├── index.ts              # Main worker entry point
│   ├── handlers/
│   │   ├── webhook.ts        # GitHub webhook handler
│   │   ├── warnings.ts       # Warning ingestion handler
│   │   ├── runs.ts          # Run retrieval handler
│   │   └── trends.ts        # Trend aggregation handler
│   ├── services/
│   │   ├── supabase.ts      # Supabase client & queries
│   │   ├── openai.ts        # OpenAI integration
│   │   ├── r2.ts            # R2 storage operations
│   │   └── notifications/
│   │       ├── slack.ts     # Slack notifications
│   │       ├── teams.ts     # Teams notifications
│   │       └── email.ts     # Email notifications
│   ├── models/
│   │   ├── warning.ts       # Warning data models
│   │   ├── repository.ts    # Repository models
│   │   └── notification.ts  # Notification models
│   ├── middleware/
│   │   ├── auth.ts          # Bearer token validation
│   │   ├── rateLimit.ts     # Rate limiting with KV
│   │   └── cors.ts          # CORS handling
│   ├── durable-objects/
│   │   └── RepoShard.ts     # Per-repo state management
│   └── utils/
│       ├── crypto.ts        # Token generation/validation
│       └── formatter.ts     # Message formatting
├── wrangler.toml            # Cloudflare Worker config
├── package.json
├── tsconfig.json
└── tests/
    └── worker.test.ts
```

## Database Schema (Supabase)

```sql
CREATE TABLE repos(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  tier text DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise'))
);

CREATE TABLE runs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid REFERENCES repos(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  warnings_count int NOT NULL DEFAULT 0,
  ai_summary text,
  r2_object_key text -- Reference to full data in R2
);

CREATE TABLE warnings(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES runs(id) NOT NULL,
  file_path text NOT NULL,
  line int NOT NULL,
  column int,
  type text NOT NULL,
  severity text NOT NULL,
  message text NOT NULL,
  code_context jsonb,
  suggested_fix text
);

-- Indexes for performance
CREATE INDEX idx_warnings_run_id ON warnings(run_id);
CREATE INDEX idx_runs_repo_created ON runs(repo_id, created_at DESC);

-- Materialized view for trend queries
CREATE MATERIALIZED VIEW repo_warning_daily AS
SELECT 
  repo_id,
  DATE(created_at) as date,
  COUNT(DISTINCT run_id) as run_count,
  SUM(warnings_count) as total_warnings,
  AVG(warnings_count) as avg_warnings
FROM runs
GROUP BY repo_id, DATE(created_at);

CREATE INDEX idx_repo_warning_daily ON repo_warning_daily(repo_id, date);
```

## Implementation Steps

### 1. Initialize Cloudflare Worker Project
```bash
npm create cloudflare@latest api
# Choose "Hello World" Worker
# TypeScript: Yes
# Git: Yes
# Deploy: No

cd api
npm install @supabase/supabase-js openai zod itty-router
npm install -D @cloudflare/workers-types vitest
```

### 2. Configure wrangler.toml
```toml
name = "swiftconcur-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# R2 bucket for storing raw xcresult files
[[r2_buckets]]
binding = "XCRESULT_BUCKET"
bucket_name = "swiftconcur-xcresults"

# KV namespaces
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "your-rate-limit-kv-id"

[[kv_namespaces]]
binding = "API_TOKENS"
id = "your-api-tokens-kv-id"

# Durable Objects
[[durable_objects.bindings]]
name = "REPO_SHARD"
class_name = "RepoShard"

[[migrations]]
tag = "v1"
new_classes = ["RepoShard"]

# Queues for async processing
[[queues.producers]]
binding = "AI_QUEUE"
queue = "ai-processing"

[[queues.consumers]]
queue = "ai-processing"
max_batch_size = 10
max_batch_timeout = 30

# Environment-specific settings
[env.production]
vars = { ENVIRONMENT = "production" }

[env.development]
vars = { ENVIRONMENT = "development" }

# Secrets (set via wrangler secret put)
# SUPABASE_URL
# SUPABASE_SERVICE_KEY
# OPENAI_API_KEY
# SLACK_WEBHOOK_URL
# TEAMS_WEBHOOK_URL
```

### 3. Main Worker Entry Point (src/index.ts)
```typescript
import { Router } from 'itty-router';
import { handleWarnings } from './handlers/warnings';
import { handleRun } from './handlers/runs';
import { handleTrend } from './handlers/trends';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { corsMiddleware } from './middleware/cors';
import { Env } from './types';

export { RepoShard } from './durable-objects/RepoShard';

const router = Router();

// Middleware
router.all('*', corsMiddleware);
router.all('/v1/*', rateLimitMiddleware, authMiddleware);

// Routes
router.post('/v1/warnings', handleWarnings);
router.get('/v1/runs/:run_id', handleRun);
router.get('/v1/repos/:repo_id/trend', handleTrend);

// Health check
router.get('/health', () => new Response('OK', { status: 200 }));

// 404 handler
router.all('*', () => new Response('Not Found', { status: 404 }));

// Queue handler for async AI processing
export async function queue(
  batch: MessageBatch<any>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await processAISummary(message.body, env);
      message.ack();
    } catch (error) {
      console.error('AI processing error:', error);
      message.retry();
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return router.handle(request, env, ctx)
      .catch(err => {
        console.error('Worker error:', err);
        return new Response('Internal Server Error', { status: 500 });
      });
  },
  queue,
};
```

### 4. Warning Ingestion Handler (src/handlers/warnings.ts)
```typescript
import { z } from 'zod';
import { Env } from '../types';
import { uploadToR2 } from '../services/r2';
import { storeWarnings } from '../services/supabase';

const MAX_JSON_SIZE = 50 * 1024; // 50 KB

const WarningSchema = z.object({
  repo_id: z.string().uuid(),
  run_id: z.string().uuid(),
  warnings: z.array(z.object({
    type: z.enum(['actor_isolation', 'sendable', 'data_race', 'performance']),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    file_path: z.string(),
    line_number: z.number(),
    column_number: z.number().optional(),
    message: z.string(),
    code_context: z.object({
      before: z.array(z.string()),
      line: z.string(),
      after: z.array(z.string()),
    }),
    suggested_fix: z.string().optional(),
  })),
  metadata: z.object({
    commit_sha: z.string(),
    branch: z.string(),
    pull_request: z.number().optional(),
    scheme: z.string(),
    configuration: z.string(),
    swift_version: z.string(),
    timestamp: z.string(),
  }),
});

export async function handleWarnings(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    // Parse multipart form data
    const formData = await request.formData();
    const warningsJson = formData.get('warnings.json') as File;
    
    if (!warningsJson) {
      return new Response('Missing warnings.json', { status: 400 });
    }
    
    // Check file size
    if (warningsJson.size > MAX_JSON_SIZE) {
      return new Response('File too large', { status: 413 });
    }
    
    // Parse and validate
    const data = JSON.parse(await warningsJson.text());
    const validated = WarningSchema.parse(data);
    
    // Store raw data in R2 for archival
    const r2Key = `${validated.repo_id}/${validated.run_id}/warnings.json`;
    await uploadToR2(env.XCRESULT_BUCKET, r2Key, warningsJson);
    
    // Store structured data in Supabase
    await storeWarnings(env, validated, r2Key);
    
    // Queue AI summary generation (non-blocking)
    ctx.waitUntil(
      env.AI_QUEUE.send({
        repo_id: validated.repo_id,
        run_id: validated.run_id,
        warnings: validated.warnings,
      })
    );
    
    // Get repo shard for real-time updates
    const repoShardId = env.REPO_SHARD.idFromName(validated.repo_id);
    const repoShard = env.REPO_SHARD.get(repoShardId);
    
    // Notify connected clients via Durable Object
    ctx.waitUntil(
      repoShard.fetch(new Request('https://internal/notify', {
        method: 'POST',
        body: JSON.stringify({ run_id: validated.run_id }),
      }))
    );
    
    return new Response(JSON.stringify({
      status: 'queued',
      id: validated.run_id,
    }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Warning ingestion error:', error);
    
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({
        error: 'Invalid payload',
        details: error.errors,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response('Internal Server Error', { status: 500 });
  }
}
```

### 5. Durable Object for Per-Repo State (src/durable-objects/RepoShard.ts)
```typescript
export class RepoShard implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private connections: Set<WebSocket> = new Set();
  
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }
  
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    switch (url.pathname) {
      case '/websocket':
        return this.handleWebSocket(request);
      case '/notify':
        return this.handleNotify(request);
      default:
        return new Response('Not Found', { status: 404 });
    }
  }
  
  async handleWebSocket(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    
    this.state.acceptWebSocket(server);
    this.connections.add(server);
    
    server.addEventListener('close', () => {
      this.connections.delete(server);
    });
    
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
  
  async handleNotify(request: Request): Response {
    const data = await request.json();
    
    // Broadcast to all connected clients
    for (const ws of this.connections) {
      ws.send(JSON.stringify({
        type: 'new_run',
        ...data,
      }));
    }
    
    return new Response('OK');
  }
}
```

### 6. AI Summary Processing (src/services/openai.ts)
```typescript
import OpenAI from 'openai';
import { Env } from '../types';

export async function generateSummary(
  env: Env,
  data: {
    repo_id: string;
    run_id: string;
    warnings: Array<any>;
  }
): Promise<string> {
  const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });
  
  // Group warnings by type and severity
  const warningsByType = data.warnings.reduce((acc, warning) => {
    if (!acc[warning.type]) acc[warning.type] = [];
    acc[warning.type].push(warning);
    return acc;
  }, {} as Record<string, typeof data.warnings>);
  
  const criticalCount = data.warnings.filter(w => w.severity === 'critical').length;
  const highCount = data.warnings.filter(w => w.severity === 'high').length;
  
  const prompt = `
Analyze these Swift concurrency warnings and provide a concise summary for developers:

Total Warnings: ${data.warnings.length}
Critical: ${criticalCount}
High: ${highCount}

Warning Breakdown:
${Object.entries(warningsByType).map(([type, warnings]) => 
  `- ${type}: ${warnings.length} warnings`
).join('\n')}

Top 3 Most Critical Issues:
${data.warnings
  .filter(w => w.severity === 'critical' || w.severity === 'high')
  .slice(0, 3)
  .map(w => `- ${w.file_path}:${w.line_number} - ${w.message}`)
  .join('\n')}

Provide:
1. A one-sentence executive summary
2. Key patterns observed
3. Top 3 actionable recommendations
4. Risk assessment (Low/Medium/High)

Keep the response under 200 words and developer-focused.
`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a Swift concurrency expert helping developers fix threading issues. Be concise and actionable.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
    max_tokens: 400,
  });
  
  return completion.choices[0].message.content || 'Summary generation failed';
}
```

### 7. Trend Aggregation Handler (src/handlers/trends.ts)
```typescript
export async function handleTrend(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const repoId = url.pathname.split('/')[3];
  const days = parseInt(url.searchParams.get('days') || '30');
  
  if (![7, 30, 90].includes(days)) {
    return new Response('Invalid days parameter', { status: 400 });
  }
  
  const supabase = createClient(env);
  
  // Use materialized view for performance
  const { data, error } = await supabase
    .from('repo_warning_daily')
    .select('*')
    .eq('repo_id', repoId)
    .gte('date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
    .order('date', { ascending: true });
  
  if (error) {
    return new Response('Database error', { status: 500 });
  }
  
  // Calculate trend metrics
  const trend = calculateTrend(data);
  
  return new Response(JSON.stringify({
    repo_id: repoId,
    period_days: days,
    data_points: data,
    summary: {
      total_runs: trend.totalRuns,
      total_warnings: trend.totalWarnings,
      avg_warnings_per_run: trend.avgWarnings,
      trend_direction: trend.direction, // 'improving', 'worsening', 'stable'
      change_percentage: trend.changePercentage,
    },
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### 8. Authentication Middleware (src/middleware/auth.ts)
```typescript
export async function authMiddleware(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response | void> {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const token = authHeader.substring(7);
  
  // Check token in KV store
  const repoId = await env.API_TOKENS.get(token);
  
  if (!repoId) {
    return new Response('Invalid token', { status: 401 });
  }
  
  // Add repo_id to request for downstream handlers
  request.headers.set('X-Repo-Id', repoId);
}
```

### 9. Rate Limiting (src/middleware/rateLimit.ts)
```typescript
export async function rateLimitMiddleware(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response | void> {
  const repoId = request.headers.get('X-Repo-Id') || 'anonymous';
  const key = `rate_limit:${repoId}`;
  
  // Get current count
  const current = await env.RATE_LIMIT.get(key);
  const count = current ? parseInt(current) : 0;
  
  // Check limit based on plan
  const limit = await getPlanLimit(env, repoId);
  
  if (count >= limit) {
    return new Response('Rate limit exceeded', { 
      status: 429,
      headers: {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(Date.now() + 3600000).toISOString(),
        'Retry-After': '3600',
      },
    });
  }
  
  // Increment counter
  ctx.waitUntil(
    env.RATE_LIMIT.put(key, (count + 1).toString(), {
      expirationTtl: 3600, // 1 hour
    })
  );
}

async function getPlanLimit(env: Env, repoId: string): Promise<number> {
  const supabase = createClient(env);
  const { data } = await supabase
    .from('repos')
    .select('tier')
    .eq('id', repoId)
    .single();
  
  const limits = {
    free: 100,
    pro: 1000,
    enterprise: 10000,
  };
  
  return limits[data?.tier || 'free'];
}
```

### 10. Notification Services

#### Slack Integration (src/services/notifications/slack.ts)
```typescript
export async function sendSlackNotification(
  env: Env,
  data: {
    repo_name: string;
    run_id: string;
    warnings_count: number;
    critical_count: number;
    summary: string;
    webhook_url: string;
  }
): Promise<void> {
  const color = data.critical_count > 0 ? 'danger' : 
                data.warnings_count > 0 ? 'warning' : 'good';
  
  const payload = {
    attachments: [{
      color,
      title: `SwiftConcur CI Results - ${data.repo_name}`,
      title_link: `https://swiftconcur.dev/repo/${data.run_id}`,
      fields: [
        {
          title: 'Total Warnings',
          value: data.warnings_count.toString(),
          short: true,
        },
        {
          title: 'Critical Issues',
          value: data.critical_count.toString(),
          short: true,
        },
      ],
      text: data.summary,
      footer: 'SwiftConcur CI',
      ts: Math.floor(Date.now() / 1000),
    }],
  };
  
  const response = await fetch(data.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) {
    throw new Error(`Slack notification failed: ${response.status}`);
  }
}
```

## Pay-wall Implementation

### Free Tier Limitations
```typescript
async function enforceFreeTierLimits(env: Env, repoId: string, runId: string) {
  const supabase = createClient(env);
  
  // Check if repo is on free tier
  const { data: repo } = await supabase
    .from('repos')
    .select('tier')
    .eq('id', repoId)
    .single();
  
  if (repo?.tier === 'free') {
    // Limit: Only store last 30 runs
    const { data: runs } = await supabase
      .from('runs')
      .select('id')
      .eq('repo_id', repoId)
      .order('created_at', { ascending: false })
      .range(30, 1000); // Get runs beyond the 30th
    
    if (runs && runs.length > 0) {
      // Delete old runs
      await supabase
        .from('runs')
        .delete()
        .in('id', runs.map(r => r.id));
    }
    
    // No AI summaries for free tier
    return { allowAISummary: false };
  }
  
  return { allowAISummary: true };
}
```

## Deployment

### 1. Create KV Namespaces
```bash
wrangler kv:namespace create "RATE_LIMIT"
wrangler kv:namespace create "API_TOKENS"
```

### 2. Create R2 Bucket
```bash
wrangler r2 bucket create swiftconcur-xcresults
```

### 3. Set Secrets
```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put OPENAI_API_KEY
wrangler secret put SLACK_WEBHOOK_URL
wrangler secret put TEAMS_WEBHOOK_URL
```

### 4. Deploy
```bash
# Development
wrangler dev

# Production
wrangler deploy
```

## Testing

```typescript
// tests/worker.test.ts
import { describe, it, expect } from 'vitest';
import { unstable_dev } from 'wrangler';

describe('SwiftConcur API', () => {
  let worker: Awaited<ReturnType<typeof unstable_dev>>;
  
  beforeAll(async () => {
    worker = await unstable_dev('src/index.ts', {
      experimental: { disableExperimentalWarning: true },
    });
  });
  
  it('should handle warning ingestion', async () => {
    const formData = new FormData();
    formData.append('warnings.json', new Blob([JSON.stringify({
      repo_id: 'test-repo-id',
      run_id: 'test-run-id',
      warnings: [],
      metadata: {
        commit_sha: 'abc123',
        branch: 'main',
        scheme: 'MyApp',
        configuration: 'Debug',
        swift_version: '5.9',
        timestamp: new Date().toISOString(),
      },
    })], { type: 'application/json' }));
    
    const response = await worker.fetch('/v1/warnings', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test-token',
      },
      body: formData,
    });
    
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toHaveProperty('status', 'queued');
  });
});
```

## Performance Optimizations

1. **Stream uploads to R2**: Handle large xcresult files without memory issues
2. **Durable Objects**: Shard by repo_id for horizontal scaling
3. **Materialized views**: Pre-aggregate trend data
4. **Queue processing**: Async AI summaries to avoid 30s Worker limit
5. **KV caching**: Cache frequently accessed data like plan limits

## Security Considerations

1. **Bearer token auth**: Each repo gets unique token
2. **Rate limiting**: Per-repo limits based on plan
3. **Input validation**: Strict Zod schemas
4. **File size limits**: Prevent DoS via large uploads
5. **CORS**: Restrict to known origins

## Next Steps

After completing the API, proceed to Phase 4 (Dashboard) to build the UI for visualizing warning trends and managing integrations.