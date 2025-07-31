# SwiftConcur API

A Cloudflare Workers API for processing Swift concurrency warnings, providing AI-powered analysis, and real-time notifications.

## Architecture

- **Runtime**: Cloudflare Workers (Edge compute)
- **Database**: Supabase (PostgreSQL)
- **Storage**: Cloudflare R2 (Object storage)
- **AI**: OpenAI GPT-4 (Summary generation)
- **Notifications**: Slack/Teams webhooks
- **Real-time**: Durable Objects + WebSockets

## Features

### Core API Endpoints

- `POST /v1/warnings` - Ingest warning data from CI/CD
- `GET /v1/runs/{run_id}` - Retrieve run details with warnings
- `GET /v1/repos/{repo_id}/trend` - Get warning trend analysis
- `GET /health` - Health check endpoint

### Security Features

- **Bearer token authentication** with repo-scoped access
- **Rate limiting** with sliding window algorithm
- **Input validation** using Zod schemas
- **CORS protection** with origin allowlisting
- **File size limits** to prevent DoS attacks

### Performance Features

- **Edge deployment** for low-latency responses
- **Streaming uploads** to R2 for large files
- **Database connection pooling** via Supabase
- **Async processing** with Cloudflare Queues
- **Caching** with appropriate cache headers

## Development Setup

### Prerequisites

- Node.js 18+
- Wrangler CLI
- Supabase account
- OpenAI API key

### Installation

```bash
cd api
npm install
```

### Configuration

1. **Create KV Namespaces**:
```bash
wrangler kv:namespace create "RATE_LIMIT"
wrangler kv:namespace create "API_TOKENS"
```

2. **Create R2 Bucket**:
```bash
wrangler r2 bucket create swiftconcur-xcresults
```

3. **Set Environment Secrets**:
```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put OPENAI_API_KEY
wrangler secret put SLACK_WEBHOOK_URL  # Optional
wrangler secret put TEAMS_WEBHOOK_URL  # Optional
```

4. **Update wrangler.toml**:
   - Replace KV namespace IDs with your actual IDs
   - Update bucket names if different

### Database Setup

Run the following SQL in your Supabase instance:

```sql
-- Repositories table
CREATE TABLE repos(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  tier text DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Runs table
CREATE TABLE runs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid REFERENCES repos(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  warnings_count int NOT NULL DEFAULT 0,
  ai_summary text,
  r2_object_key text,
  commit_sha text NOT NULL,
  branch text NOT NULL,
  pull_request int
);

-- Warnings table
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

## Development

### Running Locally

```bash
npm run dev
```

### Running Tests

```bash
# Unit tests
npm test

# With coverage
npm run test:coverage

# Type checking
npm run type-check

# Linting
npm run lint

# Format code
npm run format
```

### Testing API Endpoints

```bash
# Health check
curl https://localhost:8787/health

# Warning ingestion (requires auth token)
curl -X POST https://localhost:8787/v1/warnings \
  -H "Authorization: Bearer your-token" \
  -F "warnings.json=@sample-warnings.json"

# Get run details
curl https://localhost:8787/v1/runs/run-uuid \
  -H "Authorization: Bearer your-token"

# Get trend data
curl https://localhost:8787/v1/repos/repo-uuid/trend?days=30 \
  -H "Authorization: Bearer your-token"
```

## Deployment

### Development Deployment

```bash
wrangler deploy --env development
```

### Production Deployment

```bash
wrangler deploy --env production
```

### Post-Deployment

1. **Generate API Tokens** for repositories
2. **Test endpoints** with real data
3. **Monitor logs** via Wrangler or Cloudflare dashboard
4. **Set up alerting** for errors and rate limits

## API Documentation

### Authentication

All API endpoints (except `/health`) require a Bearer token:

```
Authorization: Bearer scr_<timestamp>_<random_hash>
```

### Warning Payload Format

```json
{
  "repo_id": "uuid",
  "run_id": "uuid",
  "warnings": [
    {
      "type": "actor_isolation|sendable|data_race|performance",
      "severity": "critical|high|medium|low",
      "file_path": "MyFile.swift",
      "line_number": 42,
      "column_number": 8,
      "message": "Warning description",
      "code_context": {
        "before": ["line before", "another line"],
        "line": "problematic line of code",
        "after": ["line after"]
      },
      "suggested_fix": "Optional fix suggestion"
    }
  ],
  "metadata": {
    "commit_sha": "abc123def456",
    "branch": "main",
    "pull_request": 123,
    "scheme": "MyApp",
    "configuration": "Debug",
    "swift_version": "5.9",
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

### Response Format

All API responses follow this format:

```json
{
  "success": true|false,
  "data": { ... },      // Present on success
  "error": "message",   // Present on error
  "details": { ... }    // Optional additional info
}
```

### Rate Limits

- **Free tier**: 100 requests/hour
- **Pro tier**: 1,000 requests/hour
- **Enterprise tier**: 10,000 requests/hour

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Requests allowed per hour
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: When limit resets

### Error Codes

- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (plan limits exceeded)
- `404` - Not Found
- `413` - Payload Too Large (>50KB)
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error
- `503` - Service Unavailable

## Monitoring

### Metrics to Track

- Request count and latency
- Error rates by endpoint
- Rate limit violations
- Queue processing delays
- Database query performance
- AI processing success rate

### Logs

Key log entries to monitor:
- Authentication failures
- Rate limit violations
- Validation errors
- Database connection issues
- AI processing failures
- Queue processing errors

### Alerts

Set up alerts for:
- Error rate > 5%
- Response time > 2 seconds
- Queue depth > 100 messages
- Database connection failures
- AI processing failures > 10%

## Security Considerations

### Authentication
- Tokens are cryptographically secure (32-byte random + timestamp)
- Tokens expire after 1 year
- No token reuse across repositories

### Input Validation
- All inputs validated with Zod schemas
- File size limits (50KB for JSON)
- Maximum warnings per request (1000)
- UUID validation for all IDs

### Rate Limiting
- Sliding window algorithm prevents burst attacks
- Per-repository + IP-based limiting
- Different limits based on plan tier

### Data Protection
- All data encrypted in transit (TLS)
- Database connections use SSL
- Sensitive data (tokens) stored in KV with TTL
- No logging of sensitive information

## Troubleshooting

### Common Issues

**"Authentication service unavailable"**
- Check KV namespace configuration
- Verify API_TOKENS namespace exists
- Check token format validity

**"Database connection failed"**
- Verify Supabase URL and service key
- Check database connection limits
- Ensure tables exist with correct schema

**"AI processing failed"**
- Verify OpenAI API key
- Check quota limits
- Monitor queue processing

**"Rate limit exceeded"**
- Check plan tier limits
- Verify rate limiting configuration
- Monitor request patterns

### Debug Mode

Set `ENVIRONMENT=development` to enable:
- Detailed error messages
- Request/response logging
- Additional CORS origins
- Extended timeouts

## Contributing

1. Follow TypeScript best practices
2. Write tests for all business logic
3. Use conventional commit messages
4. Update documentation for API changes
5. Ensure security best practices

## License

MIT License - see LICENSE file for details.