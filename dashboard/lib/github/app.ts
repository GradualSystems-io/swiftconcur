/**
 * GitHub App client for SwiftConcur integration
 * Handles authentication, installation tokens, and API calls
 */

import { App } from '@octokit/app';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { verify } from '@octokit/webhooks-methods';

// Environment validation
const requiredEnvVars = {
  GH_APP_ID: process.env.GH_APP_ID,
  GH_APP_PRIVATE_KEY: process.env.GH_APP_PRIVATE_KEY,
  GH_WEBHOOK_SECRET: process.env.GH_WEBHOOK_SECRET,
} as const;

for (const [key, value] of Object.entries(requiredEnvVars)) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// GitHub App configuration
export const GH_APP_CONFIG = {
  appId: parseInt(requiredEnvVars.GH_APP_ID!, 10),
  privateKey: requiredEnvVars.GH_APP_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  webhookSecret: requiredEnvVars.GH_WEBHOOK_SECRET!,
  permissions: {
    contents: 'read',
    issues: 'write',
    pull_requests: 'write',
    checks: 'write',
    metadata: 'read',
  },
} as const;

/**
 * GitHub App instance with authentication
 */
export const githubApp = new App({
  appId: GH_APP_CONFIG.appId,
  privateKey: GH_APP_CONFIG.privateKey,
  webhooks: {
    secret: GH_APP_CONFIG.webhookSecret,
  },
});

/**
 * Create an authenticated Octokit instance for a specific installation
 */
export async function createInstallationClient(installationId: number): Promise<Octokit> {
  try {
    const octokit = await githubApp.getInstallationOctokit(installationId);
    return octokit;
  } catch (error) {
    throw new Error(`Failed to create installation client: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create an Octokit instance with app-level authentication
 */
export function createAppClient(): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: GH_APP_CONFIG.appId,
      privateKey: GH_APP_CONFIG.privateKey,
    },
  });
}

/**
 * Verify GitHub webhook signature
 */
export async function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Promise<boolean> {
  try {
    return await verify(GH_APP_CONFIG.webhookSecret, payload, signature);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return false;
  }
}

/**
 * Get installation details from GitHub
 */
export async function getInstallation(installationId: number) {
  try {
    const appClient = createAppClient();
    const { data: installation } = await appClient.rest.apps.getInstallation({
      installation_id: installationId,
    });
    return installation;
  } catch (error) {
    throw new Error(`Failed to get installation: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get repositories for an installation
 */
export async function getInstallationRepositories(installationId: number) {
  try {
    const installationClient = await createInstallationClient(installationId);
    if (installationClient.rest?.apps?.listReposAccessibleToInstallation) {
      const { data } = await installationClient.rest.apps.listReposAccessibleToInstallation();
      return data.repositories;
    }

    const { data } = await installationClient.request({
      method: 'GET',
      url: '/installation/repositories',
    });

    return (data as any).repositories ?? [];
  } catch (error) {
    throw new Error(`Failed to get installation repositories: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Post a comment on a pull request
 */
export async function postPullRequestComment(
  installationId: number,
  owner: string,
  repo: string,
  pullNumber: number,
  body: string
) {
  try {
    const installationClient = await createInstallationClient(installationId);
    
    const { data } = await installationClient.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    });
    
    return data;
  } catch (error) {
    throw new Error(`Failed to post PR comment: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Set commit status for a repository
 */
export async function setCommitStatus(
  installationId: number,
  owner: string,
  repo: string,
  sha: string,
  state: 'error' | 'failure' | 'pending' | 'success',
  description: string,
  context = 'swiftconcur/warnings'
) {
  try {
    const installationClient = await createInstallationClient(installationId);
    
    const { data } = await installationClient.rest.repos.createCommitStatus({
      owner,
      repo,
      sha,
      state,
      description: description.slice(0, 140), // GitHub limit
      context,
    });
    
    return data;
  } catch (error) {
    throw new Error(`Failed to set commit status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if installation has required permissions
 */
export async function validateInstallationPermissions(installationId: number): Promise<{
  valid: boolean;
  missing: string[];
}> {
  try {
    const installation = await getInstallation(installationId);
    const permissions = installation.permissions;
    const missing: string[] = [];

    // Check required permissions
    const required = GH_APP_CONFIG.permissions;
    
    for (const [permission, level] of Object.entries(required)) {
      const actual = permissions[permission as keyof typeof permissions];
      if (!actual || (level === 'write' && actual !== 'write')) {
        missing.push(`${permission}:${level}`);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  } catch (error) {
    throw new Error(`Failed to validate permissions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate installation URL for users to install the app
 */
export function generateInstallationUrl(repositoryIds?: number[]): string {
  const baseUrl = `https://github.com/apps/${process.env.GH_APP_SLUG || 'swiftconcur-ci'}/installations/new`;
  
  if (repositoryIds && repositoryIds.length > 0) {
    const params = new URLSearchParams({
      repository_ids: repositoryIds.join(','),
    });
    return `${baseUrl}?${params}`;
  }
  
  return baseUrl;
}

/**
 * Error types for better error handling
 */
export class GitHubAppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly installationId?: number
  ) {
    super(message);
    this.name = 'GitHubAppError';
  }
}

export class InstallationNotFoundError extends GitHubAppError {
  constructor(installationId: number) {
    super(`Installation ${installationId} not found`, 'INSTALLATION_NOT_FOUND', installationId);
  }
}

export class InsufficientPermissionsError extends GitHubAppError {
  constructor(installationId: number, missing: string[]) {
    super(
      `Installation ${installationId} missing permissions: ${missing.join(', ')}`,
      'INSUFFICIENT_PERMISSIONS',
      installationId
    );
  }
}

/**
 * Rate limit info for GitHub API calls
 */
export async function getRateLimit(installationId?: number): Promise<{
  remaining: number;
  limit: number;
  reset: Date;
}> {
  try {
    const client = installationId 
      ? await createInstallationClient(installationId)
      : createAppClient();
    
    const { data } = await client.rest.rateLimit.get();
    
    return {
      remaining: data.rate.remaining,
      limit: data.rate.limit,
      reset: new Date(data.rate.reset * 1000),
    };
  } catch (error) {
    throw new Error(`Failed to get rate limit: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
