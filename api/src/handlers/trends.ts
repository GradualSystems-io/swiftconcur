import type { Env, RequestWithRepo, APIResponse, TrendDirection } from '../types';
import { createSupabaseService } from '../services/supabase';
import type { TrendData } from '../models/repository';

/**
 * Handle trend aggregation requests
 */
export async function handleTrend(
  request: RequestWithRepo,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  try {
    // Validate request method
    if (request.method !== 'GET') {
      return createErrorResponse('Method not allowed', 405);
    }
    
    // Extract repo ID from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const repoId = pathParts[3]; // /v1/repos/{repo_id}/trend
    
    if (!repoId) {
      return createErrorResponse('Repository ID is required', 400);
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(repoId)) {
      return createErrorResponse('Invalid repository ID format', 400);
    }
    
    // Verify repository ownership
    const authenticatedRepoId = request.repoId;
    if (!authenticatedRepoId || authenticatedRepoId !== repoId) {
      return createErrorResponse('Repository not found', 404);
    }
    
    // Parse query parameters
    const days = parseInt(url.searchParams.get('days') || '30');
    const includeDetails = url.searchParams.get('details') === 'true';
    
    // Validate days parameter
    if (![7, 30, 90, 365].includes(days)) {
      return createErrorResponse('Invalid days parameter. Allowed values: 7, 30, 90, 365', 400);
    }
    
    // Fetch trend data from database
    const supabaseService = createSupabaseService(env);
    
    let trendData: TrendData[];
    try {
      trendData = await supabaseService.getTrendData(repoId, days);
    } catch (error) {
      console.error('Error fetching trend data:', error);
      return createErrorResponse('Failed to retrieve trend data', 500);
    }
    
    // Calculate trend metrics
    const trendMetrics = calculateTrendMetrics(trendData, days);
    
    // Build response
    const response: APIResponse = {
      success: true,
      data: {
        repo_id: repoId,
        period_days: days,
        summary: trendMetrics.summary,
        trend_analysis: trendMetrics.analysis,
        ...(includeDetails && { data_points: trendData }),
      },
    };
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=900', // 15 minutes cache
      },
    });
    
  } catch (error) {
    console.error('Unexpected error in trend handler:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

/**
 * Calculate comprehensive trend metrics
 */
function calculateTrendMetrics(data: TrendData[], _periodDays: number) {
  if (data.length === 0) {
    return {
      summary: {
        total_runs: 0,
        total_warnings: 0,
        avg_warnings_per_run: 0,
        trend_direction: 'stable' as TrendDirection,
        change_percentage: 0,
        days_with_data: 0,
      },
      analysis: {
        peak_warnings_day: null,
        lowest_warnings_day: null,
        warning_velocity: 0,
        consistency_score: 0,
        improvement_streak: 0,
        regression_streak: 0,
      },
    };
  }
  
  // Basic metrics
  const totalRuns = data.reduce((sum, day) => sum + day.run_count, 0);
  const totalWarnings = data.reduce((sum, day) => sum + day.total_warnings, 0);
  const avgWarningsPerRun = totalRuns > 0 ? totalWarnings / totalRuns : 0;
  
  // Trend calculation using linear regression
  const trendInfo = calculateTrend(data);
  
  // Find peak and lowest days
  const sortedByWarnings = [...data].sort((a, b) => b.total_warnings - a.total_warnings);
  const peakDay = sortedByWarnings[0];
  const lowestDay = sortedByWarnings[sortedByWarnings.length - 1];
  
  // Calculate consistency (standard deviation)
  const avgWarningsPerDay = data.reduce((sum, day) => sum + day.avg_warnings, 0) / data.length;
  const variance = data.reduce((sum, day) => sum + Math.pow(day.avg_warnings - avgWarningsPerDay, 2), 0) / data.length;
  const consistencyScore = Math.max(0, 100 - Math.sqrt(variance)); // Higher is more consistent
  
  // Calculate streaks
  const streaks = calculateStreaks(data);
  
  return {
    summary: {
      total_runs: totalRuns,
      total_warnings: totalWarnings,
      avg_warnings_per_run: Math.round(avgWarningsPerRun * 100) / 100,
      trend_direction: trendInfo.direction,
      change_percentage: Math.round(trendInfo.changePercentage * 100) / 100,
      days_with_data: data.length,
    },
    analysis: {
      peak_warnings_day: peakDay ? {
        date: peakDay.date,
        warnings: peakDay.total_warnings,
        runs: peakDay.run_count,
      } : null,
      lowest_warnings_day: lowestDay ? {
        date: lowestDay.date,
        warnings: lowestDay.total_warnings,
        runs: lowestDay.run_count,
      } : null,
      warning_velocity: Math.round(trendInfo.slope * 100) / 100, // Warnings change per day
      consistency_score: Math.round(consistencyScore * 100) / 100,
      improvement_streak: streaks.improvement,
      regression_streak: streaks.regression,
    },
  };
}

/**
 * Calculate trend using linear regression
 */
function calculateTrend(data: TrendData[]) {
  if (data.length < 2) {
    return {
      direction: 'stable' as TrendDirection,
      changePercentage: 0,
      slope: 0,
    };
  }
  
  // Convert dates to numbers for regression
  const points = data.map((item, index) => ({
    x: index,
    y: item.avg_warnings,
  }));
  
  // Calculate linear regression
  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  
  // Calculate percentage change from first to last
  const firstValue = data[0].avg_warnings || 1; // Avoid division by zero
  const lastValue = data[data.length - 1].avg_warnings;
  const changePercentage = ((lastValue - firstValue) / firstValue) * 100;
  
  // Determine direction
  let direction: TrendDirection = 'stable';
  if (Math.abs(changePercentage) > 5) { // 5% threshold
    direction = changePercentage > 0 ? 'worsening' : 'improving';
  }
  
  return {
    direction,
    changePercentage,
    slope,
  };
}

/**
 * Calculate improvement and regression streaks
 */
function calculateStreaks(data: TrendData[]) {
  if (data.length < 2) {
    return { improvement: 0, regression: 0 };
  }
  
  let improvementStreak = 0;
  let regressionStreak = 0;
  let currentImprovement = 0;
  let currentRegression = 0;
  
  for (let i = 1; i < data.length; i++) {
    const current = data[i].avg_warnings;
    const previous = data[i - 1].avg_warnings;
    
    if (current < previous) {
      // Improvement (fewer warnings)
      currentImprovement++;
      currentRegression = 0;
      improvementStreak = Math.max(improvementStreak, currentImprovement);
    } else if (current > previous) {
      // Regression (more warnings)
      currentRegression++;
      currentImprovement = 0;
      regressionStreak = Math.max(regressionStreak, currentRegression);
    } else {
      // No change
      currentImprovement = 0;
      currentRegression = 0;
    }
  }
  
  return {
    improvement: improvementStreak,
    regression: regressionStreak,
  };
}

/**
 * Create standardized error response
 */
function createErrorResponse(message: string, status: number): Response {
  const response: APIResponse = {
    success: false,
    error: message,
  };
  
  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}