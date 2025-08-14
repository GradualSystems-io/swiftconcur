import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../types';
import type { Repository, Run, TrendData } from '../models/repository';
import type { Warning, WarningPayload } from '../models/warning';

/**
 * Supabase integration with connection pooling and error handling
 */
export class SupabaseService {
  private client: SupabaseClient;
  
  constructor(env: Env) {
    this.client = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_KEY,
      {
        auth: {
          persistSession: false,
        },
        db: {
          schema: 'public',
        },
        global: {
          headers: {
            'User-Agent': 'SwiftConcur-API/1.0',
          },
        },
      }
    );
  }
  
  /**
   * Store warning run and associated warnings
   */
  async storeWarnings(payload: WarningPayload, r2ObjectKey: string): Promise<string> {
    const { repo_id, run_id, warnings, metadata } = payload;
    
    try {
      // Start transaction
      const { error: runError } = await this.client
        .from('runs')
        .insert({
          id: run_id,
          repo_id,
          warnings_count: warnings.length,
          r2_object_key: r2ObjectKey,
          commit_sha: metadata.commit_sha,
          branch: metadata.branch,
          pull_request: metadata.pull_request,
          created_at: metadata.timestamp,
        })
        .select()
        .single();
      
      if (runError) {
        throw new Error(`Failed to insert run: ${runError.message}`);
      }
      
      // Insert warnings in batches for better performance
      if (warnings.length > 0) {
        const warningRecords = warnings.map(warning => ({
          run_id,
          file_path: warning.file_path,
          line: warning.line_number,
          column: warning.column_number,
          type: warning.type,
          severity: warning.severity,
          message: warning.message,
          code_context: warning.code_context,
          suggested_fix: warning.suggested_fix,
        }));
        
        // Insert in batches of 100 to avoid payload limits
        const batchSize = 100;
        for (let i = 0; i < warningRecords.length; i += batchSize) {
          const batch = warningRecords.slice(i, i + batchSize);
          
          const { error: warningError } = await this.client
            .from('warnings')
            .insert(batch);
          
          if (warningError) {
            throw new Error(`Failed to insert warnings batch ${i}: ${warningError.message}`);
          }
        }
      }
      
      return run_id;
      
    } catch (error) {
      console.error('Error storing warnings:', error);
      throw error;
    }
  }
  
  /**
   * Get run details with warnings
   */
  async getRun(runId: string): Promise<Run & { warnings: Warning[] }> {
    try {
      const { data: run, error: runError } = await this.client
        .from('runs')
        .select(`
          *,
          warnings (*)
        `)
        .eq('id', runId)
        .single();
      
      if (runError) {
        throw new Error(`Failed to get run: ${runError.message}`);
      }
      
      if (!run) {
        throw new Error('Run not found');
      }
      
      return {
        id: run.id,
        repo_id: run.repo_id,
        created_at: run.created_at,
        warnings_count: run.warnings_count,
        ai_summary: run.ai_summary,
        r2_object_key: run.r2_object_key,
        commit_sha: run.commit_sha,
        branch: run.branch,
        pull_request: run.pull_request,
        warnings: run.warnings || [],
      };
      
    } catch (error) {
      console.error('Error getting run:', error);
      throw error;
    }
  }
  
  /**
   * Get repository information
   */
  async getRepository(repoId: string): Promise<Repository> {
    try {
      const { data: repo, error } = await this.client
        .from('repos')
        .select('*')
        .eq('id', repoId)
        .single();
      
      if (error) {
        throw new Error(`Failed to get repository: ${error.message}`);
      }
      
      if (!repo) {
        throw new Error('Repository not found');
      }
      
      return repo;
      
    } catch (error) {
      console.error('Error getting repository:', error);
      throw error;
    }
  }
  
  /**
   * Get trend data for repository
   */
  async getTrendData(repoId: string, days: number): Promise<TrendData[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const { data, error } = await this.client
        .from('repo_warning_daily')
        .select('*')
        .eq('repo_id', repoId)
        .gte('date', startDate.toISOString().split('T')[0])
        .order('date', { ascending: true });
      
      if (error) {
        throw new Error(`Failed to get trend data: ${error.message}`);
      }
      
      return data || [];
      
    } catch (error) {
      console.error('Error getting trend data:', error);
      throw error;
    }
  }
  
  /**
   * Update AI summary for a run
   */
  async updateAISummary(runId: string, summary: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('runs')
        .update({ ai_summary: summary })
        .eq('id', runId);
      
      if (error) {
        throw new Error(`Failed to update AI summary: ${error.message}`);
      }
      
    } catch (error) {
      console.error('Error updating AI summary:', error);
      throw error;
    }
  }
  
  /**
   * Clean up old runs for free tier repositories
   */
  async cleanupOldRuns(repoId: string, maxRuns: number): Promise<number> {
    try {
      // Get runs to delete (keep most recent maxRuns)
      const { data: runsToDelete, error: selectError } = await this.client
        .from('runs')
        .select('id')
        .eq('repo_id', repoId)
        .order('created_at', { ascending: false })
        .range(maxRuns, 1000); // Get runs beyond the limit
      
      if (selectError) {
        throw new Error(`Failed to select old runs: ${selectError.message}`);
      }
      
      if (!runsToDelete || runsToDelete.length === 0) {
        return 0;
      }
      
      const runIds = runsToDelete.map(run => run.id);
      
      // Delete warnings first (foreign key constraint)
      const { error: warningsError } = await this.client
        .from('warnings')
        .delete()
        .in('run_id', runIds);
      
      if (warningsError) {
        console.error('Error deleting old warnings:', warningsError);
      }
      
      // Delete runs
      const { error: runsError } = await this.client
        .from('runs')
        .delete()
        .in('id', runIds);
      
      if (runsError) {
        throw new Error(`Failed to delete old runs: ${runsError.message}`);
      }
      
      return runsToDelete.length;
      
    } catch (error) {
      console.error('Error cleaning up old runs:', error);
      throw error;
    }
  }
  
  /**
   * Get repository statistics
   */
  async getRepositoryStats(repoId: string) {
    try {
      const { data, error } = await this.client
        .rpc('get_repo_stats', { repo_id: repoId });
      
      if (error) {
        throw new Error(`Failed to get repository stats: ${error.message}`);
      }
      
      return data;
      
    } catch (error) {
      console.error('Error getting repository stats:', error);
      return {
        total_runs: 0,
        total_warnings: 0,
        avg_warnings: 0,
        latest_run: null,
      };
    }
  }
  
  /**
   * Health check for database connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      const { error } = await this.client
        .from('repos')
        .select('count')
        .limit(1);
      
      return !error;
      
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
}

/**
 * Create Supabase service instance
 */
export function createSupabaseService(env: Env): SupabaseService {
  return new SupabaseService(env);
}