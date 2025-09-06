/**
 * GitHub App authentication utilities
 * Handles installation tokens, user linking, and permissions
 */

import { createClient } from '@/lib/supabase/server';
import { 
  getInstallation, 
  getInstallationRepositories,
  validateInstallationPermissions,
  GitHubAppError,
  InstallationNotFoundError,
  InsufficientPermissionsError
} from './app';

/**
 * GitHub installation data from our database
 */
export interface GitHubInstallation {
  id: string;
  userId: string;
  installationId: number;
  targetType: 'User' | 'Organization';
  targetId: number;
  targetLogin: string;
  permissions: Record<string, string>;
  appId: number;
  suspendedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Repository data from GitHub
 */
export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  language?: string;
  topics: string[];
  stargazersCount: number;
  updatedAt: string;
}

/**
 * Get user's GitHub installation from database
 */
export async function getUserInstallation(userId: string): Promise<GitHubInstallation | null> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('github_installations')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') { // Not "not found" error
    throw new Error(`Failed to get user installation: ${error.message}`);
  }

  return data as GitHubInstallation | null;
}

/**
 * Store or update GitHub installation in database
 */
export async function upsertInstallation(
  userId: string,
  installationData: {
    installationId: number;
    targetType: 'User' | 'Organization';
    targetId: number;
    targetLogin: string;
    permissions: Record<string, string>;
    appId: number;
  }
): Promise<GitHubInstallation> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('github_installations')
    .upsert({
      user_id: userId,
      installation_id: installationData.installationId,
      target_type: installationData.targetType,
      target_id: installationData.targetId,
      target_login: installationData.targetLogin,
      permissions: installationData.permissions,
      app_id: installationData.appId,
      suspended_at: null, // Clear suspension on update
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert installation: ${error.message}`);
  }

  return data as GitHubInstallation;
}

/**
 * Suspend a GitHub installation
 */
export async function suspendInstallation(installationId: number): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('github_installations')
    .update({ suspended_at: new Date().toISOString() })
    .eq('installation_id', installationId);

  if (error) {
    throw new Error(`Failed to suspend installation: ${error.message}`);
  }
}

/**
 * Delete a GitHub installation
 */
export async function deleteInstallation(installationId: number): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('github_installations')
    .delete()
    .eq('installation_id', installationId);

  if (error) {
    throw new Error(`Failed to delete installation: ${error.message}`);
  }
}

/**
 * Get installation by ID with validation
 */
export async function getValidatedInstallation(installationId: number): Promise<{
  installation: GitHubInstallation;
  github: any; // GitHub API installation data
}> {
  const supabase = createClient();

  // Get installation from database
  const { data: installation, error } = await supabase
    .from('github_installations')
    .select('*')
    .eq('installation_id', installationId)
    .single();

  if (error || !installation) {
    throw new InstallationNotFoundError(installationId);
  }

  // Check if suspended
  if (installation.suspended_at) {
    throw new GitHubAppError(
      `Installation ${installationId} is suspended`,
      'INSTALLATION_SUSPENDED',
      installationId
    );
  }

  // Validate with GitHub API
  const github = await getInstallation(installationId);

  // Validate permissions
  const permissionCheck = await validateInstallationPermissions(installationId);
  if (!permissionCheck.valid) {
    throw new InsufficientPermissionsError(installationId, permissionCheck.missing);
  }

  return {
    installation: installation as GitHubInstallation,
    github,
  };
}

/**
 * Sync user repositories from GitHub installation
 */
export async function syncUserRepositories(userId: string): Promise<GitHubRepository[]> {
  const installation = await getUserInstallation(userId);
  if (!installation) {
    throw new Error('No GitHub installation found for user');
  }

  // Get repositories from GitHub
  const githubRepos = await getInstallationRepositories(installation.installationId);

  // Sync to database
  const supabase = createClient();
  const repoData = githubRepos.map(repo => ({
    user_id: userId,
    installation_id: installation.installationId,
    github_repo_id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    is_private: repo.private,
    default_branch: repo.default_branch || 'main',
    language: repo.language,
    topics: repo.topics || [],
    stars_count: repo.stargazers_count || 0,
  }));

  // Upsert repositories (update or insert)
  const { data: syncedRepos, error } = await supabase
    .from('repositories')
    .upsert(repoData, {
      onConflict: 'installation_id,github_repo_id',
    })
    .select();

  if (error) {
    throw new Error(`Failed to sync repositories: ${error.message}`);
  }

  // Return in standard format
  return githubRepos.map(repo => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    private: repo.private,
    defaultBranch: repo.default_branch || 'main',
    language: repo.language || undefined,
    topics: repo.topics || [],
    stargazersCount: repo.stargazers_count || 0,
    updatedAt: repo.updated_at,
  }));
}

/**
 * Find installation for a specific repository
 */
export async function findInstallationForRepository(
  repositoryFullName: string
): Promise<GitHubInstallation | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('repositories')
    .select(`
      installation_id,
      github_installations!inner(*)
    `)
    .eq('full_name', repositoryFullName)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to find installation for repository: ${error.message}`);
  }

  return data?.github_installations as GitHubInstallation || null;
}

/**
 * Check if user has access to a repository
 */
export async function userHasRepositoryAccess(
  userId: string,
  repositoryFullName: string
): Promise<boolean> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('repositories')
    .select('id')
    .eq('user_id', userId)
    .eq('full_name', repositoryFullName)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to check repository access: ${error.message}`);
  }

  return !!data;
}

/**
 * Installation health check
 */
export async function checkInstallationHealth(installationId: number): Promise<{
  healthy: boolean;
  issues: string[];
  repositories: number;
  permissions: Record<string, string>;
}> {
  const issues: string[] = [];

  try {
    // Check GitHub API access
    const github = await getInstallation(installationId);
    
    // Check permissions
    const permissionCheck = await validateInstallationPermissions(installationId);
    if (!permissionCheck.valid) {
      issues.push(`Missing permissions: ${permissionCheck.missing.join(', ')}`);
    }

    // Check repository access
    const repositories = await getInstallationRepositories(installationId);

    // Check suspension
    if (github.suspended_at) {
      issues.push('Installation is suspended by GitHub');
    }

    return {
      healthy: issues.length === 0,
      issues,
      repositories: repositories.length,
      permissions: github.permissions,
    };
  } catch (error) {
    issues.push(`GitHub API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    return {
      healthy: false,
      issues,
      repositories: 0,
      permissions: {},
    };
  }
}

/**
 * Link GitHub user to dashboard account during OAuth flow
 */
export async function linkGitHubUser(
  userId: string,
  githubUserId: number,
  installationId: number
): Promise<void> {
  try {
    // Get installation details from GitHub
    const github = await getInstallation(installationId);
    
    // Store installation in database
    await upsertInstallation(userId, {
      installationId,
      targetType: github.target_type as 'User' | 'Organization',
      targetId: github.target_id,
      targetLogin: github.account.login,
      permissions: github.permissions,
      appId: github.app_id,
    });

    // Sync repositories
    await syncUserRepositories(userId);
  } catch (error) {
    throw new Error(`Failed to link GitHub user: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}