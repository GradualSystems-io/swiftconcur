import { createClient, verifyUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NotificationSettings } from './components/NotificationSettings';
import { ApiTokenManagement } from './components/ApiTokenManagement';
import { RepositoryManagement } from './components/RepositoryManagement';
import { ThemeSettings } from './components/ThemeSettings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings, Bell, Key, GitBranch, Palette } from 'lucide-react';

export default async function SettingsPage() {
  const { user, error } = await verifyUser();
  
  if (error || !user) {
    redirect('/auth/login');
  }

  const supabase = createClient();
  
  // Get user's repositories and API tokens
  const { data: installation } = await supabase
    .from('github_installations')
    .select('installation_id, target_login')
    .eq('user_id', user.id)
    .maybeSingle();

  const repoFilters = [`user_id.eq.${user.id}`];
  if (installation?.installation_id) {
    repoFilters.push(`installation_id.eq.${installation.installation_id}`);
  }

  let repoQuery = supabase
    .from('repositories')
    .select(`
      id,
      name,
      full_name,
      tier,
      is_private,
      github_repo_id,
      created_at,
      user_id,
      installation_id
    `)
    .order('name', { ascending: true });

  if (repoFilters.length === 1) {
    repoQuery = repoQuery.eq('user_id', user.id);
  } else {
    repoQuery = repoQuery.or(repoFilters.join(','));
  }

  const [reposResult, tokensResult] = await Promise.all([
    repoQuery,
      
    supabase
      .from('api_tokens')
      .select('id, name, last_used_at, created_at, expires_at')
      .order('created_at', { ascending: false })
  ]);

  const userRepos = (reposResult.data || []).map((repo) => ({
    repo_id: repo.id,
    role: repo.user_id === user.id ? ('owner' as const) : ('read' as const),
    repos: {
      id: repo.id,
      name: repo.name ?? repo.full_name ?? 'Repository',
      full_name: repo.full_name ?? repo.name ?? 'Repository',
      tier: repo.tier ?? 'free',
      is_private: repo.is_private ?? false,
      github_id: repo.github_repo_id ?? null,
      created_at: repo.created_at,
    },
  }));
  const apiTokens = tokensResult.data || [];
  
  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your application preferences and configuration
        </p>
      </div>

      {/* Repository Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Repository Management
          </CardTitle>
          <CardDescription>
            Connect and manage your repositories for Swift concurrency monitoring
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RepositoryManagement 
            userRepos={userRepos}
            user={user}
          />
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>
            Configure how and when you receive notifications about your repositories
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationSettings user={user} />
        </CardContent>
      </Card>

      {/* API Token Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Tokens
          </CardTitle>
          <CardDescription>
            Manage API tokens for automated access to SwiftConcur
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApiTokenManagement 
            tokens={apiTokens}
            userRepos={userRepos}
          />
        </CardContent>
      </Card>

      {/* Theme & Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Theme & Appearance
          </CardTitle>
          <CardDescription>
            Customize the appearance of your dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSettings />
        </CardContent>
      </Card>
    </div>
  );
}
