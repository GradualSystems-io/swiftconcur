import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatNumber } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: number; // Percentage change
  description?: string;
  variant?: 'default' | 'destructive' | 'success';
  className?: string;
  loading?: boolean;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  description,
  variant = 'default',
  className,
  loading = false,
}: StatCardProps) {
  const variantStyles = {
    default: 'border-border',
    destructive: 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/50',
    success: 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/50',
  };
  
  const iconStyles = {
    default: 'text-muted-foreground',
    destructive: 'text-red-600 dark:text-red-400',
    success: 'text-green-600 dark:text-green-400',
  };
  
  const getTrendIcon = () => {
    if (trend === undefined || trend === 0) return Minus;
    return trend > 0 ? TrendingUp : TrendingDown;
  };
  
  const getTrendColor = () => {
    if (trend === undefined || trend === 0) return 'text-gray-500';
    // For destructive variant, upward trend is bad
    if (variant === 'destructive') {
      return trend > 0 ? 'text-red-600' : 'text-green-600';
    }
    // For success/default variant, upward trend is good
    return trend > 0 ? 'text-green-600' : 'text-red-600';
  };
  
  const TrendIcon = getTrendIcon();
  
  if (loading) {
    return (
      <Card className={cn(variantStyles[variant], 'animate-pulse', className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-4 w-4 bg-muted rounded" />
        </CardHeader>
        <CardContent>
          <div className="h-8 bg-muted rounded w-3/4 mb-2" />
          <div className="h-3 bg-muted rounded w-full" />
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className={cn(variantStyles[variant], className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={cn("h-4 w-4", iconStyles[variant])} />
      </CardHeader>
      
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold">
              {typeof value === 'number' ? formatNumber(value) : value}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">
                {description}
              </p>
            )}
          </div>
          
          {trend !== undefined && (
            <div className="flex items-center gap-1">
              <Badge
                variant="outline"
                className={cn(
                  "flex items-center gap-1 text-xs font-medium",
                  getTrendColor()
                )}
              >
                <TrendIcon className="h-3 w-3" />
                {Math.abs(trend).toFixed(1)}%
              </Badge>
            </div>
          )}
        </div>
        
        {/* Progress bar for certain metrics */}
        {variant === 'success' && typeof value === 'string' && value.includes('%') && (
          <div className="mt-3">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500"
                style={{ 
                  width: `${Math.min(100, parseFloat(value.replace('%', '')))}%` 
                }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}