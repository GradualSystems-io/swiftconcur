# Phase 3: Cloudflare Workers API - Detailed Implementation Guide

## Overview
Build a serverless API using Cloudflare Workers to process GitHub Action results, store data in Supabase, generate AI summaries, and send notifications.

## Architecture

```
GitHub Action → Webhook → Cloudflare Worker
                             ↓
                         Supabase DB
                             ↓
                      OpenAI Summary
                             ↓
                    Slack/Teams/Email
```

## Project Structure
```
api/
├── src/
│   ├── index.ts              # Main worker entry point
│   ├── handlers/
│   │   ├── webhook.ts        # GitHub webhook handler
│   │   ├── summary.ts        # AI summarization handler
│   │   └── notifications.ts  # Notification dispatcher
│   ├── services/
│   │   ├── supabase.ts      # Supabase client & queries
│   │   ├── openai.ts        # OpenAI integration
│   │   ├── slack.ts         # Slack notifications
│   │   └── teams.ts         # Teams notifications
│   ├── models/
│   │   ├── warning.ts       # Warning data models
│   │   ├── repository.ts    # Repository models
│   │   └── notification.ts  # Notification models
│   ├── middleware/
│   │   ├── auth.ts          # Authentication
│   │   ├── rateLimit.ts     # Rate limiting
│   │   └── cors.ts          # CORS handling
│   └── utils/
│       ├── crypto.ts        # Webhook signature verification
│       └── formatter.ts     # Message formatting
├── wrangler.toml            # Cloudflare Worker config
├── package.json
├── tsconfig.json
└── tests/
    └── worker.test.ts
```

## Implementation Steps

### 1. Initialize Cloudflare Worker Project
```bash
npm create cloudflare@latest api
# Choose "Hello World" Worker
# TypeScript: Yes
# Git: Yes
# Deploy: No
```

### 2. Update wrangler.toml
```toml
name = "swiftconcur-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[env.production]
vars = { ENVIRONMENT = "production" }

[env.development]
vars = { ENVIRONMENT = "development" }

# KV namespaces for rate limiting
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "your-kv-namespace-id"

# Secrets (set via wrangler secret put)
# SUPABASE_URL
# SUPABASE_SERVICE_KEY
# OPENAI_API_KEY
# SLACK_WEBHOOK_URL
# TEAMS_WEBHOOK_URL
# WEBHOOK_SECRET
```

### 3. Core Dependencies (package.json)
```json
{
  "name": "swiftconcur-api",
  "version": "1.0.0",
  "devDependencies": {
    "@cloudflare/workers-types": "^4.0.0",
    "wrangler": "^3.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "openai": "^4.0.0",
    "zod": "^3.22.0"
  }
}
```

### 4. Environment Types (src/types.ts)
```typescript
export interface Env {
  // KV Namespaces
  RATE_LIMIT: KVNamespace;
  
  // Secrets
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  OPENAI_API_KEY: string;
  SLACK_WEBHOOK_URL: string;
  TEAMS_WEBHOOK_URL: string;
  WEBHOOK_SECRET: string;
  
  // Variables
  ENVIRONMENT: 'development' | 'production';
}

export interface WebhookPayload {
  action: 'completed';
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
      id: number;
    };
  };
  commit_sha: string;
  branch: string;
  pull_request?: number;
  warnings: Warning[];
  metadata: {
    scheme: string;
    configuration: string;
    swift_version: string;
    timestamp: string;
  };
}

export interface Warning {
  id: string;
  type: 'actor_isolation' | 'sendable' | 'data_race' | 'performance';
  severity: 'critical' | 'high' | 'medium' | 'low';
  file_path: string;
  line_number: number;
  column_number?: number;
  message: string;
  code_context: {
    before: string[];
    line: string;
    after: string[];
  };
  suggested_fix?: string;
}
```

### 5. Main Worker Entry Point (src/index.ts)
```typescript
import { Router } from 'itty-router';
import { webhookHandler } from './handlers/webhook';
import { summaryHandler } from './handlers/summary';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { corsMiddleware } from './middleware/cors';
import { Env } from './types';

const router = Router();

// Middleware
router.all('*', corsMiddleware);
router.all('/api/*', rateLimitMiddleware);

// Routes
router.post('/api/webhook', authMiddleware, webhookHandler);
router.get('/api/summary/:repo_id/:run_id', summaryHandler);

// Health check
router.get('/health', () => new Response('OK', { status: 200 }));

// 404 handler
router.all('*', () => new Response('Not Found', { status: 404 }));

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return router.handle(request, env, ctx)
      .catch(err => {
        console.error('Worker error:', err);
        return new Response('Internal Server Error', { status: 500 });
      });
  },
};
```

### 6. Webhook Handler (src/handlers/webhook.ts)
```typescript
import { z } from 'zod';
import { Env, WebhookPayload } from '../types';
import { verifyWebhookSignature } from '../utils/crypto';
import { storeWarnings } from '../services/supabase';
import { generateSummary } from '../services/openai';
import { sendNotifications } from '../handlers/notifications';

const WebhookSchema = z.object({
  action: z.literal('completed'),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
    owner: z.object({
      login: z.string(),
      id: z.number(),
    }),
  }),
  commit_sha: z.string(),
  branch: z.string(),
  pull_request: z.number().optional(),
  warnings: z.array(z.object({
    // Warning schema
  })),
  metadata: z.object({
    scheme: z.string(),
    configuration: z.string(),
    swift_version: z.string(),
    timestamp: z.string(),
  }),
});

export async function webhookHandler(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    // Verify webhook signature
    const body = await request.text();
    const signature = request.headers.get('X-Hub-Signature-256');
    
    if (!signature || !await verifyWebhookSignature(body, signature, env.WEBHOOK_SECRET)) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Parse and validate payload
    const payload = WebhookSchema.parse(JSON.parse(body));
    
    // Store in database
    const runId = await storeWarnings(env, payload);
    
    // Generate AI summary (async - don't block response)
    ctx.waitUntil(
      generateAndNotify(env, payload, runId)
    );
    
    return new Response(JSON.stringify({ 
      success: true, 
      run_id: runId 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Webhook error:', error);
    
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ 
        error: 'Invalid payload', 
        details: error.errors 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Internal Server Error', { status: 500 });
  }
}

async function generateAndNotify(
  env: Env, 
  payload: WebhookPayload, 
  runId: string
): Promise<void> {
  try {
    // Generate AI summary
    const summary = await generateSummary(env, payload);
    
    // Send notifications
    await sendNotifications(env, {
      ...payload,
      run_id: runId,
      summary
    });
  } catch (error) {
    console.error('Background processing error:', error);
  }
}
```

### 7. Supabase Integration (src/services/supabase.ts)
```typescript
import { createClient } from '@supabase/supabase-js';
import { Env, WebhookPayload } from '../types';

export async function storeWarnings(
  env: Env,
  payload: WebhookPayload
): Promise<string> {
  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_KEY
  );
  
  // Check if repository exists
  let { data: repo } = await supabase
    .from('repositories')
    .select('id')
    .eq('github_id', payload.repository.id)
    .single();
  
  // Create repository if it doesn't exist
  if (!repo) {
    const { data: org } = await supabase
      .from('organizations')
      .upsert({
        github_id: payload.repository.owner.id,
        name: payload.repository.owner.login
      })
      .select('id')
      .single();
    
    const { data: newRepo } = await supabase
      .from('repositories')
      .insert({
        github_id: payload.repository.id,
        org_id: org.id,
        name: payload.repository.name,
        full_name: payload.repository.full_name
      })
      .select('id')
      .single();
    
    repo = newRepo;
  }
  
  // Create warning run
  const { data: run } = await supabase
    .from('warning_runs')
    .insert({
      repo_id: repo.id,
      commit_sha: payload.commit_sha,
      branch: payload.branch,
      pull_request: payload.pull_request,
      total_warnings: payload.warnings.length,
      metadata: payload.metadata
    })
    .select('id')
    .single();
  
  // Insert warnings
  if (payload.warnings.length > 0) {
    await supabase
      .from('warnings')
      .insert(
        payload.warnings.map(warning => ({
          run_id: run.id,
          type: warning.type,
          severity: warning.severity,
          file_path: warning.file_path,
          line_number: warning.line_number,
          column_number: warning.column_number,
          message: warning.message,
          code_context: warning.code_context,
          suggested_fix: warning.suggested_fix
        }))
      );
  }
  
  return run.id;
}

export async function getRunComparison(
  env: Env,
  repoId: string,
  branch: string,
  currentRunId: string
): Promise<{
  new_warnings: Warning[];
  fixed_warnings: Warning[];
  trend: 'improving' | 'worsening' | 'stable';
}> {
  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_KEY
  );
  
  // Get previous run on same branch
  const { data: previousRun } = await supabase
    .from('warning_runs')
    .select('id, total_warnings')
    .eq('repo_id', repoId)
    .eq('branch', branch)
    .neq('id', currentRunId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (!previousRun) {
    return {
      new_warnings: [],
      fixed_warnings: [],
      trend: 'stable'
    };
  }
  
  // Compare warnings
  // Implementation details...
  
  return comparison;
}
```

### 8. OpenAI Integration (src/services/openai.ts)
```typescript
import OpenAI from 'openai';
import { Env, WebhookPayload } from '../types';

export async function generateSummary(
  env: Env,
  payload: WebhookPayload
): Promise<string> {
  const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });
  
  // Group warnings by type
  const warningsByType = payload.warnings.reduce((acc, warning) => {
    if (!acc[warning.type]) acc[warning.type] = [];
    acc[warning.type].push(warning);
    return acc;
  }, {} as Record<string, typeof payload.warnings>);
  
  const prompt = `
Analyze these Swift concurrency warnings and provide a concise summary for developers:

Repository: ${payload.repository.full_name}
Branch: ${payload.branch}
Total Warnings: ${payload.warnings.length}

Warning Breakdown:
${Object.entries(warningsByType).map(([type, warnings]) => 
  `- ${type}: ${warnings.length} warnings`
).join('\n')}

Top 3 Most Critical Issues:
${payload.warnings
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
        content: 'You are a Swift concurrency expert helping developers fix threading issues.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.3,
    max_tokens: 400
  });
  
  return completion.choices[0].message.content || 'Summary generation failed';
}
```

### 9. Notification Services

#### Slack (src/services/slack.ts)
```typescript
import { Env } from '../types';

export async function sendSlackNotification(
  env: Env,
  data: NotificationData
): Promise<void> {
  const color = data.warnings.length === 0 ? 'good' : 
                data.warnings.some(w => w.severity === 'critical') ? 'danger' : 'warning';
  
  const payload = {
    attachments: [{
      color,
      title: `SwiftConcur CI Results - ${data.repository.name}`,
      title_link: `https://github.com/${data.repository.full_name}/runs/${data.run_id}`,
      fields: [
        {
          title: 'Branch',
          value: data.branch,
          short: true
        },
        {
          title: 'Total Warnings',
          value: data.warnings.length.toString(),
          short: true
        },
        {
          title: 'Summary',
          value: data.summary,
          short: false
        }
      ],
      footer: 'SwiftConcur CI',
      ts: Math.floor(Date.now() / 1000)
    }]
  };
  
  await fetch(env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
```

### 10. Rate Limiting (src/middleware/rateLimit.ts)
```typescript
import { Env } from '../types';

export async function rateLimitMiddleware(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response | void> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = `rate_limit:${ip}`;
  
  // Get current count
  const current = await env.RATE_LIMIT.get(key);
  const count = current ? parseInt(current) : 0;
  
  // Check limit (100 requests per hour)
  if (count >= 100) {
    return new Response('Rate limit exceeded', { 
      status: 429,
      headers: {
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(Date.now() + 3600000).toISOString()
      }
    });
  }
  
  // Increment counter
  ctx.waitUntil(
    env.RATE_LIMIT.put(key, (count + 1).toString(), {
      expirationTtl: 3600 // 1 hour
    })
  );
}
```

### 11. Testing (tests/worker.test.ts)
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { unstable_dev } from 'wrangler';

describe('Worker', () => {
  let worker: Awaited<ReturnType<typeof unstable_dev>>;
  
  beforeAll(async () => {
    worker = await unstable_dev('src/index.ts', {
      experimental: { disableExperimentalWarning: true },
    });
  });
  
  it('should return 200 for health check', async () => {
    const response = await worker.fetch('/health');
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe('OK');
  });
  
  it('should require authentication for webhook', async () => {
    const response = await worker.fetch('/api/webhook', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(401);
  });
  
  it('should validate webhook payload', async () => {
    // Test with valid signature but invalid payload
    const response = await worker.fetch('/api/webhook', {
      method: 'POST',
      headers: {
        'X-Hub-Signature-256': 'sha256=valid_signature',
      },
      body: JSON.stringify({ invalid: 'payload' }),
    });
    expect(response.status).toBe(400);
  });
});
```

## Deployment

### 1. Set Secrets
```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put OPENAI_API_KEY
wrangler secret put SLACK_WEBHOOK_URL
wrangler secret put TEAMS_WEBHOOK_URL
wrangler secret put WEBHOOK_SECRET
```

### 2. Create KV Namespace
```bash
wrangler kv:namespace create "RATE_LIMIT"
# Add the ID to wrangler.toml
```

### 3. Deploy
```bash
# Development
wrangler dev

# Production
wrangler deploy
```

## Integration with GitHub Action

Update the GitHub Action to send results to the API:

```bash
# In entrypoint.sh
if [ -n "$SWIFTCONCUR_API_URL" ]; then
  curl -X POST "$SWIFTCONCUR_API_URL/api/webhook" \
    -H "Content-Type: application/json" \
    -H "X-Hub-Signature-256: $(generate_signature)" \
    -d @"$WEBHOOK_PAYLOAD"
fi
```

## Security Considerations

1. **Webhook Verification**: Always verify GitHub webhook signatures
2. **Rate Limiting**: Implement per-IP rate limiting
3. **Input Validation**: Use Zod schemas for all inputs
4. **Secrets Management**: Use Cloudflare secrets, never hardcode
5. **CORS**: Configure appropriate CORS headers

## Performance Optimization

1. **Use Cloudflare Cache**: Cache AI summaries
2. **Batch Database Operations**: Group Supabase inserts
3. **Async Processing**: Use `waitUntil` for non-critical tasks
4. **Edge Locations**: Deploy to multiple regions

## Monitoring

1. **Cloudflare Analytics**: Built-in request metrics
2. **Custom Metrics**: Log to external service
3. **Error Tracking**: Integrate Sentry
4. **Uptime Monitoring**: Use external monitoring service

## Next Steps

After completing the API, proceed to Phase 4 (Dashboard) to build the UI for visualizing warning trends and managing integrations.