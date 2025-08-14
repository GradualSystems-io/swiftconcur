#!/bin/bash

# CI Performance Monitoring Script
# Tracks and reports on CI/CD pipeline performance and cache effectiveness

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_OWNER="GradualSystems-io"
REPO_NAME="swiftconcur"
DAYS_TO_ANALYZE=7
OUTPUT_FILE="ci-performance-report.md"

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

show_help() {
    cat << EOF
CI Performance Monitoring Script

USAGE:
    ./scripts/monitor-ci-performance.sh [OPTIONS]

OPTIONS:
    --days DAYS         Number of days to analyze (default: 7)
    --output FILE       Output file name (default: ci-performance-report.md)
    --json              Output in JSON format
    --workflow NAME     Specific workflow to analyze
    -h, --help          Show this help message

EXAMPLES:
    # Analyze last 7 days
    ./scripts/monitor-ci-performance.sh

    # Analyze last 30 days with custom output
    ./scripts/monitor-ci-performance.sh --days 30 --output monthly-report.md

    # Get JSON output for processing
    ./scripts/monitor-ci-performance.sh --json

EOF
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check required tools
    for tool in gh jq bc; do
        if ! command -v $tool &> /dev/null; then
            log_error "$tool is required but not installed"
            exit 1
        fi
    done
    
    # Check GitHub CLI authentication
    if ! gh auth status &> /dev/null; then
        log_error "GitHub CLI is not authenticated. Run: gh auth login"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Fetch workflow runs data
fetch_workflow_data() {
    log_info "Fetching workflow runs data for the last $DAYS_TO_ANALYZE days..."
    
    # Calculate date threshold
    if [[ "$OSTYPE" == "darwin"* ]]; then
        DATE_THRESHOLD=$(date -v-${DAYS_TO_ANALYZE}d +%Y-%m-%d)
    else
        DATE_THRESHOLD=$(date -d "$DAYS_TO_ANALYZE days ago" +%Y-%m-%d)
    fi
    
    # Fetch workflow runs
    gh api repos/$REPO_OWNER/$REPO_NAME/actions/runs \
        --paginate \
        --jq ".workflow_runs[] | select(.created_at >= \"$DATE_THRESHOLD\") | {
            id: .id,
            name: .name,
            status: .status,
            conclusion: .conclusion,
            created_at: .created_at,
            updated_at: .updated_at,
            run_started_at: .run_started_at,
            head_branch: .head_branch,
            event: .event,
            run_attempt: .run_attempt
        }" > workflow_runs.json
    
    log_success "Fetched $(wc -l < workflow_runs.json) workflow runs"
}

# Fetch individual job data for timing analysis
fetch_job_timings() {
    log_info "Fetching detailed job timing data..."
    
    # Create jobs data file
    echo "[]" > jobs.json
    
    # Get unique run IDs
    RUN_IDS=$(jq -r '.id' workflow_runs.json | head -50) # Limit to prevent API rate limiting
    
    for RUN_ID in $RUN_IDS; do
        echo "Fetching jobs for run $RUN_ID..."
        
        # Fetch jobs for this run
        gh api repos/$REPO_OWNER/$REPO_NAME/actions/runs/$RUN_ID/jobs \
            --jq ".jobs[] | {
                run_id: $RUN_ID,
                name: .name,
                status: .status,
                conclusion: .conclusion,
                started_at: .started_at,
                completed_at: .completed_at,
                steps: [.steps[] | {
                    name: .name,
                    status: .status,
                    conclusion: .conclusion,
                    started_at: .started_at,
                    completed_at: .completed_at
                }]
            }" | jq -s '.' > "jobs_$RUN_ID.json"
        
        # Merge with main jobs file
        jq -s 'flatten' jobs.json "jobs_$RUN_ID.json" > jobs_temp.json
        mv jobs_temp.json jobs.json
        rm "jobs_$RUN_ID.json"
        
        # Rate limiting
        sleep 0.5
    done
    
    log_success "Fetched job timing data"
}

# Analyze cache effectiveness
analyze_cache_effectiveness() {
    log_info "Analyzing cache effectiveness..."
    
    # Look for cache-related steps in jobs
    CACHE_HITS=$(jq '[.[] | select(.steps[]?.name | contains("Cache")) | .steps[] | select(.name | contains("Cache")) | select(.conclusion == "success")] | length' jobs.json)
    CACHE_MISSES=$(jq '[.[] | select(.steps[]?.name | contains("Cache")) | .steps[] | select(.name | contains("Cache")) | select(.conclusion != "success")] | length' jobs.json)
    TOTAL_CACHE_OPERATIONS=$((CACHE_HITS + CACHE_MISSES))
    
    if [ $TOTAL_CACHE_OPERATIONS -gt 0 ]; then
        CACHE_HIT_RATE=$(echo "scale=2; $CACHE_HITS * 100 / $TOTAL_CACHE_OPERATIONS" | bc)
    else
        CACHE_HIT_RATE="0"
    fi
    
    echo "CACHE_HITS=$CACHE_HITS" >> cache_stats.env
    echo "CACHE_MISSES=$CACHE_MISSES" >> cache_stats.env
    echo "CACHE_HIT_RATE=$CACHE_HIT_RATE" >> cache_stats.env
    
    log_success "Cache effectiveness analyzed: ${CACHE_HIT_RATE}% hit rate"
}

# Calculate performance metrics
calculate_performance_metrics() {
    log_info "Calculating performance metrics..."
    
    # Overall workflow statistics
    TOTAL_RUNS=$(jq 'length' workflow_runs.json)
    SUCCESSFUL_RUNS=$(jq '[.[] | select(.conclusion == "success")] | length' workflow_runs.json)
    FAILED_RUNS=$(jq '[.[] | select(.conclusion == "failure")] | length' workflow_runs.json)
    CANCELLED_RUNS=$(jq '[.[] | select(.conclusion == "cancelled")] | length' workflow_runs.json)
    
    if [ $TOTAL_RUNS -gt 0 ]; then
        SUCCESS_RATE=$(echo "scale=2; $SUCCESSFUL_RUNS * 100 / $TOTAL_RUNS" | bc)
    else
        SUCCESS_RATE="0"
    fi
    
    # Calculate average duration for successful runs
    AVG_DURATION=$(jq -r '[.[] | select(.conclusion == "success" and .run_started_at != null and .updated_at != null) | 
        ((now - ((.run_started_at | strptime("%Y-%m-%dT%H:%M:%SZ") | mktime))) - 
         (now - ((.updated_at | strptime("%Y-%m-%dT%H:%M:%SZ") | mktime))))] | 
        add / length / 60' workflow_runs.json 2>/dev/null || echo "0")
    
    # Round to 2 decimal places
    AVG_DURATION=$(echo "scale=2; $AVG_DURATION / 1" | bc)
    
    # Workflow-specific metrics
    jq -r 'group_by(.name) | .[] | {
        workflow: .[0].name,
        count: length,
        success_count: [.[] | select(.conclusion == "success")] | length,
        avg_duration: [.[] | select(.conclusion == "success" and .run_started_at != null and .updated_at != null) | 
            ((now - ((.run_started_at | strptime("%Y-%m-%dT%H:%M:%SZ") | mktime))) - 
             (now - ((.updated_at | strptime("%Y-%m-%dT%H:%M:%SZ") | mktime))))] | 
            add / length / 60
    }' workflow_runs.json > workflow_metrics.json
    
    # Save metrics
    echo "TOTAL_RUNS=$TOTAL_RUNS" >> performance_metrics.env
    echo "SUCCESSFUL_RUNS=$SUCCESSFUL_RUNS" >> performance_metrics.env
    echo "FAILED_RUNS=$FAILED_RUNS" >> performance_metrics.env
    echo "SUCCESS_RATE=$SUCCESS_RATE" >> performance_metrics.env
    echo "AVG_DURATION=$AVG_DURATION" >> performance_metrics.env
    
    log_success "Performance metrics calculated"
}

# Generate performance report
generate_report() {
    log_info "Generating performance report..."
    
    # Load metrics
    source performance_metrics.env
    source cache_stats.env
    
    # Generate markdown report
    cat > "$OUTPUT_FILE" << EOF
# 🚀 CI/CD Performance Report

**Analysis Period**: Last $DAYS_TO_ANALYZE days  
**Generated**: $(date)  
**Repository**: $REPO_OWNER/$REPO_NAME  

## 📊 Overview

| Metric | Value |
|--------|--------|
| **Total Runs** | $TOTAL_RUNS |
| **Successful Runs** | $SUCCESSFUL_RUNS |
| **Failed Runs** | $FAILED_RUNS |
| **Cancelled Runs** | $CANCELLED_RUNS |
| **Success Rate** | ${SUCCESS_RATE}% |
| **Average Duration** | ${AVG_DURATION} minutes |

## 🎯 Performance Status

EOF

    # Add performance status indicators
    if (( $(echo "$SUCCESS_RATE >= 95" | bc -l) )); then
        echo "✅ **Excellent** - Success rate above 95%" >> "$OUTPUT_FILE"
    elif (( $(echo "$SUCCESS_RATE >= 90" | bc -l) )); then
        echo "🟡 **Good** - Success rate between 90-95%" >> "$OUTPUT_FILE"
    else
        echo "🔴 **Needs Attention** - Success rate below 90%" >> "$OUTPUT_FILE"
    fi
    
    if (( $(echo "$AVG_DURATION <= 10" | bc -l) )); then
        echo "✅ **Fast** - Average duration under 10 minutes" >> "$OUTPUT_FILE"
    elif (( $(echo "$AVG_DURATION <= 20" | bc -l) )); then
        echo "🟡 **Moderate** - Average duration 10-20 minutes" >> "$OUTPUT_FILE"
    else
        echo "🔴 **Slow** - Average duration over 20 minutes" >> "$OUTPUT_FILE"
    fi
    
    # Cache effectiveness section
    cat >> "$OUTPUT_FILE" << EOF

## 💾 Cache Effectiveness

| Metric | Value |
|--------|--------|
| **Cache Hit Rate** | ${CACHE_HIT_RATE}% |
| **Cache Hits** | $CACHE_HITS |
| **Cache Misses** | $CACHE_MISSES |
| **Total Cache Operations** | $((CACHE_HITS + CACHE_MISSES)) |

EOF

    # Add cache status
    if (( $(echo "$CACHE_HIT_RATE >= 80" | bc -l) )); then
        echo "✅ **Excellent** - Cache hit rate above 80%" >> "$OUTPUT_FILE"
    elif (( $(echo "$CACHE_HIT_RATE >= 60" | bc -l) )); then
        echo "🟡 **Good** - Cache hit rate between 60-80%" >> "$OUTPUT_FILE"
    else
        echo "🔴 **Poor** - Cache hit rate below 60%" >> "$OUTPUT_FILE"
    fi
    
    # Workflow-specific metrics
    echo "" >> "$OUTPUT_FILE"
    echo "## 🔧 Workflow Breakdown" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    echo "| Workflow | Runs | Success Rate | Avg Duration |" >> "$OUTPUT_FILE"
    echo "|----------|------|--------------|--------------|" >> "$OUTPUT_FILE"
    
    jq -r '.[] | "| \(.workflow) | \(.count) | \((.success_count / .count * 100 | floor))% | \(.avg_duration | floor) min |"' workflow_metrics.json >> "$OUTPUT_FILE"
    
    # Recommendations section
    cat >> "$OUTPUT_FILE" << EOF

## 💡 Recommendations

### Performance Optimizations
EOF

    # Add conditional recommendations
    if (( $(echo "$CACHE_HIT_RATE < 70" | bc -l) )); then
        echo "- 🔧 **Improve Cache Strategy**: Consider cache key optimization and cache warming" >> "$OUTPUT_FILE"
    fi
    
    if (( $(echo "$AVG_DURATION > 15" | bc -l) )); then
        echo "- ⚡ **Optimize Build Time**: Consider parallel job execution and build artifact optimization" >> "$OUTPUT_FILE"
    fi
    
    if (( $(echo "$SUCCESS_RATE < 95" | bc -l) )); then
        echo "- 🛠️ **Improve Reliability**: Investigate frequent failure causes and add retry mechanisms" >> "$OUTPUT_FILE"
    fi
    
    cat >> "$OUTPUT_FILE" << EOF
- 📊 **Regular Monitoring**: Continue tracking these metrics to identify trends
- 🔄 **Cache Maintenance**: Periodically update cache keys to prevent stale caches
- 🚀 **Parallel Execution**: Maximize parallel job execution where possible

## 📈 Trends

Based on the analysis of the last $DAYS_TO_ANALYZE days:
- Average workflow duration: ${AVG_DURATION} minutes
- Cache effectiveness: ${CACHE_HIT_RATE}% hit rate
- Overall reliability: ${SUCCESS_RATE}% success rate

## 🎯 Action Items

1. **Monitor cache hit rate** - Target: >80%
2. **Track average duration** - Target: <10 minutes
3. **Maintain success rate** - Target: >95%
4. **Regular performance reviews** - Weekly monitoring recommended

---

*This report was automatically generated by the SwiftConcur CI performance monitoring system*
EOF
    
    log_success "Performance report generated: $OUTPUT_FILE"
}

# JSON output format
generate_json_output() {
    source performance_metrics.env
    source cache_stats.env
    
    cat > ci-performance.json << EOF
{
  "analysis_period_days": $DAYS_TO_ANALYZE,
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "repository": "$REPO_OWNER/$REPO_NAME",
  "metrics": {
    "total_runs": $TOTAL_RUNS,
    "successful_runs": $SUCCESSFUL_RUNS,
    "failed_runs": $FAILED_RUNS,
    "cancelled_runs": $CANCELLED_RUNS,
    "success_rate": $SUCCESS_RATE,
    "average_duration_minutes": $AVG_DURATION
  },
  "cache": {
    "hit_rate": $CACHE_HIT_RATE,
    "hits": $CACHE_HITS,
    "misses": $CACHE_MISSES,
    "total_operations": $((CACHE_HITS + CACHE_MISSES))
  },
  "workflows": $(cat workflow_metrics.json)
}
EOF
    
    log_success "JSON report generated: ci-performance.json"
}

# Cleanup temporary files
cleanup() {
    log_info "Cleaning up temporary files..."
    rm -f workflow_runs.json jobs.json workflow_metrics.json
    rm -f performance_metrics.env cache_stats.env
    log_success "Cleanup completed"
}

# Parse command line arguments
JSON_OUTPUT=false
WORKFLOW_FILTER=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --days)
            DAYS_TO_ANALYZE="$2"
            shift 2
            ;;
        --output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        --json)
            JSON_OUTPUT=true
            shift
            ;;
        --workflow)
            WORKFLOW_FILTER="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main execution
echo "📊 SwiftConcur CI Performance Monitoring"
echo "========================================"
echo "Analysis Period: Last $DAYS_TO_ANALYZE days"
echo "Output Format: $([ "$JSON_OUTPUT" = true ] && echo "JSON" || echo "Markdown")"
echo ""

check_prerequisites
fetch_workflow_data
fetch_job_timings
analyze_cache_effectiveness
calculate_performance_metrics

if [ "$JSON_OUTPUT" = true ]; then
    generate_json_output
else
    generate_report
fi

cleanup

log_success "CI performance analysis completed! 🎉"

if [ "$JSON_OUTPUT" = false ]; then
    echo ""
    echo "📋 Report Summary:"
    source performance_metrics.env 2>/dev/null || true
    source cache_stats.env 2>/dev/null || true
    echo "  - Total Runs: ${TOTAL_RUNS:-0}"
    echo "  - Success Rate: ${SUCCESS_RATE:-0}%"
    echo "  - Average Duration: ${AVG_DURATION:-0} minutes"
    echo "  - Cache Hit Rate: ${CACHE_HIT_RATE:-0}%"
    echo ""
    echo "📄 Full report: $OUTPUT_FILE"
fi