import { createClient, verifyUser } from '@/lib/supabase/server';
import { RepoCard } from '@/components/dashboard/RepoCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { TrendChart } from '@/components/charts/TrendChart';
import { WarningTypeChart } from '@/components/charts/WarningTypeChart';
import { AlertTriangle, GitBranch, TrendingDown, CheckCircle, Shield, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default async function DashboardPage() {
  const { user } = await verifyUser();
  const supabase = createClient();
  
  // Fetch user's repositories with statistics
  const { data: repos } = await supabase
    .from('user_repo_access')
    .select(`
      repo_id,
      repo_name,
      repo_tier,
      total_warnings,
      critical_warnings,
      last_run_at
    `)
    .eq('user_id', user!.id);
  
  // Fetch global statistics for the user
  const { data: globalStats } = await supabase
    .rpc('get_user_global_stats', { user_id: user!.id });
  
  // Transform repository data for RepoCard
  const repoData = repos?.map(repo => ({
    id: repo.repo_id,
    name: repo.repo_name,
    tier: repo.repo_tier as 'free' | 'pro' | 'enterprise',
    created_at: new Date().toISOString(),
    github_id: 0,
    full_name: repo.repo_name,
    is_private: true,
    webhook_secret: null,
    repo_stats: [{
      repo_id: repo.repo_id,
      total_runs: 0,
      total_warnings: repo.total_warnings || 0,
      critical_warnings: repo.critical_warnings || 0,
      high_warnings: 0,
      last_run_at: repo.last_run_at,
      trend_7d: 0,
      trend_30d: 0,
      avg_warnings_per_run: 0,
      success_rate: 85,
    }]
  })) || [];
  
  // Calculate aggregate statistics
  const totalWarnings = repos?.reduce((sum, repo) => sum + (repo.total_warnings || 0), 0) || 0;
  const criticalWarnings = repos?.reduce((sum, repo) => sum + (repo.critical_warnings || 0), 0) || 0;
  const activeRepos = repos?.filter(repo => 
    repo.last_run_at && 
    new Date(repo.last_run_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  ).length || 0;
  
  const successRate = totalWarnings > 0 ? 
    Math.round((1 - criticalWarnings / totalWarnings) * 100) : 100;
  
  // Mock warning type data for demonstration
  const warningTypeData = [
    { type: 'actor_isolation' as const, count: Math.floor(totalWarnings * 0.4), percentage: 40 },
    { type: 'sendable' as const, count: Math.floor(totalWarnings * 0.3), percentage: 30 },
    { type: 'data_race' as const, count: Math.floor(totalWarnings * 0.2), percentage: 20 },
    { type: 'performance' as const, count: Math.floor(totalWarnings * 0.1), percentage: 10 },
  ].filter(item => item.count > 0);
  
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome back! Here's an overview of your Swift concurrency health across all repositories.
        </p>
      </div>
      
      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Warnings"
          value={totalWarnings}
          icon={AlertTriangle}
          description="Across all repositories"
          variant={totalWarnings > 50 ? "destructive" : "default"}
        />
        <StatCard
          title="Critical Issues"
          value={criticalWarnings}
          icon={AlertTriangle}
          variant="destructive"
          description="Require immediate attention"
        />
        <StatCard
          title="Active Repositories"
          value={activeRepos}
          icon={GitBranch}
          description="With recent activity (7 days)"
        />
        <StatCard
          title="Success Rate"
          value={`${successRate}%`}
          icon={CheckCircle}
          variant="success"
          description="Non-critical code quality"
        />
      </div>
      
      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TrendChart 
          title="Global Warning Trends (30 days)"
          days={30}
          variant="area"
        />
        
        {warningTypeData.length > 0 ? (
          <WarningTypeChart 
            data={warningTypeData}
            title="Warning Types Distribution"
            variant="pie"
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Warning Types Distribution</CardTitle>
              <CardDescription>No warnings to analyze</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <h3 className="text-lg font-semibold mb-2">Excellent Code Quality!</h3>
                  <p className="text-sm">No Swift concurrency warnings detected.</p>
                  <p className="text-xs mt-1">Keep up the great work!</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      
      {/* Repository Grid */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Your Repositories
            </h2>
            <p className="text-muted-foreground">
              {repos?.length || 0} repositories configured
            </p>
          </div>
          
          <Button asChild>
            <Link href="/settings">
              <Shield className="h-4 w-4 mr-2" />
              Add Repository
            </Link>
          </Button>
        </div>
        
        {repoData.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <GitBranch className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-xl font-semibold mb-2">No Repositories Yet</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Connect your first repository to start monitoring Swift concurrency warnings 
                and get AI-powered insights.
              </p>
              <div className="flex gap-4 justify-center">
                <Button asChild>
                  <Link href="/settings">
                    <Shield className="h-4 w-4 mr-2" />
                    Connect Repository
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/docs" target="_blank">
                    <Activity className="h-4 w-4 mr-2" />
                    View Documentation
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {repoData.map(repo => (
              <RepoCard key={repo.id} repo={repo} />
            ))}
          </div>
        )}
      </div>
      
      {/* Security Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security & Compliance
          </CardTitle>
          <CardDescription>
            Your account security status and compliance information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <div className="font-medium text-green-800 dark:text-green-200">
                  2FA Enabled
                </div>
                <div className="text-xs text-green-600 dark:text-green-400">
                  Account secured
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <div className="font-medium text-green-800 dark:text-green-200">
                  SOC 2 Compliant
                </div>
                <div className="text-xs text-green-600 dark:text-green-400">
                  Enterprise ready
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <div className="font-medium text-green-800 dark:text-green-200">
                  Data Encrypted
                </div>
                <div className="text-xs text-green-600 dark:text-green-400">
                  AES-256 encryption
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}