'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, TrendingUp, Package, Calendar } from 'lucide-react';
import { UsageStats } from '@/lib/billing/usage';

interface UsageChartProps {
  usage: UsageStats;
}

export function UsageChart({ usage }: UsageChartProps) {
  const daysRemaining = Math.ceil((usage.period.end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  
  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };
  
  const getUsageStatus = (percentage: number) => {
    if (percentage >= 90) return { color: 'text-red-600', text: 'High usage' };
    if (percentage >= 75) return { color: 'text-yellow-600', text: 'Moderate usage' };
    return { color: 'text-green-600', text: 'Normal usage' };
  };
  
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Warnings Processed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {usage.warnings.used.toLocaleString()}
            <span className="text-sm font-normal text-muted-foreground">
              / {usage.warnings.limit === 999999 ? '∞' : usage.warnings.limit.toLocaleString()}
            </span>
          </div>
          <Progress 
            value={Math.min(usage.warnings.percentage, 100)} 
            className="mt-2"
            indicatorClassName={getProgressColor(usage.warnings.percentage)}
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted-foreground">
              {usage.warnings.percentage}% of monthly limit
            </p>
            <p className={`text-xs font-medium ${getUsageStatus(usage.warnings.percentage).color}`}>
              {getUsageStatus(usage.warnings.percentage).text}
            </p>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            API Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {usage.apiCalls.used}
            <span className="text-sm font-normal text-muted-foreground">
              / {usage.apiCalls.limit}/hr
            </span>
          </div>
          <Progress 
            value={Math.min(usage.apiCalls.percentage, 100)} 
            className="mt-2"
            indicatorClassName={getProgressColor(usage.apiCalls.percentage)}
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted-foreground">
              {usage.apiCalls.percentage}% of hourly limit
            </p>
            <p className="text-xs text-muted-foreground">
              Resets hourly
            </p>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Package className="w-4 h-4" />
            Data Exports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {usage.exports.used}
            <span className="text-sm font-normal text-muted-foreground">
              / {usage.exports.limit}
            </span>
          </div>
          <Progress 
            value={Math.min((usage.exports.used / usage.exports.limit) * 100, 100)} 
            className="mt-2"
            indicatorClassName={getProgressColor((usage.exports.used / usage.exports.limit) * 100)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Monthly export quota
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Billing Period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {daysRemaining}
            <span className="text-sm font-normal text-muted-foreground"> days</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            remaining in period
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Resets {usage.period.end.toLocaleDateString()}
          </p>
          <div className="mt-2">
            <Progress 
              value={((Date.now() - usage.period.start.getTime()) / (usage.period.end.getTime() - usage.period.start.getTime())) * 100}
              className="h-1"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}