'use client';

import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { useRealtime } from '@/lib/hooks/useRealtime';
import { TrendDataPoint } from '@/lib/supabase/types';
import { formatDate, formatNumber, cn } from '@/lib/utils';
import { useSecurity } from '@/app/providers';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';

interface TrendChartProps {
  repoId?: string;
  days?: 7 | 30 | 90;
  className?: string;
  variant?: 'line' | 'area';
  showComparison?: boolean;
}

interface TrendAnalysis {
  direction: 'up' | 'down' | 'stable';
  percentage: number;
  isSignificant: boolean;
}

function analyzeTrend(data: TrendDataPoint[]): TrendAnalysis {
  if (data.length < 2) {
    return { direction: 'stable', percentage: 0, isSignificant: false };
  }
  
  const recent = data.slice(-7); // Last week
  const previous = data.slice(-14, -7); // Previous week
  
  if (recent.length === 0 || previous.length === 0) {
    return { direction: 'stable', percentage: 0, isSignificant: false };
  }
  
  const recentAvg = recent.reduce((sum, d) => sum + d.warnings, 0) / recent.length;
  const previousAvg = previous.reduce((sum, d) => sum + d.warnings, 0) / previous.length;
  
  if (previousAvg === 0) {
    return { direction: recentAvg > 0 ? 'up' : 'stable', percentage: 0, isSignificant: false };
  }
  
  const percentage = ((recentAvg - previousAvg) / previousAvg) * 100;
  const isSignificant = Math.abs(percentage) > 10; // 10% threshold
  
  let direction: 'up' | 'down' | 'stable' = 'stable';
  if (percentage > 5) direction = 'up';
  else if (percentage < -5) direction = 'down';
  
  return { direction, percentage: Math.abs(percentage), isSignificant };
}

export function TrendChart({ 
  repoId, 
  days = 30, 
  className,
  variant = 'area',
  showComparison = true 
}: TrendChartProps) {
  const supabase = createClient();
  const { reportSecurityEvent } = useSecurity();
  
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['trend', repoId, days],
    queryFn: async () => {
      try {
        // Security: Validate repoId if provided
        if (repoId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(repoId)) {
          reportSecurityEvent('invalid_repo_id', { repoId });
          throw new Error('Invalid repository ID');
        }
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        let query = supabase
          .from('repo_warning_daily')
          .select('*')
          .gte('date', startDate.toISOString().split('T')[0])
          .order('date', { ascending: true });
        
        if (repoId) {
          query = query.eq('repo_id', repoId);
        }
        
        const { data: rawData, error } = await query;
        
        if (error) {
          reportSecurityEvent('database_error', { error: error.message });
          throw error;
        }
        
        // Transform data for charting
        const chartData: TrendDataPoint[] = rawData?.map(row => ({
          date: formatDate(row.date, 'short'),
          warnings: row.total_warnings,
          runs: row.run_count,
          critical: row.critical_warnings,
        })) || [];
        
        return chartData;
      } catch (error) {
        console.error('Trend data fetch error:', error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error: any) => {
      // Don't retry on security/validation errors
      if (error?.message?.includes('Invalid')) return false;
      return failureCount < 2;
    },
  });
  
  // Subscribe to real-time updates
  useRealtime(repoId, () => {
    refetch();
  });
  
  if (error) {
    return (
      <Card className={cn("border-destructive", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Error Loading Trend Data
          </CardTitle>
          <CardDescription>
            {error instanceof Error ? error.message : 'Failed to load trend data'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  
  if (isLoading) {
    return (
      <Card className={cn("animate-pulse", className)}>
        <CardHeader>
          <div className="h-6 bg-muted rounded w-1/3 mb-2" />
          <div className="h-4 bg-muted rounded w-1/2" />
        </CardHeader>
        <CardContent>
          <div className="h-[300px] bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }
  
  const trendAnalysis = data ? analyzeTrend(data) : null;
  const maxWarnings = Math.max(...(data?.map(d => d.warnings) || [0]));
  const totalWarnings = data?.reduce((sum, d) => sum + d.warnings, 0) || 0;
  
  const TrendIcon = trendAnalysis?.direction === 'up' ? TrendingUp : 
                   trendAnalysis?.direction === 'down' ? TrendingDown : Minus;
  
  const trendColor = trendAnalysis?.direction === 'up' ? 'text-red-600' : 
                     trendAnalysis?.direction === 'down' ? 'text-green-600' : 'text-gray-600';
  
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">
              Warning Trends ({days} days)
            </CardTitle>
            <CardDescription>
              {data?.length || 0} data points • {formatNumber(totalWarnings)} total warnings
            </CardDescription>
          </div>
          
          {showComparison && trendAnalysis && trendAnalysis.isSignificant && (
            <div className={cn("flex items-center gap-1 text-sm font-medium", trendColor)}>
              <TrendIcon className="h-4 w-4" />
              {trendAnalysis.percentage.toFixed(1)}%
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {!data || data.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No data available for the selected period</p>
              <p className="text-sm">Run some builds to see trends</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            {variant === 'area' ? (
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="warningsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="criticalGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(0 84.2% 60.2%)" stopOpacity={0.5}/>
                    <stop offset="95%" stopColor="hsl(0 84.2% 60.2%)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted opacity-30" />
                <XAxis 
                  dataKey="date" 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={{ stroke: 'hsl(var(--border))' }}
                  tickFormatter={formatNumber}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                  formatter={(value: number, name: string) => [
                    formatNumber(value),
                    name === 'warnings' ? 'Total Warnings' : 
                    name === 'critical' ? 'Critical Warnings' : name
                  ]}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Area 
                  type="monotone" 
                  dataKey="warnings" 
                  stroke="hsl(var(--destructive))" 
                  strokeWidth={2}
                  fill="url(#warningsGradient)"
                  name="warnings"
                />
                <Area 
                  type="monotone" 
                  dataKey="critical" 
                  stroke="hsl(0 84.2% 60.2%)" 
                  strokeWidth={2}
                  fill="url(#criticalGradient)"
                  name="critical"
                />
              </AreaChart>
            ) : (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted opacity-30" />
                <XAxis 
                  dataKey="date" 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={formatNumber}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                  }}
                  formatter={(value: number) => [formatNumber(value), 'Warnings']}
                />
                <Line 
                  type="monotone" 
                  dataKey="warnings" 
                  stroke="hsl(var(--destructive))" 
                  strokeWidth={2}
                  dot={{ r: 4, fill: 'hsl(var(--destructive))' }}
                  activeDot={{ r: 6, fill: 'hsl(var(--destructive))' }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}