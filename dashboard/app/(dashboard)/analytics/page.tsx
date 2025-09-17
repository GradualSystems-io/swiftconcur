import { createClient, verifyUser } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { formatDate, formatNumber, formatRelativeTime, getSeverityBadgeVariant, cn } from '@/lib/utils';
import { WarningTypeChart } from '@/components/charts/WarningTypeChart';
import { WarningTrendChart } from '@/components/analytics/WarningTrendChart';
import { ArrowUpRight, Timer } from 'lucide-react';
import { WarningType } from '@/lib/supabase/types';

interface RepositoryRow {
  id: string;
  full_name: string;
  name: string | null;
  language: string | null;
  topics: string[] | null;
  is_private: boolean;
  stars_count: number | null;
  updated_at: string | null;
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
  created_at: string;
}

interface WarningRow {
  run_id: string;
  type: WarningType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  file_path: string;
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

function formatBuildTime(seconds: number | null): string {
  if (!seconds || seconds <= 0) {
    return '—';
  }
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes === 0) {
    return `${secs}s`;
  }
  return `${minutes}m ${secs.toString().padStart(2, '0')}s`;
}

function getHealthStatus(score: number): { label: string; variant: 'default' | 'secondary' | 'destructive' } {
  if (score >= 70) {
    return { label: 'Healthy', variant: 'default' };
  }
  if (score >= 40) {
    return { label: 'Watch', variant: 'secondary' };
  }
  return { label: 'At Risk', variant: 'destructive' };
}

function normalizeTrend(data: DailyRow[]): Record<string, { totalWarnings: number; newWarnings: number; fixedWarnings: number }> {
  return data.reduce<Record<string, { totalWarnings: number; newWarnings: number; fixedWarnings: number }>>((acc, row) => {
    const key = row.date;
    if (!acc[key]) {
      acc[key] = { totalWarnings: 0, newWarnings: 0, fixedWarnings: 0 };
    }
    acc[key].totalWarnings += row.total_warnings;
    acc[key].newWarnings += row.new_warnings;
    acc[key].fixedWarnings += row.fixed_warnings;
    return acc;
  }, {});
}

export default async function AnalyticsPage() {
  const { user, error } = await verifyUser();

  if (error || !user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold">Authentication Required</h2>
          <p className="text-muted-foreground">Please sign in to view analytics.</p>
          <Button asChild>
            <Link href="/auth/login">Go to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  const supabase = createClient();

  const { data: repoRows, error: repoError } = await supabase
    .from('repositories')
    .select('id, full_name, name, language, topics, is_private, stars_count, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (repoError && repoError.code !== 'PGRST116') {
    throw new Error(`Failed to load repositories: ${repoError.message}`);
  }

  const repositories: RepositoryRow[] = repoRows ?? [];
  const repoIds = repositories.map((repo) => repo.id);

  let warningRuns: WarningRunRow[] = [];
  if (repoIds.length > 0) {
    const { data: runsData, error: runsError } = await supabase
      .from('warning_runs')
      .select('id, repository_id, commit_sha, branch, pull_request, total_warnings, new_warnings, fixed_warnings, critical_warnings, build_time_seconds, created_at')
      .in('repository_id', repoIds)
      .order('created_at', { ascending: true });

    if (runsError && runsError.code !== 'PGRST116') {
      throw new Error(`Failed to load warning runs: ${runsError.message}`);
    }

    warningRuns = runsData ?? [];
  }

  const runIds = warningRuns.map((run) => run.id);

  let warnings: WarningRow[] = [];
  if (runIds.length > 0) {
    const { data: warningsData, error: warningsError } = await supabase
      .from('warnings')
      .select('run_id, type, severity, file_path')
      .in('run_id', runIds);

    if (warningsError && warningsError.code !== 'PGRST116') {
      throw new Error(`Failed to load warnings: ${warningsError.message}`);
    }

    warnings = warningsData ?? [];
  }

  let dailyRows: DailyRow[] = [];
  if (repoIds.length > 0) {
    const rollingWindow = new Date();
    rollingWindow.setDate(rollingWindow.getDate() - 90);

    const { data: dailyData, error: dailyError } = await supabase
      .from('repository_warning_daily')
      .select('repository_id, date, run_count, total_warnings, new_warnings, fixed_warnings, critical_warnings')
      .in('repository_id', repoIds)
      .gte('date', rollingWindow.toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (dailyError && dailyError.code !== 'PGRST116') {
      throw new Error(`Failed to load daily aggregates: ${dailyError.message}`);
    }

    dailyRows = dailyData ?? [];
  }

  const repoMap = new Map(repositories.map((repo) => [repo.id, repo]));

  const runsByRepo = new Map<string, WarningRunRow[]>();
  for (const run of warningRuns) {
    if (!runsByRepo.has(run.repository_id)) {
      runsByRepo.set(run.repository_id, []);
    }
    runsByRepo.get(run.repository_id)!.push(run);
  }
  for (const list of runsByRepo.values()) {
    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  const dailyByRepo = new Map<string, DailyRow[]>();
  for (const row of dailyRows) {
    if (!dailyByRepo.has(row.repository_id)) {
      dailyByRepo.set(row.repository_id, []);
    }
    dailyByRepo.get(row.repository_id)!.push(row);
  }
  for (const list of dailyByRepo.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  const totalsMap = normalizeTrend(dailyRows);
  const sortedDates = Object.keys(totalsMap).sort((a, b) => a.localeCompare(b));
  const trendChartData = sortedDates.map((dateKey) => ({
    date: formatDate(dateKey, 'short'),
    totalWarnings: totalsMap[dateKey].totalWarnings,
    newWarnings: totalsMap[dateKey].newWarnings,
    fixedWarnings: totalsMap[dateKey].fixedWarnings,
  }));

  const toDate = new Date();
  const last7Boundary = new Date();
  last7Boundary.setDate(toDate.getDate() - 7);
  const previous7Boundary = new Date();
  previous7Boundary.setDate(toDate.getDate() - 14);

  const last7Total = dailyRows
    .filter((row) => new Date(row.date) >= last7Boundary)
    .reduce((sum, row) => sum + row.total_warnings, 0);
  const previous7Total = dailyRows
    .filter((row) => {
      const date = new Date(row.date);
      return date >= previous7Boundary && date < last7Boundary;
    })
    .reduce((sum, row) => sum + row.total_warnings, 0);

  const totalWarningsCount = warningRuns.reduce((sum, run) => sum + run.total_warnings, 0);
  const totalRuns = warningRuns.length;
  const totalNewWarnings = warningRuns.reduce((sum, run) => sum + run.new_warnings, 0);
  const totalFixedWarnings = warningRuns.reduce((sum, run) => sum + run.fixed_warnings, 0);
  const averageBuildTimeSeconds = totalRuns > 0
    ? Math.round(
        warningRuns.reduce((sum, run) => sum + (run.build_time_seconds ?? 0), 0) / totalRuns
      )
    : 0;

  const trendChangePercentage = previous7Total === 0
    ? last7Total > 0 ? 100 : 0
    : ((last7Total - previous7Total) / previous7Total) * 100;

  const trendDirection: 'up' | 'down' | 'flat' = trendChangePercentage > 5
    ? 'up'
    : trendChangePercentage < -5
      ? 'down'
      : 'flat';

  const typeCounts = warnings.reduce<Record<WarningType, number>>((acc, warning) => {
    const type = warning.type ?? 'actor_isolation';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {
    actor_isolation: 0,
    sendable: 0,
    data_race: 0,
    performance: 0,
  });

  const totalTypedWarnings = Object.values(typeCounts).reduce((sum, value) => sum + value, 0);
  const warningBreakdown = totalTypedWarnings === 0
    ? []
    : (Object.entries(typeCounts) as [WarningType, number][]) 
        .filter(([, count]) => count > 0)
        .map(([type, count]) => ({
          type,
          count,
          percentage: (count / totalTypedWarnings) * 100,
        }));

  const fileCounts = warnings.reduce<Record<string, { count: number; severity: WarningRow['severity'] }>>((acc, warning) => {
    if (!acc[warning.file_path]) {
      acc[warning.file_path] = { count: 0, severity: warning.severity };
    }
    acc[warning.file_path].count += 1;
    const severity = acc[warning.file_path].severity;
    if (warning.severity === 'critical' || (warning.severity === 'high' && severity !== 'critical') || (warning.severity === 'medium' && !['critical', 'high'].includes(severity))) {
      acc[warning.file_path].severity = warning.severity;
    }
    return acc;
  }, {});

  const topWarningFiles = Object.entries(fileCounts)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 5);

  const repoHealth = repositories.map((repo) => {
    const repoRuns = runsByRepo.get(repo.id) ?? [];
    const repoDaily = dailyByRepo.get(repo.id) ?? [];

    const lastRun = repoRuns.length > 0 ? repoRuns[repoRuns.length - 1] : null;
    const totalRepoWarnings = repoDaily.reduce((sum, row) => sum + row.total_warnings, 0);
    const last7Warnings = repoDaily
      .filter((row) => new Date(row.date) >= last7Boundary)
      .reduce((sum, row) => sum + row.total_warnings, 0);
    const prev7Warnings = repoDaily
      .filter((row) => {
        const date = new Date(row.date);
        return date >= previous7Boundary && date < last7Boundary;
      })
      .reduce((sum, row) => sum + row.total_warnings, 0);

    const fixedInLast7 = repoDaily
      .filter((row) => new Date(row.date) >= last7Boundary)
      .reduce((sum, row) => sum + row.fixed_warnings, 0);

    const trendDelta = last7Warnings - prev7Warnings;
    let healthScore = 100;
    healthScore -= last7Warnings * 5;
    if (trendDelta > 0) {
      healthScore -= trendDelta * 4;
    } else {
      healthScore += Math.min(Math.abs(trendDelta) * 3, 20);
    }
    healthScore += Math.min(fixedInLast7 * 3, 15);
    healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

    const statusInfo = getHealthStatus(healthScore);

    return {
      repo,
      lastRun,
      lastRunLabel: lastRun ? formatRelativeTime(new Date(lastRun.created_at)) : 'No runs yet',
      totalWarnings: totalRepoWarnings,
      last7Warnings,
      trendDelta,
      healthScore,
      statusInfo,
    };
  });

  const recentRuns = warningRuns
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10)
    .map((run) => ({
      run,
      repo: repoMap.get(run.repository_id),
    }))
    .filter((item) => item.repo !== undefined);

  const summary = {
    totalRepositories: repositories.length,
    totalRuns,
    totalWarnings: totalWarningsCount,
    totalNewWarnings,
    totalFixedWarnings,
    averageBuildTimeSeconds,
  };

  const trendSummary = {
    totalWarnings: totalWarningsCount,
    changePercentage: trendChangePercentage,
    changeDirection: trendDirection,
    lastPeriodTotal: previous7Total,
    currentPeriodTotal: last7Total,
  } as const;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Track Swift concurrency health across your repositories. These insights aggregate SwiftConcur runs to highlight warning trends, severity distribution, and repository health.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/docs">
            Learn how SwiftConcur collects analytics
            <ArrowUpRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Connected Repositories</CardTitle>
            <CardDescription>GitHub projects with SwiftConcur enabled</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{formatNumber(summary.totalRepositories)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">SwiftConcur Runs</CardTitle>
            <CardDescription>Total analyses recorded</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{formatNumber(summary.totalRuns)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Warnings Resolved (7d)</CardTitle>
            <CardDescription>Fixed warnings across all repositories</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-green-600 dark:text-green-400">
            {formatNumber(summary.totalFixedWarnings)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Build Time</CardTitle>
            <CardDescription>Per SwiftConcur analysis run</CardDescription>
          </CardHeader>
          <CardContent className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold">{formatBuildTime(summary.averageBuildTimeSeconds)}</span>
            <Badge variant="outline" className="text-xs gap-1">
              <Timer className="h-3 w-3" />
              Build duration
            </Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <WarningTrendChart data={trendChartData} summary={trendSummary} />
        <WarningTypeChart data={warningBreakdown} title="Warning Type Distribution" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Repository Health</CardTitle>
            <CardDescription>Swift concurrency posture across your connected repositories</CardDescription>
          </CardHeader>
          <CardContent>
            {repoHealth.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Connect a repository to start tracking health metrics.
              </p>
            ) : (
              <div className="space-y-4">
                {repoHealth.map(({ repo, lastRunLabel, totalWarnings, last7Warnings, trendDelta, healthScore, statusInfo }) => (
                  <div key={repo.id} className="flex flex-col gap-2 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Link href={`/repositories/${encodeURIComponent(repo.full_name)}`} className="text-sm font-semibold hover:underline">
                          {repo.full_name}
                        </Link>
                        <p className="text-xs text-muted-foreground">Last run: {lastRunLabel}</p>
                      </div>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Warnings (30d)</p>
                        <p className="font-medium">{formatNumber(totalWarnings)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Last 7 days</p>
                        <p className="font-medium">{formatNumber(last7Warnings)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Trend vs prev 7d</p>
                        <p className={cn('font-medium', trendDelta > 0 ? 'text-red-600' : trendDelta < 0 ? 'text-green-600' : 'text-muted-foreground')}>
                          {trendDelta > 0 ? '+' : ''}{formatNumber(trendDelta)}
                        </p>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary transition-all"
                        style={{ width: `${healthScore}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Health score: {healthScore}/100</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Warning Hotspots</CardTitle>
            <CardDescription>Files triggering the most Swift concurrency warnings</CardDescription>
          </CardHeader>
          <CardContent>
            {topWarningFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No warning findings yet. Great job!
              </p>
            ) : (
              <div className="space-y-3">
                {topWarningFiles.map(([file, info]) => {
                  const filename = file.split('/').pop() ?? file;
                  return (
                    <div key={file} className="flex items-center justify-between gap-2 rounded border p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{filename}</p>
                        <p className="truncate text-xs text-muted-foreground">{file}</p>
                      </div>
                      <Badge variant={getSeverityBadgeVariant(info.severity)}>{formatNumber(info.count)}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent SwiftConcur Runs</CardTitle>
          <CardDescription>Audit trail of the latest GitHub analyses</CardDescription>
        </CardHeader>
        <CardContent>
          {recentRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No analyses have been recorded yet. Once your GitHub Action runs, results will appear here.
            </p>
          ) : (
            <div className="space-y-3">
              {recentRuns.map(({ run, repo }) => {
                if (!repo) return null;
                const runStatusVariant = run.total_warnings === 0 ? 'default' : 'destructive';
                const shortSha = run.commit_sha ? run.commit_sha.slice(0, 7) : '—';
                return (
                  <div key={run.id} className="grid gap-2 rounded border px-4 py-3 sm:grid-cols-[2fr,1fr,1fr,1fr] sm:items-center">
                    <div className="space-y-1">
                      <Link href={`/repositories/${encodeURIComponent(repo.full_name)}`} className="text-sm font-medium hover:underline">
                        {repo.full_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {run.branch ?? 'unknown'} • {shortSha} • {formatRelativeTime(new Date(run.created_at))}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Warnings</p>
                      <Badge variant={runStatusVariant}>{formatNumber(run.total_warnings)}</Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">New / Fixed</p>
                      <p className="text-sm font-medium">
                        +{formatNumber(run.new_warnings)} / -{formatNumber(run.fixed_warnings)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Build time</p>
                      <p className="text-sm font-medium">{formatBuildTime(run.build_time_seconds)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
