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
  const [reposResult, tokensResult] = await Promise.all([
    supabase
      .from('user_repos')
      .select(`
        repo_id,
        role,
        repos (
          id,
          name,
          full_name,
          tier,
          is_private,
          github_id,
          created_at
        )
      `)
      .eq('user_id', user.id)
      .order('repos(name)'),
      
    supabase
      .from('api_tokens')
      .select('id, name, last_used_at, created_at, expires_at')
      .order('created_at', { ascending: false })
  ]);

  const userRepos = reposResult.data || [];
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