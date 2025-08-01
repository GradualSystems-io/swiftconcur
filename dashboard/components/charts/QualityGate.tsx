import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, XCircle, Shield, TrendingUp } from 'lucide-react';
import { cn, calculateQualityGate } from '@/lib/utils';

interface QualityGateProps {
  status?: 'green' | 'yellow' | 'red';
  warningsCount: number;
  criticalCount: number;
  className?: string;
  showDetails?: boolean;
  trend?: number; // Percentage change from previous run
}

export function QualityGate({ 
  status, 
  warningsCount, 
  criticalCount, 
  className,
  showDetails = true,
  trend
}: QualityGateProps) {
  // Calculate status if not provided
  const qualityGate = status ? 
    { status, score: 0, message: '' } : 
    calculateQualityGate(criticalCount, warningsCount);
  
  const finalStatus = status || qualityGate.status;
  
  const config = {
    green: {
      bg: 'bg-green-50 dark:bg-green-950/50',
      border: 'border-green-200 dark:border-green-800',
      text: 'text-green-800 dark:text-green-200',
      icon: CheckCircle,
      badgeVariant: 'default' as const,
      message: 'Quality gate passed',
      description: 'All checks are passing successfully',
    },
    yellow: {
      bg: 'bg-yellow-50 dark:bg-yellow-950/50',
      border: 'border-yellow-200 dark:border-yellow-800',
      text: 'text-yellow-800 dark:text-yellow-200',
      icon: AlertTriangle,
      badgeVariant: 'secondary' as const,
      message: 'Quality gate warning',
      description: 'Some issues detected that need attention',
    },
    red: {
      bg: 'bg-red-50 dark:bg-red-950/50',
      border: 'border-red-200 dark:border-red-800',
      text: 'text-red-800 dark:text-red-200',
      icon: XCircle,
      badgeVariant: 'destructive' as const,
      message: 'Quality gate failed',
      description: 'Critical issues must be resolved',
    },
  };
  
  const { bg, border, text, icon: Icon, badgeVariant, message, description } = config[finalStatus];
  
  // Calculate quality score
  const qualityScore = Math.max(0, Math.min(100, 
    100 - (criticalCount * 20) - (warningsCount * 2)
  ));
  
  return (
    <Card className={cn(`${bg} ${border} border-2 transition-all duration-200`, className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn("p-3 rounded-full", bg)}>
              <Icon className={cn("h-8 w-8", text)} />
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className={cn("text-xl font-bold", text)}>
                  {message}
                </h3>
                <Badge variant={badgeVariant} className="text-xs">
                  Score: {qualityScore}
                </Badge>
              </div>
              
              {showDetails && (
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Shield className="h-4 w-4" />
                    {warningsCount} total warnings
                  </span>
                  {criticalCount > 0 && (
                    <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                      <XCircle className="h-4 w-4" />
                      {criticalCount} critical
                    </span>
                  )}
                  {trend !== undefined && (
                    <span className={cn(
                      "flex items-center gap-1",
                      trend > 0 ? "text-red-600 dark:text-red-400" : 
                      trend < 0 ? "text-green-600 dark:text-green-400" : 
                      "text-gray-600 dark:text-gray-400"
                    )}>
                      <TrendingUp className={cn(
                        "h-4 w-4",
                        trend < 0 && "rotate-180"
                      )} />
                      {Math.abs(trend).toFixed(1)}%
                    </span>
                  )}
                </div>
              )}
              
              <p className="text-sm text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
          
          {/* Quality Gate Status Badge */}
          <div className="text-center">
            <div className={cn(
              "text-4xl font-bold tracking-tight",
              text
            )}>
              {finalStatus.toUpperCase()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Quality Gate
            </div>
          </div>
        </div>
        
        {showDetails && (
          <div className="mt-4 pt-4 border-t border-current/20">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className={cn("text-2xl font-bold", text)}>
                  {qualityScore}
                </div>
                <div className="text-xs text-muted-foreground">Score</div>
              </div>
              <div>
                <div className={cn("text-2xl font-bold", text)}>
                  {warningsCount - criticalCount}
                </div>
                <div className="text-xs text-muted-foreground">Non-Critical</div>
              </div>
              <div>
                <div className={cn("text-2xl font-bold", text)}>
                  {Math.max(0, 100 - warningsCount)}%
                </div>
                <div className="text-xs text-muted-foreground">Clean Code</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}