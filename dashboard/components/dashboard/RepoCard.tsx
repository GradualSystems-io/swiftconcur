import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RepoWithStats } from '@/lib/supabase/types';
import { formatDate, formatRelativeTime, cn, getSeverityColor } from '@/lib/utils';
import { 
  GitBranch, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  TrendingUp, 
  TrendingDown, 
  ExternalLink,
  Settings,
  Activity
} from 'lucide-react';

interface RepoCardProps {
  repo: RepoWithStats;
  className?: string;
}

export function RepoCard({ repo, className }: RepoCardProps) {
  const stats = repo.repo_stats?.[0];
  const hasStats = Boolean(stats);
  
  // Calculate quality status
  const getQualityStatus = () => {
    if (!hasStats) return { status: 'unknown', color: 'text-gray-500' };
    
    const criticalCount = stats.critical_warnings || 0;
    const totalWarnings = stats.total_warnings || 0;
    
    if (criticalCount > 0) {
      return { status: 'critical', color: 'text-red-600 dark:text-red-400' };
    } else if (totalWarnings > 10) {
      return { status: 'warning', color: 'text-yellow-600 dark:text-yellow-400' };
    } else {
      return { status: 'good', color: 'text-green-600 dark:text-green-400' };
    }
  };
  
  const qualityStatus = getQualityStatus();
  
  const getTierBadgeVariant = (tier: string) => {
    switch (tier) {
      case 'enterprise':
        return 'default';
      case 'pro':
        return 'secondary';
      default:
        return 'outline';
    }
  };
  
  const getTrendIcon = (trend: number) => {
    if (trend > 5) return TrendingUp;
    if (trend < -5) return TrendingDown;
    return Activity;
  };
  
  const getTrendColor = (trend: number) => {
    if (trend > 5) return 'text-red-600 dark:text-red-400';
    if (trend < -5) return 'text-green-600 dark:text-green-400';
    return 'text-gray-600 dark:text-gray-400';
  };
  
  return (
    <Card className={cn("transition-all duration-200 hover:shadow-md", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <CardTitle className="text-lg font-semibold truncate">
              <Link 
                href={`/r/${repo.id}`}
                className="hover:text-primary transition-colors"
              >
                {repo.name}
              </Link>
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <Badge variant={getTierBadgeVariant(repo.tier)}>
                {repo.tier.toUpperCase()}
              </Badge>
              {hasStats && stats.last_run_at && (
                <span className="text-xs flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(new Date(stats.last_run_at))}
                </span>
              )}
            </CardDescription>
          </div>
          
          {/* Quality Status Indicator */}
          <div className={cn("flex items-center gap-1", qualityStatus.color)}>
            {qualityStatus.status === 'critical' && <AlertTriangle className="h-4 w-4" />}
            {qualityStatus.status === 'warning' && <AlertTriangle className="h-4 w-4" />}
            {qualityStatus.status === 'good' && <CheckCircle className="h-4 w-4" />}
            {qualityStatus.status === 'unknown' && <GitBranch className="h-4 w-4" />}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {hasStats ? (
          <>
            {/* Statistics Grid */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{stats.total_runs}</div>
                <div className="text-xs text-muted-foreground">Runs</div>
              </div>
              <div>
                <div className={cn(
                  "text-2xl font-bold",
                  stats.total_warnings > 0 ? "text-orange-600" : "text-green-600"
                )}>
                  {stats.total_warnings}
                </div>
                <div className="text-xs text-muted-foreground">Warnings</div>
              </div>
              <div>
                <div className={cn(
                  "text-2xl font-bold",
                  stats.critical_warnings > 0 ? "text-red-600" : "text-green-600"
                )}>
                  {stats.critical_warnings}
                </div>
                <div className="text-xs text-muted-foreground">Critical</div>
              </div>
            </div>
            
            {/* Trend and Success Rate */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Trend (7d):</span>
                {stats.trend_7d !== undefined && (
                  <div className={cn(
                    "flex items-center gap-1 font-medium",
                    getTrendColor(stats.trend_7d)
                  )}>
                    {(() => {
                      const TrendIcon = getTrendIcon(stats.trend_7d);
                      return <TrendIcon className="h-3 w-3" />;
                    })()}
                    {Math.abs(stats.trend_7d).toFixed(1)}%
                  </div>
                )}
              </div>
              
              <div className="text-sm">
                <span className="text-muted-foreground">Success: </span>
                <span className={cn(
                  "font-medium",
                  stats.success_rate >= 90 ? "text-green-600" :
                  stats.success_rate >= 70 ? "text-yellow-600" : "text-red-600"
                )}>
                  {Math.round(stats.success_rate)}%
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No runs yet</p>
            <p className="text-xs">Push code to see statistics</p>
          </div>
        )}
        
        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button asChild className="flex-1">
            <Link href={`/r/${repo.id}`}>
              <GitBranch className="h-4 w-4 mr-2" />
              View Details
            </Link>
          </Button>
          
          <Button variant="outline" size="icon" asChild>
            <Link href={`/r/${repo.id}/settings`}>
              <Settings className="h-4 w-4" />
              <span className="sr-only">Repository settings</span>
            </Link>
          </Button>
          
          <Button variant="outline" size="icon" asChild>
            <a 
              href={`${process.env.NEXT_PUBLIC_APP_URL}/api/badge/${repo.id}.svg`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="sr-only">Get badge</span>
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}