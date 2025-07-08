Build a Cloudflare Workers API for SwiftConcur CI that:

1. Webhook endpoint (/api/webhook) that:
   - Receives GitHub Action results
   - Stores in Supabase (warning history)
   - Triggers AI summarization via OpenAI API
   - Sends notifications to Slack/Teams

2. AI summarization logic:
   - Use GPT-4o to create concise PR summaries
   - Compare warnings against base branch
   - Highlight new violations vs fixed ones
   - Generate actionable recommendations

3. Notification formatting:
   - Slack blocks with code snippets
   - Teams adaptive cards
   - Email templates (optional)

4. Rate limiting and authentication
5. Error handling and retries
6. Unit tests using Miniflare