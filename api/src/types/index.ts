export interface Env {
  // KV Namespaces
  RATE_LIMIT: KVNamespace;
  API_TOKENS: KVNamespace;
  
  // R2 Bucket
  XCRESULT_BUCKET: R2Bucket;
  
  // Durable Objects
  REPO_SHARD: DurableObjectNamespace;
  
  // Queues
  AI_QUEUE: Queue;
  
  // Environment Variables
  ENVIRONMENT: string;
  
  // Secrets
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  OPENAI_API_KEY: string;
  SLACK_WEBHOOK_URL?: string;
  TEAMS_WEBHOOK_URL?: string;
}

export interface RequestWithRepo extends Request {
  repoId?: string;
}

export type WarningType = 'actor_isolation' | 'sendable' | 'data_race' | 'performance';
export type WarningSeverity = 'critical' | 'high' | 'medium' | 'low';
export type PlanTier = 'free' | 'pro' | 'enterprise';
export type TrendDirection = 'improving' | 'worsening' | 'stable';

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: string;
}