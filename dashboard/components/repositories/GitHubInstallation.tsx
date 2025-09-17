/**
 * GitHub App installation component
 * Handles installation flow and repository connection
 */

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Github, ExternalLink, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface GitHubInstallation {
  id: string;
  installationId: number;
  targetLogin: string;
  targetType: 'User' | 'Organization';
  permissions: Record<string, string>;
  createdAt: string;
  suspendedAt?: string;
}

interface Repository {
  id: string;
  name: string;
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string;
  language?: string;
  starsCount: number;
}

export default function GitHubInstallation() {
  const [installation, setInstallation] = useState<GitHubInstallation | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const supabase = createClient();

  const normalizeInstallation = (row: any): GitHubInstallation => ({
    id: row.id,
    installationId: row.installation_id ?? row.installationId,
    targetLogin: row.target_login ?? row.targetLogin,
    targetType: row.target_type ?? row.targetType,
    permissions: row.permissions || {},
    createdAt: row.created_at ?? row.createdAt,
    suspendedAt: row.suspended_at ?? row.suspendedAt,
  });

  const normalizeRepository = (row: any): Repository => ({
    id: row.id || `${row.github_repo_id}`,
    name: row.name,
    fullName: row.full_name ?? row.fullName,
    isPrivate: row.is_private ?? row.isPrivate,
    defaultBranch: row.default_branch ?? row.defaultBranch ?? 'main',
    language: row.language ?? undefined,
    starsCount: row.stars_count ?? row.starsCount ?? 0,
  });

  // Load installation data
  useEffect(() => {
    loadInstallationData();
  }, []);

  // Handle URL parameters for installation callbacks
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const installationParam = urlParams.get('installation');
    const errorParam = urlParams.get('error');
    const messageParam = urlParams.get('message');

    if (installationParam === 'success') {
      setSuccess('GitHub App installed successfully! Your repositories are being synced.');
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      loadInstallationData();
    } else if (installationParam === 'updated') {
      setSuccess('Installation updated successfully!');
      window.history.replaceState({}, '', window.location.pathname);
      loadInstallationData();
    } else if (errorParam) {
      setError(messageParam || 'Installation failed. Please try again.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const loadInstallationData = async () => {
    try {
      setLoading(true);
      setError('');

      // Get user's GitHub installation
      const { data: installationData, error: installationError } = await supabase
        .from('github_installations')
        .select('*')
        .single();

      if (installationError && installationError.code !== 'PGRST116') {
        throw new Error(`Failed to load installation: ${installationError.message}`);
      }

      setInstallation(installationData ? normalizeInstallation(installationData) : null);

      // Get repositories if installation exists
      if (installationData) {
        const { data: reposData, error: reposError } = await supabase
          .from('repositories')
          .select('*')
          .eq('installation_id', installationData.installation_id)
          .order('name');

        if (reposError) {
          console.error('Failed to load repositories:', reposError);
          // Don't throw - installation data is more important
        } else {
          setRepositories((reposData || []).map(normalizeRepository));
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(errorMessage);
      console.error('Failed to load installation data:', error);
    } finally {
      setLoading(false);
    }
  };

  const resolveBasePath = () => {
    if (typeof window === 'undefined') {
      return '';
    }

    // Prefer build-time base path if exposed
    // @ts-ignore - Next.js injects runtime config for basePath
    const runtimeBase: string | undefined = window.__NEXT_DATA__?.config?.basePath;
    if (runtimeBase && runtimeBase !== '/') {
      return runtimeBase.replace(/\/$/, '');
    }

    // Fallback: infer from current pathname (e.g. /SwiftConcur/repositories)
    const pathname = window.location.pathname || '';
    const markers = ['/repositories', '/settings', '/profile', '/dashboard', '/billing'];
    for (const marker of markers) {
      const index = pathname.indexOf(marker);
      if (index > 0) {
        return pathname.slice(0, index);
      }
    }

    return '';
  };

  const buildCallbackUrl = () => {
    if (process.env.NEXT_PUBLIC_APP_URL) {
      return `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/github/install`;
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const basePath = resolveBasePath();
    return `${origin}${basePath}/api/github/install`;
  };

  const handleInstallApp = () => {
    // Generate installation URL
    const appSlug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'swiftconcur-ci';
    const callbackUrl = buildCallbackUrl();
    const installUrl = `https://github.com/apps/${appSlug}/installations/new?state=${encodeURIComponent(callbackUrl)}`;
    
    window.location.href = installUrl;
  };

  const handleSyncRepositories = async () => {
    try {
      setSyncing(true);
      setError('');
      setSuccess('');

      const basePath = resolveBasePath();
      const syncPath = `${basePath || ''}/api/github/sync`;

      const response = await fetch(syncPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        let message = 'Failed to sync repositories';
        try {
          const errorData = await response.clone().json();
          message = errorData.error || message;
        } catch {
          const raw = await response.text();
          if (raw) {
            message = raw.slice(0, 200);
          }
        }
        throw new Error(message);
      }

      setSuccess('Repositories synced successfully!');
      await loadInstallationData();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(`Sync failed: ${errorMessage}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleManageInstallation = () => {
    if (installation) {
      const installationId = (installation as any).installationId ?? (installation as any).installation_id;
      if (!installationId) {
        console.warn('No installationId available for management link');
        return;
      }
      const manageUrl = `https://github.com/settings/installations/${installationId}`;
      window.open(manageUrl, '_blank');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <RefreshCw className="w-6 h-6 animate-spin mr-2" />
          Loading GitHub integration...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Messages */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Installation Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="w-5 h-5" />
            GitHub Integration
          </CardTitle>
          <CardDescription>
            Connect your GitHub repositories to track Swift concurrency warnings
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!installation ? (
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                Install the SwiftConcur GitHub App to connect your repositories.
              </p>
              <Button onClick={handleInstallApp} size="lg">
                <Github className="w-4 h-4 mr-2" />
                Install GitHub App
              </Button>
              <p className="text-sm text-muted-foreground">
                This will redirect you to GitHub to authorize the app.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Installation Info */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={installation.suspendedAt ? 'destructive' : 'default'}>
                    {installation.suspendedAt ? 'Suspended' : 'Active'}
                  </Badge>
                  <span className="font-medium">
                    {installation.targetType === 'Organization' ? '🏢' : '👤'} {installation.targetLogin}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSyncRepositories}
                    disabled={syncing}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing...' : 'Sync Repos'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleManageInstallation}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Manage
                  </Button>
                </div>
              </div>

              {/* Permissions */}
              <div>
                <h4 className="text-sm font-medium mb-2">Permissions:</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(installation.permissions).map(([permission, level]) => (
                    <Badge key={permission} variant="secondary">
                      {permission}: {level}
                    </Badge>
                  ))}
                </div>
              </div>

              {installation.suspendedAt && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    This installation has been suspended. Please check your GitHub settings.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Repository List */}
      {installation && repositories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Connected Repositories ({repositories.length})</CardTitle>
            <CardDescription>
              Repositories with SwiftConcur analysis enabled
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {repositories.map((repo) => (
                <div
                  key={repo.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <div>
                      <div className="font-medium">{repo.fullName}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        {repo.isPrivate && <Badge variant="secondary">Private</Badge>}
                        {repo.language && <span>• {repo.language}</span>}
                        <span>• ⭐ {repo.starsCount}</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={`/repositories/${encodeURIComponent(repo.fullName)}`}
                      className="flex items-center gap-1"
                    >
                      View Details
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {installation && repositories.length === 0 && (
        <Card>
          <CardContent className="text-center p-8">
            <Github className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No Repositories Found</h3>
            <p className="text-muted-foreground mb-4">
              The GitHub App is installed but no repositories are connected yet.
            </p>
            <Button variant="outline" onClick={handleSyncRepositories}>
              Sync Repositories
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
