'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WarningBreakdown, WarningType } from '@/lib/supabase/types';
import { formatNumber, getSeverityColor, cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield, Zap, Clock } from 'lucide-react';

interface WarningTypeChartProps {
  data: WarningBreakdown[];
  className?: string;
  variant?: 'pie' | 'bar';
  showLegend?: boolean;
  title?: string;
}

const WARNING_TYPE_CONFIG: Record<WarningType, {
  label: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = {
  actor_isolation: {
    label: 'Actor Isolation',
    color: 'hsl(25, 95%, 53%)', // Orange
    icon: Shield,
    description: 'Issues with actor boundary violations',
  },
  sendable: {
    label: 'Sendable Conformance',
    color: 'hsl(221, 83%, 53%)', // Blue
    icon: Zap,
    description: 'Types that need Sendable protocol conformance',
  },
  data_race: {
    label: 'Data Race',
    color: 'hsl(0, 84%, 60%)', // Red
    icon: AlertTriangle,
    description: 'Potential race conditions and data races',
  },
  performance: {
    label: 'Performance',
    color: 'hsl(142, 76%, 36%)', // Green
    icon: Clock,
    description: 'Performance-related concurrency issues',
  },
};

function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const config = WARNING_TYPE_CONFIG[data.type as WarningType];
    
    return (
      <div className="bg-background border rounded-lg shadow-lg p-3 min-w-[200px]">
        <div className="flex items-center gap-2 mb-2">
          <config.icon className="h-4 w-4" style={{ color: config.color }} />
          <span className="font-semibold">{config.label}</span>
        </div>
        <div className="space-y-1 text-sm">
          <p>Count: <span className="font-medium">{formatNumber(data.count)}</span></p>
          <p>Percentage: <span className="font-medium">{data.percentage.toFixed(1)}%</span></p>
          <p className="text-muted-foreground text-xs">{config.description}</p>
        </div>
      </div>
    );
  }
  return null;
}

function CustomLegend({ payload }: any) {
  return (
    <div className="flex flex-wrap justify-center gap-4 mt-4">
      {payload?.map((entry: any) => {
        const config = WARNING_TYPE_CONFIG[entry.payload.type as WarningType];
        return (
          <div key={entry.value} className="flex items-center gap-2 text-sm">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: entry.color }}
            />
            <span>{config.label}</span>
            <Badge variant="outline" className="text-xs">
              {entry.payload.count}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

export function WarningTypeChart({ 
  data, 
  className, 
  variant = 'pie',
  showLegend = true,
  title = 'Warning Types Distribution'
}: WarningTypeChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>No warning data available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No warnings to display</p>
              <p className="text-sm">Great job! Your code is clean.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Add colors to data
  const chartData = data.map(item => ({
    ...item,
    color: WARNING_TYPE_CONFIG[item.type].color,
    label: WARNING_TYPE_CONFIG[item.type].label,
  }));
  
  const totalWarnings = data.reduce((sum, item) => sum + item.count, 0);
  const mostCommonType = data.reduce((prev, current) => 
    prev.count > current.count ? prev : current
  );
  
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{title}</span>
          <Badge variant="outline">
            {formatNumber(totalWarnings)} total
          </Badge>
        </CardTitle>
        <CardDescription>
          Most common: {WARNING_TYPE_CONFIG[mostCommonType.type].label} ({mostCommonType.percentage.toFixed(1)}%)
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {variant === 'pie' ? (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={40}
                paddingAngle={2}
                dataKey="count"
                stroke="hsl(var(--background))"
                strokeWidth={2}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              {showLegend && <Legend content={<CustomLegend />} />}
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted opacity-30" />
              <XAxis 
                dataKey="label" 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={formatNumber}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar 
                dataKey="count" 
                radius={[4, 4, 0, 0]}
                fill="hsl(var(--primary))"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        
        {/* Summary Statistics */}
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {data.map((item) => {
            const config = WARNING_TYPE_CONFIG[item.type];
            return (
              <div key={item.type} className="text-center p-3 rounded-lg bg-muted/50">
                <config.icon 
                  className="h-5 w-5 mx-auto mb-1" 
                  style={{ color: config.color }} 
                />
                <div className="text-sm font-medium">{config.label}</div>
                <div className="text-lg font-bold">{formatNumber(item.count)}</div>
                <div className="text-xs text-muted-foreground">
                  {item.percentage.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Insights */}
        <div className="mt-4 p-4 bg-muted/30 rounded-lg">
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Key Insights
          </h4>
          <ul className="text-sm space-y-1 text-muted-foreground">
            {data.slice(0, 3).map((item) => {
              const config = WARNING_TYPE_CONFIG[item.type];
              return (
                <li key={item.type} className="flex items-center gap-2">
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: config.color }}
                  />
                  <span>
                    {config.label} accounts for {item.percentage.toFixed(1)}% of all warnings
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}