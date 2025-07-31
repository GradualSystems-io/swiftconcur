import type { Env, RequestWithRepo, APIResponse } from '../types';
import { WarningProcessor, WarningPayloadSchema } from '../models/warning';
import { RepositoryService } from '../models/repository';
import { createSupabaseService } from '../services/supabase';
import { uploadToR2, generateWarningsKey } from '../services/r2';
import { ZodError } from 'zod';

const MAX_JSON_SIZE = 50 * 1024; // 50 KB
const MAX_WARNINGS_PER_REQUEST = 1000;

/**
 * Handle warning ingestion with comprehensive validation and security
 */
export async function handleWarnings(
  request: RequestWithRepo,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const startTime = Date.now();
  
  try {
    // Validate request method
    if (request.method !== 'POST') {
      return createErrorResponse('Method not allowed', 405);
    }
    
    // Check content type
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return createErrorResponse('Content-Type must be multipart/form-data', 400);
    }
    
    // Get repository ID from auth middleware
    const repoId = request.repoId;
    if (!repoId) {
      return createErrorResponse('Repository ID not found', 401);
    }
    
    // Parse multipart form data with size limits
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      console.error('Error parsing form data:', error);
      return createErrorResponse('Invalid form data', 400);
    }
    
    // Extract warnings JSON file
    const warningsFile = formData.get('warnings.json') as File;
    if (!warningsFile) {
      return createErrorResponse('Missing warnings.json file', 400);
    }
    
    // Validate file size
    if (warningsFile.size > MAX_JSON_SIZE) {
      return createErrorResponse(
        `File too large. Maximum size: ${MAX_JSON_SIZE / 1024}KB`,
        413
      );
    }
    
    if (warningsFile.size === 0) {
      return createErrorResponse('Empty file not allowed', 400);
    }
    
    // Parse and validate JSON content
    let warningsText: string;
    try {
      warningsText = await warningsFile.text();
    } catch (error) {
      return createErrorResponse('Failed to read file content', 400);
    }
    
    let parsedData: any;
    try {
      parsedData = JSON.parse(warningsText);
    } catch (error) {
      return createErrorResponse('Invalid JSON format', 400);
    }
    
    // Validate against schema
    let validatedPayload;
    try {
      validatedPayload = WarningProcessor.validateWarningPayload(parsedData);
    } catch (error) {
      if (error instanceof ZodError) {
        return createErrorResponse('Validation failed', 400, {
          validationErrors: error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      return createErrorResponse('Payload validation failed', 400);
    }
    
    // Additional business logic validation
    if (validatedPayload.warnings.length > MAX_WARNINGS_PER_REQUEST) {
      return createErrorResponse(
        `Too many warnings. Maximum: ${MAX_WARNINGS_PER_REQUEST}`,
        400
      );
    }
    
    // Validate repository access and limits
    const supabaseService = createSupabaseService(env);
    let repository;
    try {
      repository = await supabaseService.getRepository(repoId);
    } catch (error) {
      return createErrorResponse('Repository not found', 404);
    }
    
    // Check plan limits
    const isValid = RepositoryService.validateRepositoryAccess(
      repoId,
      repository.tier,
      validatedPayload.warnings.length
    );
    
    if (!isValid) {
      const limits = RepositoryService.getPlanLimits(repository.tier);
      return createErrorResponse(
        `Warning count exceeds plan limit of ${limits.maxWarningsPerRun}`,
        403
      );
    }
    
    // Generate R2 storage key
    const r2Key = generateWarningsKey(repoId, validatedPayload.run_id);
    
    // Store raw data in R2 (non-blocking for performance)
    const r2UploadPromise = uploadToR2(
      env.XCRESULT_BUCKET,
      r2Key,
      warningsFile,
      {
        repoId,
        runId: validatedPayload.run_id,
        warningCount: validatedPayload.warnings.length.toString(),
        commitSha: validatedPayload.metadata.commit_sha,
      }
    );
    
    // Store structured data in Supabase
    let runId: string;
    try {
      runId = await supabaseService.storeWarnings(validatedPayload, r2Key);
    } catch (error) {
      console.error('Error storing warnings in database:', error);
      
      // Try to clean up R2 upload if database failed
      ctx.waitUntil(r2UploadPromise.then(() => {
        // Could implement R2 cleanup here if needed
      }).catch(() => {}));
      
      return createErrorResponse('Failed to store warnings', 500);
    }
    
    // Wait for R2 upload to complete
    try {
      await r2UploadPromise;
    } catch (error) {
      console.error('R2 upload failed:', error);
      // Continue anyway - database storage succeeded
    }
    
    // Queue AI summary generation (async, non-blocking)
    if (repository.tier !== 'free') {
      ctx.waitUntil(
        env.AI_QUEUE.send({
          repo_id: repoId,
          run_id: runId,
          warnings: validatedPayload.warnings,
          metadata: validatedPayload.metadata,
        }).catch(error => {
          console.error('Failed to queue AI summary:', error);
        })
      );
    }
    
    // Trigger real-time notifications via Durable Object
    ctx.waitUntil(
      notifyRepoShard(env, repoId, runId, validatedPayload.warnings.length)
        .catch(error => {
          console.error('Failed to notify repo shard:', error);
        })
    );
    
    // Clean up old runs for free tier
    if (repository.tier === 'free') {
      const limits = RepositoryService.getPlanLimits('free');
      ctx.waitUntil(
        supabaseService.cleanupOldRuns(repoId, limits.maxRunsStored)
          .catch(error => {
            console.error('Failed to cleanup old runs:', error);
          })
      );
    }
    
    // Calculate processing time
    const processingTime = Date.now() - startTime;
    
    // Return success response
    return new Response(JSON.stringify({
      success: true,
      data: {
        id: runId,
        status: 'queued',
        warnings_count: validatedPayload.warnings.length,
        processing_time_ms: processingTime,
      },
    }), {
      status: 202,
      headers: {
        'Content-Type': 'application/json',
        'X-Processing-Time': processingTime.toString(),
      },
    });
    
  } catch (error) {
    console.error('Unexpected error in warning handler:', error);
    
    return createErrorResponse('Internal server error', 500);
  }
}

/**
 * Notify repo shard of new warning data
 */
async function notifyRepoShard(
  env: Env,
  repoId: string,
  runId: string,
  warningCount: number
): Promise<void> {
  try {
    const repoShardId = env.REPO_SHARD.idFromName(repoId);
    const repoShard = env.REPO_SHARD.get(repoShardId);
    
    await repoShard.fetch(new Request('https://internal/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'new_run',
        run_id: runId,
        warning_count: warningCount,
        timestamp: new Date().toISOString(),
      }),
    }));
    
  } catch (error) {
    console.error('Error notifying repo shard:', error);
    throw error;
  }
}

/**
 * Create standardized error response
 */
function createErrorResponse(
  message: string,
  status: number,
  details?: any
): Response {
  const response: APIResponse = {
    success: false,
    error: message,
    ...(details && { details }),
  };
  
  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Validate file mime type
 */
function isValidFileType(file: File): boolean {
  const allowedTypes = [
    'application/json',
    'text/json',
    'text/plain',
  ];
  
  return allowedTypes.includes(file.type) || file.name.endsWith('.json');
}