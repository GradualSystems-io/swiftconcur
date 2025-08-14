import { z } from 'zod';
import type { PlanTier } from '../types';

export const RepositorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Repository name is required'),
  tier: z.enum(['free', 'pro', 'enterprise'] as const).default('free'),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export const RunSchema = z.object({
  id: z.string().uuid(),
  repo_id: z.string().uuid(),
  created_at: z.string().datetime(),
  warnings_count: z.number().int().min(0),
  ai_summary: z.string().optional(),
  r2_object_key: z.string().optional(),
  commit_sha: z.string(),
  branch: z.string(),
  pull_request: z.number().int().positive().optional(),
});

export const TrendDataSchema = z.object({
  repo_id: z.string().uuid(),
  date: z.string().date(),
  run_count: z.number().int().min(0),
  total_warnings: z.number().int().min(0),
  avg_warnings: z.number().min(0),
});

export type Repository = z.infer<typeof RepositorySchema>;
export type Run = z.infer<typeof RunSchema>;
export type TrendData = z.infer<typeof TrendDataSchema>;

export class RepositoryService {
  static getPlanLimits(tier: PlanTier) {
    const limits = {
      free: {
        requestsPerHour: 100,
        maxWarningsPerRun: 100,
        maxRunsStored: 30,
        aiSummaryEnabled: false,
        notificationsEnabled: false,
      },
      pro: {
        requestsPerHour: 1000,
        maxWarningsPerRun: 1000,
        maxRunsStored: 365,
        aiSummaryEnabled: true,
        notificationsEnabled: true,
      },
      enterprise: {
        requestsPerHour: 10000,
        maxWarningsPerRun: 10000,
        maxRunsStored: -1, // unlimited
        aiSummaryEnabled: true,
        notificationsEnabled: true,
      },
    };
    
    return limits[tier];
  }
  
  static validateRepositoryAccess(_repoId: string, tier: PlanTier, warningsCount: number): boolean {
    const limits = this.getPlanLimits(tier);
    return warningsCount <= limits.maxWarningsPerRun;
  }
}