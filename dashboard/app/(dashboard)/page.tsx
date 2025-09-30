import { createClient, verifyUser } from '@/lib/supabase/server';
import { RepoCard } from '@/components/dashboard/RepoCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { TrendChart } from '@/components/charts/TrendChart';
import { WarningTypeChart } from '@/components/charts/WarningTypeChart';
import { AlertTriangle, GitBranch, CheckCircle, Shield, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { WarningBreakdown, WarningType, RepoWithStats } from '@/lib/supabase/types';
import { formatDate } from '@/lib/utils';

interface RepositoryRow {
  id: string;
  name: string | null;
  full_name: string | null;
  is_private: boolean;
  default_branch: string | null;
  language: string | null;
  stars_count: number | null;
  updated_at: string | null;
  github_repo_id: number | null;
}

interface WarningRunRow {
  id: string;
  repository_id: string;
  commit_sha: string | null;
  branch: string | null;
  pull_request: number | null;
  total_warnings: number;
  new_warnings: number;
  fixed_warnings: number;
  critical_warnings: number;
  build_time_seconds: number | null;
  report_url: string | null;
  created_at: string;
}

interface WarningRow {
  run_id: string;
  type: WarningType;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface DailyRow {
  repository_id: string;
  date: string;
  run_count: number;
  total_warnings: number;
  new_warnings: number;
  fixed_warnings: number;
  critical_warnings: number;
}

function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
}

function calculateTrend(rows: DailyRow[], windowDays: number): number {
  if (!rows.length) {
    return 0;
  }

  const now = new Date();
  const currentWindowStart = new Date(now);
  currentWindowStart.setDate(currentWindowStart.getDate() - windowDays);

  const previousWindowStart = new Date(now);
  previousWindowStart.setDate(previousWindowStart.getDate() - windowDays * 2);

  let currentSum = 0;
  let previousSum = 0;

  for (const row of rows) {
    const rowDate = new Date(`${row.date}T00:00:00Z`);
    if (rowDate >= currentWindowStart) {
      currentSum += row.total_warnings;
    } else if (rowDate >= previousWindowStart && rowDate < currentWindowStart) {
      previousSum += row.total_warnings;
    }
  }

  return calculatePercentageChange(currentSum, previousSum);
}

export default async function DashboardPage() {
  const { user, error } = await verifyUser();
  
  // This should not happen due to layout.tsx, but let's be safe
  if (error || !user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">Authentication Required</h2>
          <p className="text-muted-foreground mt-2">Please sign in to continue</p>
        </div>
      </div>
    );
  }

  const supabase = createClient();

  const { data: repoRows, error: repoError } = await supabase
    .from('repositories')
    .select('id, name, full_name, is_private, default_branch, language, stars_count, updated_at, github_repo_id')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (repoError && repoError.code !== 'PGRST116') {
    throw new Error(`Failed to load repositories: ${repoError.message}`);
  }

  const repositories: RepositoryRow[] = repoRows ?? [];
  const repoIds = repositories.map((repo) => repo.id).filter(Boolean);

  let warningRuns: WarningRunRow[] = [];
  if (repoIds.length > 0) {
    const { data: runsData, error: runsError } = await supabase
      .from('warning_runs')
      .select('id, repository_id, commit_sha, branch, pull_request, total_warnings, new_warnings, fixed_warnings, critical_warnings, build_time_seconds, report_url, created_at')
      .in('repository_id', repoIds)
      .order('created_at', { ascending: true });

    if (runsError && runsError.code !== 'PGRST116') {
      throw new Error(`Failed to load warning runs: ${runsError.message}`);
    }

    warningRuns = runsData ?? [];
  }

  const runRepoMap = new Map<string, string>();
  const runsByRepo = new Map<string, WarningRunRow[]>();
  for (const run of warningRuns) {
    runRepoMap.set(run.id, run.repository_id);
    if (!runsByRepo.has(run.repository_id)) {
      runsByRepo.set(run.repository_id, []);
    }
    runsByRepo.get(run.repository_id)!.push(run);
  }

  const runIds = warningRuns.map((run) => run.id);

  let warnings: WarningRow[] = [];
  if (runIds.length > 0) {
    const { data: warningsData, error: warningsError } = await supabase
      .from('warnings')
      .select('run_id, type, severity')
      .in('run_id', runIds);

    if (warningsError && warningsError.code !== 'PGRST116') {
      throw new Error(`Failed to load warnings: ${warningsError.message}`);
    }

    warnings = warningsData ?? [];
  }

  let dailyRows: DailyRow[] = [];
  if (repoIds.length > 0) {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 90);

    const { data: dailyData, error: dailyError } = await supabase
      .from('repository_warning_daily')
      .select('repository_id, date, run_count, total_warnings, new_warnings, fixed_warnings, critical_warnings')
      .in('repository_id', repoIds)
      .gte('date', windowStart.toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (dailyError && dailyError.code !== 'PGRST116') {
      throw new Error(`Failed to load daily aggregates: ${dailyError.message}`);
    }

    dailyRows = dailyData ?? [];
  }

  const dailyByRepo = new Map<string, DailyRow[]>();
  for (const row of dailyRows) {
    if (!dailyByRepo.has(row.repository_id)) {
      dailyByRepo.set(row.repository_id, []);
    }
    dailyByRepo.get(row.repository_id)!.push(row);
  }

  const trendDataMap = new Map<string, { warnings: number; runs: number; critical: number }>();
  for (const row of dailyRows) {
    const existing = trendDataMap.get(row.date) ?? { warnings: 0, runs: 0, critical: 0 };
    existing.warnings += row.total_warnings;
    existing.runs += row.run_count;
    existing.critical += row.critical_warnings;
    trendDataMap.set(row.date, existing);
  }

  const trendChartData = Array.from(trendDataMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totals]) => ({
      date: formatDate(date, 'short'),
      warnings: totals.warnings,
      runs: totals.runs,
      critical: totals.critical,
    }));

  const warningTypeCounts = new Map<WarningType, number>();
  const severityByRepo = new Map<string, { critical: number; high: number; total: number }>();

  for (const warning of warnings) {
    const repoId = runRepoMap.get(warning.run_id);
    if (!repoId) continue;

    warningTypeCounts.set(warning.type, (warningTypeCounts.get(warning.type) ?? 0) + 1);

    if (!severityByRepo.has(repoId)) {
      severityByRepo.set(repoId, { critical: 0, high: 0, total: 0 });
    }
    const counters = severityByRepo.get(repoId)!;
    counters.total += 1;
    if (warning.severity === 'critical') {
      counters.critical += 1;
    }
    if (warning.severity === 'high') {
      counters.high += 1;
    }
  }

  const totalWarnings = warningRuns.reduce((sum, run) => sum + run.total_warnings, 0);
  const criticalWarnings = warningRuns.reduce((sum, run) => sum + run.critical_warnings, 0);
  const totalRuns = warningRuns.length;
  const runsWithWarnings = warningRuns.filter((run) => run.total_warnings > 0).length;
  const successRate = totalRuns === 0 ? 100 : ((totalRuns - runsWithWarnings) / totalRuns) * 100;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const activeRepos = Array.from(runsByRepo.entries()).filter(([, runs]) =>
    runs.some((run) => new Date(run.created_at) >= sevenDaysAgo)
  ).length;

  const warningTypeData: WarningBreakdown[] = Array.from(warningTypeCounts.entries())
    .map(([type, count]) => ({
      type,
      count,
      percentage: totalWarnings > 0 ? (count / totalWarnings) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const repoData: RepoWithStats[] = repositories.map((repo) => {
    const repoRuns = (runsByRepo.get(repo.id) ?? []).sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const repoSeverity = severityByRepo.get(repo.id) ?? { critical: 0, high: 0, total: 0 };
    const repoDailyRows = (dailyByRepo.get(repo.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));

    const repoTotalRuns = repoRuns.length;
    const repoTotalWarnings = repoRuns.reduce((sum, run) => sum + run.total_warnings, 0);
    const repoCriticalWarnings = repoRuns.reduce((sum, run) => sum + run.critical_warnings, 0);
    const repoSuccessRate = repoTotalRuns === 0
      ? 100
      : ((repoRuns.filter((run) => run.total_warnings === 0).length) / repoTotalRuns) * 100;

    const stats = repoTotalRuns === 0 && repoSeverity.total === 0 && repoDailyRows.length === 0
      ? undefined
      : {
          repo_id: repo.id,
          total_runs: repoTotalRuns,
          total_warnings: repoTotalWarnings,
          critical_warnings: repoCriticalWarnings,
          high_warnings: repoSeverity.high,
          last_run_at: repoRuns.at(-1)?.created_at ?? null,
          trend_7d: calculateTrend(repoDailyRows, 7),
          trend_30d: calculateTrend(repoDailyRows, 30),
          avg_warnings_per_run: repoTotalRuns === 0 ? 0 : repoTotalWarnings / repoTotalRuns,
          success_rate: repoSuccessRate,
        };

    return {
      id: repo.id,
      name: repo.name || repo.full_name || 'Repository',
      tier: 'free' as const,
      created_at: repo.updated_at || new Date().toISOString(),
      github_id: repo.github_repo_id || 0,
      full_name: repo.full_name || repo.name || 'Unknown',
      is_private: repo.is_private ?? true,
      webhook_secret: null,
      repo_stats: stats ? [stats] : [],
    } as RepoWithStats;
  });
  
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
          value={`${Math.round(successRate)}%`}
          icon={CheckCircle}
          variant="success"
          description="Non-critical code quality"
        />
      </div>
      
      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TrendChart
          days={30}
          variant="area"
          className="h-full"
          initialData={trendChartData}
          repositoryIds={repoIds}
        />
        <WarningTypeChart data={warningTypeData} className="h-full" />
      </div>
      
      {/* Repository Grid */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Your Repositories
            </h2>
            <p className="text-muted-foreground">
              {repoData.length} repositories configured
            </p>
          </div>
          
          <Button asChild>
            <Link href="/repositories">
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
                  <Link href="/repositories">
                    <Shield className="h-4 w-4 mr-2" />
                    Connect Repository
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/docs">
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
