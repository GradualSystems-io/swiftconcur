# Complete Phase 4 Setup Guide

## ✅ Already Completed
- [x] Dashboard Next.js project created and dependencies installed
- [x] SwiftConcur parser tested with demo iOS app 
- [x] Wrangler CLI installed and configuration updated

## 🔧 Manual Steps Required

### 1. Set up Supabase Database
1. Go to your Supabase dashboard: https://app.supabase.com
2. Open your project's SQL Editor
3. Copy and paste the entire contents of `api/scripts/setup-db.sql`
4. Run the SQL script to create all tables, views, and functions

### 2. Update Environment Variables
Update your `dashboard/.env.local` with actual values:
```bash
# Get these from your Supabase project settings
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key

# App URLs (update when deployed)
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8787

# GitHub App (update with your app name)
NEXT_PUBLIC_GITHUB_APP_NAME=swiftconcur-ci

# Generate a random secret
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=http://localhost:3000
```

### 3. Deploy API to Cloudflare Workers
```bash
cd api

# Login to Cloudflare
wrangler login

# Create required resources
wrangler r2 bucket create swiftconcur-xcresults
wrangler kv:namespace create rate-limit-kv
wrangler kv:namespace create api-tokens-kv

# Set up secrets
wrangler secret put SUPABASE_URL  # Enter your Supabase URL
wrangler secret put SUPABASE_SERVICE_KEY  # Enter your service role key
wrangler secret put OPENAI_API_KEY  # Optional: for AI summaries

# Deploy the API
wrangler deploy
```

### 4. Test the Complete Setup
```bash
cd dashboard

# Start the development server
npm run dev

# In another terminal, test the API
curl http://localhost:3000/api/health
```

## 🎯 Test with Real Data

You can now test the complete flow:

1. Build your demo project: 
   ```bash
   cd ~/Code/ConcurCLIDemo
   # Use the xcodebuild command we used earlier
   ```

2. Parse with SwiftConcur CLI:
   ```bash
   # Extract warnings
   xcrun xcresulttool get object --path build.xcresult --format json --legacy | jq '.actions._values[0].buildResult.issues.warningSummaries' > warnings.json
   
   # Parse with CLI
   /Users/aaronmcdaniel/Code/GradualSystems/swiftconcur/target/release/swiftconcur-parser -f warnings.json
   ```

3. Send to API (once deployed):
   ```bash
   curl -X POST https://your-api.workers.dev/api/runs \
     -H "Content-Type: application/json" \
     -d @parsed-output.json
   ```

4. View in dashboard at http://localhost:3000

## ✨ You're Ready for Phase 5!

Once these steps are complete, you'll have:
- ✅ Functional dashboard showing repository stats
- ✅ Working API endpoints for data storage
- ✅ Real-time updates via Supabase
- ✅ Complete CI integration workflow

The foundation is solid for adding billing, user management, and advanced features in Phase 5!