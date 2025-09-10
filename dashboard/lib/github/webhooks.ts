/**
 * GitHub webhook event handlers
 * Processes installation, repository, and SwiftConcur warning events
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { 
  getInstallation, 
  postPullRequestComment, 
  setCommitStatus,
  GitHubAppError 
} from './app';
import { 
  upsertInstallation, 
  deleteInstallation, 
  suspendInstallation,
  syncUserRepositories 
} from './auth';

/**
 * GitHub webhook event types we handle
 */
export type GitHubWebhookEvent = 
  | 'installation'
  | 'installation_repositories'  
  | 'push'
  | 'pull_request'
  | 'workflow_run'
  | 'repository'
  | 'swiftconcur_warning'; // Custom event from our GitHub Action

/**
 * Base webhook payload structure
 */
export interface WebhookPayload {
  action?: string;
  installation?: {
    id: number;
    account: {
      id: number;
      login: string;
      type: 'User' | 'Organization';
    };
  };
  repositories?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  repository?: {
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string;
  };
}

/**
 * SwiftConcur warning data from GitHub Action
 */
export interface SwiftConcurWarningPayload extends WebhookPayload {
  swiftconcur: {
    warning_count: number;
    new_warnings: number;
    fixed_warnings: number;
    build_time_seconds: number;
    json_report_path?: string;
    warnings?: Array<{
      id: string;
      warning_type: string;
      severity: string;
      file_path: string;
      line_number: number;
      message: string;
    }>;
  };
  workflow_run?: {
    head_sha: string;
    head_branch: string;
    conclusion?: string;
    html_url?: string;
  };
}

/**
 * Store webhook event for audit trail
 */
async function storeWebhookEvent(
  installationId: number,
  deliveryId: string,
  eventType: string,
  action: string | undefined,
  payload: WebhookPayload,
  signatureValid = false
): Promise<string> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('github_webhook_events')
    .insert({
      installation_id: installationId,
      github_delivery_id: deliveryId,
      event_type: eventType,
      action,
      payload,
      signature_valid: signatureValid,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to store webhook event: ${error.message}`);
  }

  return data.id;
}

/**
 * Mark webhook event as processed
 */
async function markEventProcessed(eventId: string, error?: string): Promise<void> {
  const supabase = createServiceRoleClient();

  const updateData: any = {
    processed_at: new Date().toISOString(),
  };

  if (error) {
    updateData.processing_error = error;
  }

  const { error: updateError } = await supabase
    .from('github_webhook_events')
    .update(updateData)
    .eq('id', eventId);

  if (updateError) {
    console.error('Failed to mark event as processed:', updateError);
  }
}

/**
 * Handle installation events (install/uninstall)
 */
export async function handleInstallationEvent(
  payload: WebhookPayload,
  deliveryId: string
): Promise<void> {
  if (!payload.installation) {
    throw new Error('Installation data missing from payload');
  }

  const { installation, action } = payload;
  const eventId = await storeWebhookEvent(
    installation.id,
    deliveryId,
    'installation',
    action,
    payload,
    true
  );

  try {
    switch (action) {
      case 'created':
        console.log(`Installation created: ${installation.id} for ${installation.account.login}`);
        
        // Get full installation data from GitHub
        const githubInstallation = await getInstallation(installation.id);
        
        // Note: At this point, we don't know which user this belongs to yet
        // That will be linked during the OAuth callback flow
        break;

      case 'deleted':
        console.log(`Installation deleted: ${installation.id}`);
        await deleteInstallation(installation.id);
        break;

      case 'suspend':
        console.log(`Installation suspended: ${installation.id}`);
        await suspendInstallation(installation.id);
        break;

      case 'unsuspend':
        console.log(`Installation unsuspended: ${installation.id}`);
        // Clear suspension - this will be handled by OAuth re-linking
        break;

      default:
        console.log(`Unhandled installation action: ${action}`);
    }

    await markEventProcessed(eventId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error processing installation event:`, errorMessage);
    await markEventProcessed(eventId, errorMessage);
    throw error;
  }
}

/**
 * Handle installation_repositories events (repo added/removed)
 */
export async function handleInstallationRepositoriesEvent(
  payload: WebhookPayload,
  deliveryId: string
): Promise<void> {
  if (!payload.installation) {
    throw new Error('Installation data missing from payload');
  }

  const { installation, action, repositories = [] } = payload;
  const eventId = await storeWebhookEvent(
    installation.id,
    deliveryId,
    'installation_repositories',
    action,
    payload,
    true
  );

  try {
    // Find user who owns this installation
    const supabase = createServiceRoleClient();
    const { data: installationData } = await supabase
      .from('github_installations')
      .select('user_id')
      .eq('installation_id', installation.id)
      .single();

    if (!installationData) {
      console.log(`Installation ${installation.id} not linked to any user yet`);
      await markEventProcessed(eventId);
      return;
    }

    switch (action) {
      case 'added':
        console.log(`Repositories added to installation ${installation.id}:`, repositories.map(r => r.full_name));
        // Re-sync repositories to pick up new ones
        await syncUserRepositories(installationData.user_id);
        break;

      case 'removed':
        console.log(`Repositories removed from installation ${installation.id}:`, repositories.map(r => r.full_name));
        
        // Remove repositories from database
        const repoIds = repositories.map(r => r.id);
        await supabase
          .from('repositories')
          .delete()
          .in('github_repo_id', repoIds)
          .eq('installation_id', installation.id);
        break;

      default:
        console.log(`Unhandled installation_repositories action: ${action}`);
    }

    await markEventProcessed(eventId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error processing installation_repositories event:`, errorMessage);
    await markEventProcessed(eventId, errorMessage);
    throw error;
  }
}

/**
 * Handle SwiftConcur warning data from GitHub Actions
 */
export async function handleSwiftConcurWarningEvent(
  payload: SwiftConcurWarningPayload,
  deliveryId: string
): Promise<void> {
  if (!payload.installation || !payload.repository) {
    throw new Error('Installation or repository data missing from payload');
  }

  const { installation, repository, swiftconcur, workflow_run } = payload;
  const eventId = await storeWebhookEvent(
    installation.id,
    deliveryId,
    'swiftconcur_warning',
    'warning_report',
    payload,
    true
  );

  try {
    const supabase = createServiceRoleClient();

    // Find the repository in our database
    const { data: repoData, error: repoError } = await supabase
      .from('repositories')
      .select('id, user_id')
      .eq('github_repo_id', repository.id)
      .eq('installation_id', installation.id)
      .single();

    if (repoError || !repoData) {
      throw new Error(`Repository not found in database: ${repository.full_name}`);
    }

    // Store warning run data
    const { data: warningRun, error: runError } = await supabase
      .from('warning_runs')
      .insert({
        repository_id: repoData.id,
        commit_sha: workflow_run?.head_sha,
        branch: workflow_run?.head_branch,
        pull_request: null, // TODO: Extract from payload if available
        total_warnings: swiftconcur.warning_count,
        build_time_seconds: swiftconcur.build_time_seconds,
      })
      .select()
      .single();

    if (runError) {
      throw new Error(`Failed to store warning run: ${runError.message}`);
    }

    // Store individual warnings if provided
    if (swiftconcur.warnings && swiftconcur.warnings.length > 0) {
      const warningData = swiftconcur.warnings.map(warning => ({
        run_id: warningRun.id,
        type: warning.warning_type,
        severity: warning.severity,
        file_path: warning.file_path,
        line_number: warning.line_number,
        column_number: null,
        message: warning.message,
        code_context: null,
      }));

      const { error: warningsError } = await supabase
        .from('warnings')
        .insert(warningData);

      if (warningsError) {
        console.error('Failed to store individual warnings:', warningsError);
        // Don't throw - the run data is more important
      }
    }

    // Set commit status if we have the SHA
    if (workflow_run?.head_sha) {
      const [owner, repo] = repository.full_name.split('/');
      const warningCount = swiftconcur.warning_count;
      
      let state: 'success' | 'failure' | 'error';
      let description: string;

      if (warningCount === 0) {
        state = 'success';
        description = 'No Swift concurrency warnings found';
      } else if (warningCount <= 5) { // Configurable threshold
        state = 'success';
        description = `⚠️ ${warningCount} Swift concurrency warning${warningCount === 1 ? '' : 's'} found`;
      } else {
        state = 'failure';
        description = `❌ ${warningCount} Swift concurrency warnings found`;
      }

      try {
        await setCommitStatus(
          installation.id,
          owner,
          repo,
          workflow_run.head_sha,
          state,
          description
        );
      } catch (statusError) {
        console.error('Failed to set commit status:', statusError);
        // Don't throw - data storage is more important
      }
    }

    console.log(`Processed SwiftConcur warning data for ${repository.full_name}: ${swiftconcur.warning_count} warnings`);
    await markEventProcessed(eventId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error processing SwiftConcur warning event:`, errorMessage);
    await markEventProcessed(eventId, errorMessage);
    throw error;
  }
}

/**
 * Handle pull request events for commenting
 */
export async function handlePullRequestEvent(
  payload: WebhookPayload & {
    pull_request?: {
      number: number;
      head: { sha: string };
    };
  },
  deliveryId: string
): Promise<void> {
  if (!payload.installation || !payload.repository || !payload.pull_request) {
    throw new Error('Required data missing from pull request payload');
  }

  const { installation, repository, pull_request, action } = payload;
  const eventId = await storeWebhookEvent(
    installation.id,
    deliveryId,
    'pull_request',
    action,
    payload,
    true
  );

  try {
    // Only handle opened/synchronize events
    if (action !== 'opened' && action !== 'synchronize') {
      await markEventProcessed(eventId);
      return;
    }

    // Find recent warning run for this commit
    const supabase = createServiceRoleClient();
    const { data: warningRun } = await supabase
      .from('warning_runs')
      .select(`
        *,
        repositories(full_name)
      `)
      .eq('commit_sha', pull_request.head.sha)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!warningRun) {
      console.log(`No warning data found for commit ${pull_request.head.sha}`);
      await markEventProcessed(eventId);
      return;
    }

    // Generate comment with warning summary
    const [owner, repo] = repository.full_name.split('/');
    const warningCount = warningRun.total_warnings;
    
    let comment: string;
    if (warningCount === 0) {
      comment = '✅ **SwiftConcur Analysis Complete**\n\nNo Swift concurrency warnings found! 🎉';
    } else {
      comment = `⚠️ **SwiftConcur Analysis Complete**\n\n**${warningCount}** Swift concurrency warning${warningCount === 1 ? '' : 's'} found.\n\n[View detailed report in dashboard](${process.env.NEXT_PUBLIC_APP_URL}/repositories/${repository.full_name.replace('/', '%2F')})`;
    }

    // Post comment
    await postPullRequestComment(
      installation.id,
      owner,
      repo,
      pull_request.number,
      comment
    );

    console.log(`Posted PR comment for ${repository.full_name}#${pull_request.number}`);
    await markEventProcessed(eventId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error processing pull request event:`, errorMessage);
    await markEventProcessed(eventId, errorMessage);
    throw error;
  }
}

/**
 * Main webhook event router
 */
export async function processWebhookEvent(
  eventType: string,
  payload: WebhookPayload,
  deliveryId: string
): Promise<void> {
  console.log(`Processing webhook event: ${eventType} (${payload.action}) - ${deliveryId}`);

  try {
    switch (eventType) {
      case 'installation':
        await handleInstallationEvent(payload, deliveryId);
        break;

      case 'installation_repositories':
        await handleInstallationRepositoriesEvent(payload, deliveryId);
        break;

      case 'swiftconcur_warning':
        await handleSwiftConcurWarningEvent(payload as SwiftConcurWarningPayload, deliveryId);
        break;

      case 'pull_request':
        await handlePullRequestEvent(payload as any, deliveryId);
        break;

      case 'push':
      case 'workflow_run':
      case 'repository':
        // Store for audit but don't process
        if (payload.installation) {
          await storeWebhookEvent(
            payload.installation.id,
            deliveryId,
            eventType,
            payload.action,
            payload,
            true
          );
        }
        break;

      default:
        console.log(`Unhandled webhook event type: ${eventType}`);
    }
  } catch (error) {
    console.error(`Failed to process webhook event ${eventType}:`, error);
    throw error;
  }
}