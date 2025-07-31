# Phase 4: Next.js Dashboard - Enhanced Implementation Guide

## Overview
Build a modern dashboard using Next.js 14 with App Router, hosted on Cloudflare Pages. Features real-time updates via Supabase subscriptions, comprehensive trend visualizations, and mobile-responsive design.

## Stack
- **Next.js 14** (app router) for the framework
- **shadcn/ui** for component library
- **TanStack Query** for data fetching
- **Recharts** for data visualization
- **Supabase** for real-time data
- **Cloudflare Pages** for hosting

## Project Structure
```
dashboard/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Dashboard home
│   │   ├── r/
│   │   │   └── [repoId]/
│   │   │       ├── page.tsx      # Repo overview
│   │   │       ├── run/
│   │   │       │   └── [runId]/
│   │   │       │       └── page.tsx  # Run detail
│   │   │       └── loading.tsx
│   │   ├── settings/
│   │   │   └── page.tsx
│   │   └── billing/
│   │       └── page.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   └── callback/
│   │   │       └── route.ts
│   │   ├── export/
│   │   │   └── route.ts
│   │   └── badge/
│   │       └── [repoId]/
│   │           └── route.ts
│   ├── layout.tsx
│   └── page.tsx                  # Landing page
├── components/
│   ├── charts/
│   │   ├── TrendChart.tsx       # 30/90d sparkline
│   │   ├── WarningTypeChart.tsx  # Pie chart breakdown
│   │   ├── QualityGate.tsx      # Red/Yellow/Green banner
│   │   └── ComparisonChart.tsx  # Branch comparison
│   ├── ui/                      # shadcn/ui components
│   ├── dashboard/
│   │   ├── RepoCard.tsx
│   │   ├── StatCard.tsx
│   │   ├── WarningsList.tsx
│   │   ├── FileTree.tsx         # File tree filter
│   │   └── CreateTicketButton.tsx
│   └── layout/
│       ├── Header.tsx
│       ├── Sidebar.tsx
│       └── PublicBadge.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   ├── types.ts
│   │   └── realtime.ts          # Real-time subscriptions
│   ├── utils/
│   │   ├── format.ts
│   │   ├── export.ts            # CSV/PDF generation
│   │   └── badge.ts             # SVG badge generation
│   └── hooks/
│       ├── useWarnings.ts
│       ├── useRepositories.ts
│       ├── useRealtime.ts
│       └── useQualityGate.ts
├── public/
│   └── badge-template.svg
├── styles/
│   └── globals.css
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## Routes & Features

| Path | Component | Notes |
|------|-----------|-------|
| `/` | Home | List authorized repos + quick stats |
| `/r/[repoId]` | Repo Overview | Sparkline (30/90d), table of latest runs, Quality Gate banner (green/yellow/red) |
| `/r/[repoId]/run/[runId]` | Run Detail | File-tree filter ↔ warning list, AI summary, "Create Ticket" button |
| `/settings` | Settings | Account, webhook URLs, billing link |

## Implementation Steps

### 1. Initialize Next.js Project with Cloudflare Pages
```bash
npx create-next-app@latest dashboard \
  --typescript \
  --tailwind \
  --app \
  --src-dir=false \
  --import-alias "@/*"

cd dashboard

# Install dependencies
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs
npm install @tanstack/react-query recharts react-hook-form zod
npm install date-fns lucide-react
npm install jspdf html2canvas papaparse
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu

# Install shadcn/ui
npx shadcn-ui@latest init
# Choose: New York style, Zinc color, CSS variables

# Add shadcn components
npx shadcn-ui@latest add button card dialog dropdown-menu
npx shadcn-ui@latest add switch badge skeleton toast
npx shadcn-ui@latest add table tabs separator
```

### 2. Environment Configuration (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8787
NEXT_PUBLIC_GITHUB_APP_NAME=swiftconcur-ci
```

### 3. Database Types (lib/supabase/types.ts)
```typescript
export type Database = {
  public: {
    Tables: {
      repos: {
        Row: {
          id: string;
          name: string;
          tier: 'free' | 'pro' | 'enterprise';
          created_at: string;
        };
        Insert: Omit<Row, 'id' | 'created_at'>;
        Update: Partial<Insert>;
      };
      runs: {
        Row: {
          id: string;
          repo_id: string;
          created_at: string;
          warnings_count: number;
          ai_summary: string | null;
          commit_sha: string;
          branch: string;
          pull_request: number | null;
        };
      };
      warnings: {
        Row: {
          id: string;
          run_id: string;
          file_path: string;
          line: number;
          column: number | null;
          type: 'actor_isolation' | 'sendable' | 'data_race' | 'performance';
          severity: 'critical' | 'high' | 'medium' | 'low';
          message: string;
          code_context: {
            before: string[];
            line: string;
            after: string[];
          };
          suggested_fix: string | null;
        };
      };
      repo_warning_daily: {
        Row: {
          repo_id: string;
          date: string;
          run_count: number;
          total_warnings: number;
          avg_warnings: number;
        };
      };
    };
    Views: {
      repo_stats: {
        Row: {
          repo_id: string;
          total_runs: number;
          total_warnings: number;
          critical_warnings: number;
          last_run_at: string;
          trend_7d: number; // percentage change
          trend_30d: number;
        };
      };
    };
  };
};

export type Repo = Database['public']['Tables']['repos']['Row'];
export type Run = Database['public']['Tables']['runs']['Row'];
export type Warning = Database['public']['Tables']['warnings']['Row'];
```

### 4. Supabase Client Configuration

#### Browser Client (lib/supabase/client.ts)
```typescript
import { createBrowserClient } from '@supabase/ssr';
import { Database } from './types';

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (client) return client;
  
  client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  return client;
}
```

#### Server Client (lib/supabase/server.ts)
```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from './types';

export function createClient() {
  const cookieStore = cookies();
  
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Handle the case where cookies can't be set (e.g., in Server Components)
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // Handle the case where cookies can't be set
          }
        },
      },
    }
  );
}
```

### 5. Real-time Subscriptions (lib/supabase/realtime.ts)
```typescript
import { createClient } from './client';
import { RealtimeChannel } from '@supabase/supabase-js';

export function subscribeToRepo(
  repoId: string,
  onNewRun: (run: any) => void
): RealtimeChannel {
  const supabase = createClient();
  
  const channel = supabase
    .channel(`runs:repo_id=eq.${repoId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'runs',
        filter: `repo_id=eq.${repoId}`,
      },
      (payload) => {
        onNewRun(payload.new);
      }
    )
    .subscribe();
  
  return channel;
}

export function unsubscribe(channel: RealtimeChannel) {
  channel.unsubscribe();
}
```

### 6. Root Layout with Providers (app/layout.tsx)
```tsx
import './globals.css';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'SwiftConcur CI - Swift Concurrency Warning Tracker',
  description: 'Track Swift 6 concurrency warnings across your repositories',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full`}>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
```

### 7. Dashboard Layout (app/(dashboard)/layout.tsx)
```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/login');
  }
  
  // Get user's repositories for sidebar
  const { data: repos } = await supabase
    .from('repos')
    .select('id, name')
    .order('name');
  
  return (
    <div className="min-h-screen bg-background">
      <Header user={user} />
      <div className="flex h-[calc(100vh-3.5rem)]">
        <Sidebar repos={repos || []} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-6 max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
```

### 8. Dashboard Home Page (app/(dashboard)/page.tsx)
```tsx
import { createClient } from '@/lib/supabase/server';
import { RepoCard } from '@/components/dashboard/RepoCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { TrendChart } from '@/components/charts/TrendChart';
import { AlertTriangle, GitBranch, TrendingDown, CheckCircle } from 'lucide-react';

export default async function DashboardPage() {
  const supabase = createClient();
  
  // Fetch repositories with stats
  const { data: repos } = await supabase
    .from('repos')
    .select(`
      *,
      repo_stats (*)
    `);
  
  // Calculate aggregate stats
  const totalWarnings = repos?.reduce((sum, repo) => 
    sum + (repo.repo_stats?.[0]?.total_warnings || 0), 0
  ) || 0;
  
  const criticalWarnings = repos?.reduce((sum, repo) => 
    sum + (repo.repo_stats?.[0]?.critical_warnings || 0), 0
  ) || 0;
  
  const activeRepos = repos?.filter(repo => 
    repo.repo_stats?.[0]?.last_run_at && 
    new Date(repo.repo_stats[0].last_run_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  ).length || 0;
  
  const avgTrend = repos?.reduce((sum, repo) => 
    sum + (repo.repo_stats?.[0]?.trend_7d || 0), 0
  ) / (repos?.length || 1);
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Overview of Swift concurrency warnings across your repositories
        </p>
      </div>
      
      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Warnings"
          value={totalWarnings.toLocaleString()}
          icon={AlertTriangle}
          trend={avgTrend}
          description="Across all repositories"
        />
        <StatCard
          title="Critical Issues"
          value={criticalWarnings.toLocaleString()}
          icon={AlertTriangle}
          variant="destructive"
          description="Require immediate attention"
        />
        <StatCard
          title="Active Repos"
          value={activeRepos}
          icon={GitBranch}
          description="With recent activity"
        />
        <StatCard
          title="Success Rate"
          value={`${Math.round((1 - criticalWarnings / Math.max(totalWarnings, 1)) * 100)}%`}
          icon={CheckCircle}
          variant="success"
          description="Non-critical warnings"
        />
      </div>
      
      {/* Trend Chart */}
      <TrendChart />
      
      {/* Repository Grid */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-4">
          Your Repositories
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {repos?.map(repo => (
            <RepoCard key={repo.id} repo={repo} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

### 9. Repository Overview Page (app/(dashboard)/r/[repoId]/page.tsx)
```tsx
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { QualityGate } from '@/components/charts/QualityGate';
import { TrendChart } from '@/components/charts/TrendChart';
import { RunsTable } from '@/components/dashboard/RunsTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GitBranch, Clock, ExternalLink } from 'lucide-react';

export default async function RepoPage({ 
  params 
}: { 
  params: { repoId: string } 
}) {
  const supabase = createClient();
  
  // Fetch repository with recent runs
  const { data: repo } = await supabase
    .from('repos')
    .select(`
      *,
      runs (
        *,
        warnings (severity)
      )
    `)
    .eq('id', params.repoId)
    .order('created_at', { 
      foreignTable: 'runs', 
      ascending: false 
    })
    .limit(10, { foreignTable: 'runs' })
    .single();
  
  if (!repo) {
    notFound();
  }
  
  // Calculate quality gate status
  const latestRun = repo.runs[0];
  const criticalCount = latestRun?.warnings.filter(w => w.severity === 'critical').length || 0;
  const qualityStatus = criticalCount > 0 ? 'red' : 
                       latestRun?.warnings_count > 10 ? 'yellow' : 'green';
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{repo.name}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <Badge variant={repo.tier === 'free' ? 'secondary' : 'default'}>
              {repo.tier.toUpperCase()}
            </Badge>
            {latestRun && (
              <>
                <span className="flex items-center gap-1">
                  <GitBranch className="w-4 h-4" />
                  {latestRun.branch}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {new Date(latestRun.created_at).toLocaleDateString()}
                </span>
              </>
            )}
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a 
              href={`${process.env.NEXT_PUBLIC_APP_URL}/badge/${repo.id}.svg`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Get Badge
            </a>
          </Button>
        </div>
      </div>
      
      {/* Quality Gate */}
      <QualityGate 
        status={qualityStatus}
        warningsCount={latestRun?.warnings_count || 0}
        criticalCount={criticalCount}
      />
      
      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TrendChart repoId={repo.id} days={30} />
        <TrendChart repoId={repo.id} days={90} />
      </div>
      
      {/* Recent Runs Table */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-4">
          Recent Runs
        </h2>
        <RunsTable runs={repo.runs} repoId={repo.id} />
      </div>
    </div>
  );
}
```

### 10. Run Detail Page (app/(dashboard)/r/[repoId]/run/[runId]/page.tsx)
```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { FileTree } from '@/components/dashboard/FileTree';
import { WarningsList } from '@/components/dashboard/WarningsList';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, GitPullRequest, Bot } from 'lucide-react';
import { useState } from 'react';

export default function RunDetailPage({ 
  params 
}: { 
  params: { repoId: string; runId: string } 
}) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const supabase = createClient();
  
  const { data: run, isLoading } = useQuery({
    queryKey: ['run', params.runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('runs')
        .select(`
          *,
          warnings (*),
          repos (name, tier)
        `)
        .eq('id', params.runId)
        .single();
      
      if (error) throw error;
      return data;
    },
  });
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  if (!run) {
    return <div>Run not found</div>;
  }
  
  // Build file tree from warnings
  const files = [...new Set(run.warnings.map(w => w.file_path))];
  const filteredWarnings = selectedFile 
    ? run.warnings.filter(w => w.file_path === selectedFile)
    : run.warnings;
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Run Details
          </h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span>Commit: {run.commit_sha.substring(0, 7)}</span>
            <span>Branch: {run.branch}</span>
            {run.pull_request && (
              <span className="flex items-center gap-1">
                <GitPullRequest className="w-4 h-4" />
                PR #{run.pull_request}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            Create Ticket
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/export?run=${run.id}&format=csv`} download>
              <Download className="w-4 h-4 mr-2" />
              Export
            </a>
          </Button>
        </div>
      </div>
      
      {/* AI Summary (Pro/Enterprise only) */}
      {run.ai_summary && run.repos.tier !== 'free' && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="w-5 h-5" />
            <h2 className="text-lg font-semibold">AI Summary</h2>
          </div>
          <div className="prose prose-sm max-w-none">
            {run.ai_summary}
          </div>
        </Card>
      )}
      
      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* File Tree */}
        <Card className="p-4 h-fit">
          <h3 className="font-semibold mb-4">Files</h3>
          <FileTree 
            files={files}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            warningCounts={run.warnings.reduce((acc, w) => {
              acc[w.file_path] = (acc[w.file_path] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)}
          />
        </Card>
        
        {/* Warnings */}
        <div>
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">
                All ({run.warnings.length})
              </TabsTrigger>
              <TabsTrigger value="critical">
                Critical ({run.warnings.filter(w => w.severity === 'critical').length})
              </TabsTrigger>
              <TabsTrigger value="high">
                High ({run.warnings.filter(w => w.severity === 'high').length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="all" className="mt-4">
              <WarningsList warnings={filteredWarnings} />
            </TabsContent>
            
            <TabsContent value="critical" className="mt-4">
              <WarningsList 
                warnings={filteredWarnings.filter(w => w.severity === 'critical')} 
              />
            </TabsContent>
            
            <TabsContent value="high" className="mt-4">
              <WarningsList 
                warnings={filteredWarnings.filter(w => w.severity === 'high')} 
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
```

### 11. Key Components

#### Quality Gate Component (components/charts/QualityGate.tsx)
```tsx
import { Card } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface QualityGateProps {
  status: 'green' | 'yellow' | 'red';
  warningsCount: number;
  criticalCount: number;
}

export function QualityGate({ status, warningsCount, criticalCount }: QualityGateProps) {
  const config = {
    green: {
      bg: 'bg-green-50 dark:bg-green-950',
      border: 'border-green-200 dark:border-green-800',
      text: 'text-green-800 dark:text-green-200',
      icon: CheckCircle,
      message: 'All checks passed',
    },
    yellow: {
      bg: 'bg-yellow-50 dark:bg-yellow-950',
      border: 'border-yellow-200 dark:border-yellow-800',
      text: 'text-yellow-800 dark:text-yellow-200',
      icon: AlertTriangle,
      message: 'Warnings detected',
    },
    red: {
      bg: 'bg-red-50 dark:bg-red-950',
      border: 'border-red-200 dark:border-red-800',
      text: 'text-red-800 dark:text-red-200',
      icon: XCircle,
      message: 'Critical issues found',
    },
  };
  
  const { bg, border, text, icon: Icon, message } = config[status];
  
  return (
    <Card className={`${bg} ${border} border-2 p-6`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className={`w-8 h-8 ${text}`} />
          <div>
            <h3 className={`text-lg font-semibold ${text}`}>{message}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {warningsCount} total warnings, {criticalCount} critical
            </p>
          </div>
        </div>
        <div className={`text-3xl font-bold ${text}`}>
          {status.toUpperCase()}
        </div>
      </div>
    </Card>
  );
}
```

#### Trend Chart with Real-time Updates (components/charts/TrendChart.tsx)
```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { useRealtime } from '@/lib/hooks/useRealtime';

interface TrendChartProps {
  repoId?: string;
  days?: 7 | 30 | 90;
}

export function TrendChart({ repoId, days = 30 }: TrendChartProps) {
  const supabase = createClient();
  
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['trend', repoId, days],
    queryFn: async () => {
      let query = supabase
        .from('repo_warning_daily')
        .select('*')
        .gte('date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
        .order('date', { ascending: true });
      
      if (repoId) {
        query = query.eq('repo_id', repoId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      return data.map(row => ({
        date: new Date(row.date).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        }),
        warnings: row.total_warnings,
        runs: row.run_count,
      }));
    },
  });
  
  // Subscribe to real-time updates
  useRealtime(repoId, () => refetch());
  
  if (isLoading) {
    return <Card className="h-[400px] animate-pulse" />;
  }
  
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">
        Warning Trends ({days} days)
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis 
            dataKey="date" 
            className="text-xs"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
          />
          <YAxis 
            className="text-xs"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'hsl(var(--background))',
              border: '1px solid hsl(var(--border))',
            }}
          />
          <Line 
            type="monotone" 
            dataKey="warnings" 
            stroke="hsl(var(--destructive))" 
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
```

#### Public Badge Generator (app/api/badge/[repoId]/route.ts)
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { repoId: string } }
) {
  const supabase = createClient();
  
  // Get latest run for repo
  const { data: run } = await supabase
    .from('runs')
    .select('warnings_count, warnings(severity)')
    .eq('repo_id', params.repoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (!run) {
    return new NextResponse('Not Found', { status: 404 });
  }
  
  const criticalCount = run.warnings.filter(w => w.severity === 'critical').length;
  const color = criticalCount > 0 ? 'red' : 
                run.warnings_count > 10 ? 'yellow' : 'green';
  
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="20">
      <linearGradient id="b" x2="0" y2="100%">
        <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
        <stop offset="1" stop-opacity=".1"/>
      </linearGradient>
      <clipPath id="a">
        <rect width="200" height="20" rx="3" fill="#fff"/>
      </clipPath>
      <g clip-path="url(#a)">
        <path fill="#555" d="M0 0h120v20H0z"/>
        <path fill="${color}" d="M120 0h80v20H120z"/>
        <path fill="url(#b)" d="M0 0h200v20H0z"/>
      </g>
      <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
        <text x="60" y="15" fill="#010101" fill-opacity=".3">SwiftConcur</text>
        <text x="60" y="14">SwiftConcur</text>
        <text x="160" y="15" fill="#010101" fill-opacity=".3">${run.warnings_count} warnings</text>
        <text x="160" y="14">${run.warnings_count} warnings</text>
      </g>
    </svg>
  `;
  
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'max-age=300, s-maxage=300',
    },
  });
}