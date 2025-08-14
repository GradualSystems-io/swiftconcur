	•	Enforce Least-Privilege for GitHub OAuth App: Audit the GitHub App’s permissions and OAuth scopes to ensure it’s only requesting the minimum necessary. GitHub’s best practices say to select the minimum permissions your app needs. 
    
    For example, if the app only needs read access to commit statuses or logs, don’t request write access to repos. This reduces risk if tokens are leaked. 
    
    Also ensure the GitHub OAuth token is stored securely (Supabase or Cloudflare Worker secrets) and regularly refreshed/expired as per GitHub recommendations.