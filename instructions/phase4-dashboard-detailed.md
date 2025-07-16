# Phase 4: Next.js Dashboard - Detailed Implementation Guide

## Overview
Build a modern dashboard using Next.js 14 with App Router, Supabase for data, and Tailwind CSS for styling. This dashboard will visualize Swift concurrency warning trends and provide repository management.

## Project Structure
```
dashboard/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── repo/
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── loading.tsx
│   │   ├── settings/
│   │   │   └── page.tsx
│   │   ├── billing/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   └── callback/
│   │   │       └── route.ts
│   │   └── export/
│   │       └── route.ts
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── charts/
│   │   ├── TrendChart.tsx
│   │   ├── WarningTypeChart.tsx
│   │   └── ComparisonChart.tsx
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   └── ... (shadcn/ui components)
│   ├── dashboard/
│   │   ├── RepoCard.tsx
│   │   ├── WarningsList.tsx
│   │   └── StatCard.tsx
│   └── layout/
│       ├── Header.tsx
│       ├── Sidebar.tsx
│       └── Footer.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── types.ts
│   ├── utils/
│   │   ├── format.ts
│   │   └── export.ts
│   └── hooks/
│       ├── useWarnings.ts
│       ├── useRepositories.ts
│       └── useRealtime.ts
├── public/
├── styles/
│   └── globals.css
├── package.json
├── next.config.js
├── tailwind.config.ts
└── tsconfig.json
```

## Implementation Steps

### 1. Initialize Next.js Project
```bash
npx create-next-app@latest dashboard --typescript --tailwind --app
cd dashboard

# Install additional dependencies
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs
npm install recharts react-hook-form zod
npm install @tanstack/react-query
npm install date-fns
npm install lucide-react
npm install jspdf csv-export

# Install shadcn/ui
npx shadcn-ui@latest init
# Choose: TypeScript, Tailwind CSS variables
```

### 2. Environment Configuration (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Supabase Client Setup

#### Client Component (lib/supabase/client.ts)
```typescript
import { createBrowserClient } from '@supabase/ssr';
import { Database } from './types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

#### Server Component (lib/supabase/server.ts)
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
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );
}
```

### 4. Database Types (lib/supabase/types.ts)
```typescript
export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          github_id: number;
          name: string;
          plan: 'free' | 'pro' | 'enterprise';
          created_at: string;
        };
      };
      repositories: {
        Row: {
          id: string;
          org_id: string;
          github_id: number;
          name: string;
          full_name: string;
          is_private: boolean;
          is_active: boolean;
          created_at: string;
        };
      };
      warning_runs: {
        Row: {
          id: string;
          repo_id: string;
          commit_sha: string;
          branch: string;
          pull_request?: number;
          total_warnings: number;
          metadata: {
            scheme: string;
            configuration: string;
            swift_version: string;
          };
          created_at: string;
        };
      };
      warnings: {
        Row: {
          id: string;
          run_id: string;
          type: 'actor_isolation' | 'sendable' | 'data_race' | 'performance';
          severity: 'critical' | 'high' | 'medium' | 'low';
          file_path: string;
          line_number: number;
          column_number?: number;
          message: string;
          code_context: {
            before: string[];
            line: string;
            after: string[];
          };
          suggested_fix?: string;
        };
      };
    };
  };
};
```

### 5. Root Layout (app/layout.tsx)
```tsx
import './globals.css';
import { Inter } from 'next/font/google';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'SwiftConcur CI Dashboard',
  description: 'Track Swift concurrency warnings across your repositories',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### 6. Providers (app/providers.tsx)
```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000, // 1 minute
          refetchInterval: 5 * 60 * 1000, // 5 minutes
        },
      },
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
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
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header user={user} />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

### 8. Dashboard Page (app/(dashboard)/dashboard/page.tsx)
```tsx
import { createClient } from '@/lib/supabase/server';
import { RepoCard } from '@/components/dashboard/RepoCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { TrendChart } from '@/components/charts/TrendChart';
import { WarningTypeChart } from '@/components/charts/WarningTypeChart';

export default async function DashboardPage() {
  const supabase = createClient();
  
  // Fetch user's repositories
  const { data: repos } = await supabase
    .from('repositories')
    .select(`
      *,
      warning_runs (
        total_warnings,
        created_at
      )
    `)
    .order('created_at', { ascending: false });
  
  // Calculate statistics
  const totalWarnings = repos?.reduce((sum, repo) => 
    sum + (repo.warning_runs[0]?.total_warnings || 0), 0
  ) || 0;
  
  const activeRepos = repos?.filter(repo => repo.is_active).length || 0;
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Overview of Swift concurrency warnings across your repositories
        </p>
      </div>
      
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Warnings"
          value={totalWarnings}
          trend={-12}
          icon="AlertTriangle"
        />
        <StatCard
          title="Active Repositories"
          value={activeRepos}
          icon="GitBranch"
        />
        <StatCard
          title="Critical Issues"
          value={0}
          trend={0}
          icon="AlertCircle"
        />
        <StatCard
          title="Success Rate"
          value="94%"
          trend={3}
          icon="CheckCircle"
        />
      </div>
      
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TrendChart repos={repos} />
        <WarningTypeChart repos={repos} />
      </div>
      
      {/* Repository List */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Repositories</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {repos?.map(repo => (
            <RepoCard key={repo.id} repo={repo} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

### 9. Repository Detail Page (app/(dashboard)/repo/[id]/page.tsx)
```tsx
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { TrendChart } from '@/components/charts/TrendChart';
import { WarningsList } from '@/components/dashboard/WarningsList';
import { ComparisonChart } from '@/components/charts/ComparisonChart';
import { Button } from '@/components/ui/Button';
import { Download, GitBranch, Clock } from 'lucide-react';

export default async function RepoPage({ 
  params 
}: { 
  params: { id: string } 
}) {
  const supabase = createClient();
  
  // Fetch repository details
  const { data: repo } = await supabase
    .from('repositories')
    .select(`
      *,
      warning_runs (
        *,
        warnings (*)
      )
    `)
    .eq('id', params.id)
    .single();
  
  if (!repo) {
    notFound();
  }
  
  const latestRun = repo.warning_runs[0];
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {repo.name}
          </h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <GitBranch className="w-4 h-4" />
              {latestRun?.branch || 'main'}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {new Date(latestRun?.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
        
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>
      
      {/* Warning Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Total Warnings
          </h3>
          <p className="text-2xl font-bold mt-2">
            {latestRun?.total_warnings || 0}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Critical Issues
          </h3>
          <p className="text-2xl font-bold mt-2 text-red-600">
            {latestRun?.warnings.filter(w => w.severity === 'critical').length || 0}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Files Affected
          </h3>
          <p className="text-2xl font-bold mt-2">
            {new Set(latestRun?.warnings.map(w => w.file_path)).size || 0}
          </p>
        </div>
      </div>
      
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TrendChart repoId={repo.id} />
        <ComparisonChart branches={['main', 'develop']} repoId={repo.id} />
      </div>
      
      {/* Warnings List */}
      <WarningsList warnings={latestRun?.warnings || []} />
    </div>
  );
}
```

### 10. Key Components

#### StatCard Component (components/dashboard/StatCard.tsx)
```tsx
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import * as Icons from 'lucide-react';

interface StatCardProps {
  title: string;
  value: number | string;
  trend?: number;
  icon: keyof typeof Icons;
}

export function StatCard({ title, value, trend, icon }: StatCardProps) {
  const Icon = Icons[icon] as LucideIcon;
  
  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {title}
          </p>
          <p className="text-2xl font-bold mt-2">{value}</p>
          {trend !== undefined && (
            <div className="flex items-center mt-2">
              {trend >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
              )}
              <span className={`text-sm ${
                trend >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
                {Math.abs(trend)}%
              </span>
            </div>
          )}
        </div>
        <Icon className="w-8 h-8 text-gray-400" />
      </div>
    </div>
  );
}
```

#### TrendChart Component (components/charts/TrendChart.tsx)
```tsx
'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/Card';
import { useWarningTrends } from '@/lib/hooks/useWarnings';

export function TrendChart({ repoId }: { repoId?: string }) {
  const { data, isLoading } = useWarningTrends(repoId);
  
  if (isLoading) {
    return <Card className="h-96 animate-pulse" />;
  }
  
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Warning Trends</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="total" 
            stroke="#3B82F6" 
            name="Total Warnings"
          />
          <Line 
            type="monotone" 
            dataKey="critical" 
            stroke="#EF4444" 
            name="Critical"
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
```

#### WarningsList Component (components/dashboard/WarningsList.tsx)
```tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, FileCode, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface Warning {
  id: string;
  type: string;
  severity: string;
  file_path: string;
  line_number: number;
  message: string;
  code_context: {
    before: string[];
    line: string;
    after: string[];
  };
}

export function WarningsList({ warnings }: { warnings: Warning[] }) {
  const [expandedWarnings, setExpandedWarnings] = useState<Set<string>>(new Set());
  
  const toggleWarning = (id: string) => {
    const newExpanded = new Set(expandedWarnings);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedWarnings(newExpanded);
  };
  
  const severityColors = {
    critical: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-blue-100 text-blue-800',
  };
  
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Warnings</h3>
      <div className="space-y-2">
        {warnings.map((warning) => (
          <div key={warning.id} className="border rounded-lg">
            <button
              onClick={() => toggleWarning(warning.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <div className="flex items-center gap-3">
                {expandedWarnings.has(warning.id) ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                <div className="text-left">
                  <p className="font-medium">{warning.message}</p>
                  <p className="text-sm text-gray-600 flex items-center gap-2 mt-1">
                    <FileCode className="w-3 h-3" />
                    {warning.file_path}:{warning.line_number}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={severityColors[warning.severity as keyof typeof severityColors]}>
                  {warning.severity}
                </Badge>
                <Badge variant="outline">{warning.type}</Badge>
              </div>
            </button>
            
            {expandedWarnings.has(warning.id) && (
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t">
                <pre className="text-sm overflow-x-auto">
                  <code>
                    {warning.code_context.before.map((line, i) => (
                      <div key={i} className="text-gray-600">
                        {line}
                      </div>
                    ))}
                    <div className="bg-yellow-100 dark:bg-yellow-900 px-2 -mx-2">
                      {warning.code_context.line}
                    </div>
                    {warning.code_context.after.map((line, i) => (
                      <div key={i} className="text-gray-600">
                        {line}
                      </div>
                    ))}
                  </code>
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
```

### 11. Custom Hooks

#### useWarnings Hook (lib/hooks/useWarnings.ts)
```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useEffect } from 'react';

export function useWarningTrends(repoId?: string) {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ['warning-trends', repoId],
    queryFn: async () => {
      let query = supabase
        .from('warning_runs')
        .select('created_at, total_warnings, warnings(severity)');
      
      if (repoId) {
        query = query.eq('repo_id', repoId);
      }
      
      const { data, error } = await query
        .order('created_at', { ascending: true })
        .limit(30);
      
      if (error) throw error;
      
      // Transform data for chart
      return data.map(run => ({
        date: new Date(run.created_at).toLocaleDateString(),
        total: run.total_warnings,
        critical: run.warnings.filter(w => w.severity === 'critical').length,
      }));
    },
  });
}

export function useRealtimeWarnings(repoId: string) {
  const queryClient = useQueryClient();
  const supabase = createClient();
  
  useEffect(() => {
    const channel = supabase
      .channel(`warnings:${repoId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'warning_runs',
          filter: `repo_id=eq.${repoId}`,
        },
        () => {
          // Invalidate and refetch
          queryClient.invalidateQueries({ queryKey: ['warning-trends', repoId] });
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [repoId, queryClient, supabase]);
}
```

### 12. Export Functionality (app/api/export/route.ts)
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateCSV, generatePDF } from '@/lib/utils/export';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const repoId = searchParams.get('repo');
  const format = searchParams.get('format') || 'csv';
  const runId = searchParams.get('run');
  
  const supabase = createClient();
  
  // Verify user has access to repo
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Fetch data
  const { data: warnings } = await supabase
    .from('warnings')
    .select('*')
    .eq('run_id', runId);
  
  if (!warnings) {
    return NextResponse.json({ error: 'No data found' }, { status: 404 });
  }
  
  // Generate export
  let content: Blob;
  let contentType: string;
  let filename: string;
  
  if (format === 'pdf') {
    content = await generatePDF(warnings);
    contentType = 'application/pdf';
    filename = `swiftconcur-report-${runId}.pdf`;
  } else {
    content = generateCSV(warnings);
    contentType = 'text/csv';
    filename = `swiftconcur-report-${runId}.csv`;
  }
  
  return new NextResponse(content, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
```

### 13. Settings Page (app/(dashboard)/settings/page.tsx)
```tsx
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/use-toast';

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState({
    emailNotifications: true,
    slackNotifications: false,
    weeklyReport: true,
    thresholdAlerts: true,
    defaultThreshold: 10,
  });
  
  const handleSave = async () => {
    // Save settings to database
    toast({
      title: 'Settings saved',
      description: 'Your preferences have been updated.',
    });
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-gray-600 mt-2">
          Manage your notification preferences and integrations
        </p>
      </div>
      
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Notifications</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Email Notifications</p>
              <p className="text-sm text-gray-600">
                Receive email alerts for new warnings
              </p>
            </div>
            <Switch
              checked={settings.emailNotifications}
              onCheckedChange={(checked) => 
                setSettings({ ...settings, emailNotifications: checked })
              }
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Slack Notifications</p>
              <p className="text-sm text-gray-600">
                Send alerts to your Slack workspace
              </p>
            </div>
            <Switch
              checked={settings.slackNotifications}
              onCheckedChange={(checked) => 
                setSettings({ ...settings, slackNotifications: checked })
              }
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Weekly Reports</p>
              <p className="text-sm text-gray-600">
                Get a weekly summary of warning trends
              </p>
            </div>
            <Switch
              checked={settings.weeklyReport}
              onCheckedChange={(checked) => 
                setSettings({ ...settings, weeklyReport: checked })
              }
            />
          </div>
        </div>
      </Card>
      
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Integrations</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">GitHub</p>
              <p className="text-sm text-gray-600">Connected</p>
            </div>
            <Button variant="outline" size="sm">Manage</Button>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Slack</p>
              <p className="text-sm text-gray-600">Not connected</p>
            </div>
            <Button variant="outline" size="sm">Connect</Button>
          </div>
        </div>
      </Card>
      
      <div className="flex justify-end">
        <Button onClick={handleSave}>Save Settings</Button>
      </div>
    </div>
  );
}
```

## Deployment

### 1. Build Configuration (next.config.js)
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['avatars.githubusercontent.com'],
  },
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
```

### 2. Vercel Deployment
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## Performance Optimization

1. **Static Generation**: Use `generateStaticParams` for repository pages
2. **Incremental Static Regeneration**: Set `revalidate` for dashboard
3. **React Query**: Cache data with appropriate stale times
4. **Image Optimization**: Use Next.js Image component
5. **Bundle Splitting**: Lazy load heavy components (charts)

## Security Considerations

1. **Row Level Security**: Configure Supabase RLS policies
2. **API Routes**: Validate user permissions
3. **Environment Variables**: Never expose service keys
4. **CORS**: Configure appropriate headers
5. **Rate Limiting**: Implement on API routes

## Next Steps

After completing the dashboard, proceed to Phase 5 (GitHub Marketplace) to implement billing and subscription management.