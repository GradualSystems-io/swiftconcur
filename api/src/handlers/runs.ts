import type { Env, RequestWithRepo, APIResponse } from '../types';
import { createSupabaseService } from '../services/supabase';

/**
 * Handle run retrieval requests
 */
export async function handleRun(
  request: RequestWithRepo,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  try {
    // Validate request method
    if (request.method !== 'GET') {
      return createErrorResponse('Method not allowed', 405);
    }
    
    // Extract run ID from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const runId = pathParts[3]; // /v1/runs/{run_id}
    
    if (!runId) {
      return createErrorResponse('Run ID is required', 400);
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(runId)) {
      return createErrorResponse('Invalid run ID format', 400);
    }
    
    // Get repository ID from auth middleware
    const repoId = request.repoId;
    if (!repoId) {
      return createErrorResponse('Repository ID not found', 401);
    }
    
    // Fetch run from database
    const supabaseService = createSupabaseService(env);
    
    let runData;
    try {
      runData = await supabaseService.getRun(runId);
    } catch (error) {
      console.error('Error fetching run:', error);
      
      if (error instanceof Error && error.message === 'Run not found') {
        return createErrorResponse('Run not found', 404);
      }
      
      return createErrorResponse('Failed to retrieve run', 500);
    }
    
    // Verify repository ownership
    if (runData.repo_id !== repoId) {
      return createErrorResponse('Run not found', 404); // Don't reveal existence
    }
    
    // Process warnings data
    const processedWarnings = runData.warnings.map(warning => ({
      id: (warning as any).id,
      type: warning.type,
      severity: warning.severity,
      file_path: warning.file_path,
      line_number: warning.line_number,
      column_number: warning.column_number,
      message: warning.message,
      code_context: warning.code_context,
      suggested_fix: warning.suggested_fix,
    }));
    
    // Group warnings by file for better presentation
    const warningsByFile = processedWarnings.reduce((acc, warning) => {
      if (!acc[warning.file_path]) {
        acc[warning.file_path] = [];
      }
      acc[warning.file_path].push(warning);
      return acc;
    }, {} as Record<string, typeof processedWarnings>);
    
    // Calculate summary statistics
    const summaryStats = {
      total: processedWarnings.length,
      by_severity: {
        critical: processedWarnings.filter(w => w.severity === 'critical').length,
        high: processedWarnings.filter(w => w.severity === 'high').length,
        medium: processedWarnings.filter(w => w.severity === 'medium').length,
        low: processedWarnings.filter(w => w.severity === 'low').length,
      },
      by_type: {
        actor_isolation: processedWarnings.filter(w => w.type === 'actor_isolation').length,
        sendable: processedWarnings.filter(w => w.type === 'sendable').length,
        data_race: processedWarnings.filter(w => w.type === 'data_race').length,
        performance: processedWarnings.filter(w => w.type === 'performance').length,
      },
      affected_files: Object.keys(warningsByFile).length,
    };
    
    // Build response
    const response: APIResponse = {
      success: true,
      data: {
        id: runData.id,
        repo_id: runData.repo_id,
        created_at: runData.created_at,
        commit_sha: runData.commit_sha,
        branch: runData.branch,
        pull_request: runData.pull_request,
        warnings_count: runData.warnings_count,
        ai_summary: runData.ai_summary,
        summary_stats: summaryStats,
        warnings: processedWarnings,
        warnings_by_file: warningsByFile,
      },
    };
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // 5 minutes cache
      },
    });
    
  } catch (error) {
    console.error('Unexpected error in run handler:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

/**
 * Create standardized error response
 */
function createErrorResponse(message: string, status: number): Response {
  const response: APIResponse = {
    success: false,
    error: message,
  };
  
  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}