'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface WarningTrendPoint {
  date: string;
  totalWarnings: number;
  newWarnings: number;
  fixedWarnings: number;
}

interface TrendSummary {
  totalWarnings: number;
  changePercentage: number;
  changeDirection: 'up' | 'down' | 'flat';
  lastPeriodTotal: number;
  currentPeriodTotal: number;
}

interface WarningTrendChartProps {
  data: WarningTrendPoint[];
  summary: TrendSummary;
  className?: string;
}

function TrendSummaryBadge({ summary }: { summary: TrendSummary }) {
  const { changeDirection, changePercentage } = summary;

  if (changeDirection === 'flat') {
    return (
      <Badge variant="outline" className="text-xs">
        No change vs previous period
      </Badge>
    );
  }

  const isImproving = changeDirection === 'down';
  const Icon = isImproving ? TrendingDown : TrendingUp;
  const label = `${isImproving ? 'Improved' : 'Worse'} ${Math.abs(changePercentage).toFixed(1)}%`;

  return (
    <Badge variant={isImproving ? 'secondary' : 'destructive'} className="gap-1 text-xs">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

export function WarningTrendChart({ data, summary, className }: WarningTrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Warning Trend</CardTitle>
          <CardDescription>No warning data recorded yet</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <AlertTriangle className="h-8 w-8 mx-auto opacity-50" />
              <p>No SwiftConcur runs have reported warnings.</p>
              <p className="text-sm">Once the GitHub Action reports results, you&apos;ll see trend data here.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalWarnings = summary.totalWarnings;

  return (
    <Card className={className}>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg font-semibold">Warning Trend</CardTitle>
          <CardDescription>
            {formatNumber(totalWarnings)} total warnings across recent SwiftConcur runs
          </CardDescription>
        </div>
        <TrendSummaryBadge summary={summary} />
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="totalWarnings" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="newWarnings" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="fixedWarnings" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" />
            <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
            <YAxis tickFormatter={(value) => formatNumber(value)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
            <Tooltip
              formatter={(value: number) => formatNumber(value)}
              labelClassName="text-sm font-semibold"
              contentStyle={{ borderRadius: 8 }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="totalWarnings"
              name="Total warnings"
              stroke="hsl(var(--destructive))"
              fill="url(#totalWarnings)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="newWarnings"
              name="New warnings"
              stroke="hsl(var(--primary))"
              fill="url(#newWarnings)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="fixedWarnings"
              name="Fixed warnings"
              stroke="hsl(var(--secondary))"
              fill="url(#fixedWarnings)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
