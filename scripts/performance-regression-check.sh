#!/bin/bash

# Performance Regression Detection Script
# Automatically detects performance regressions in SwiftConcur parsing benchmarks

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REGRESSION_THRESHOLD=10  # Percentage threshold for regression detection
IMPROVEMENT_THRESHOLD=5   # Percentage threshold for improvement detection
BENCHMARK_DIR="benchmark-results"
BASELINE_DIR="benchmark-baseline"
ALERTS_FILE="performance-alerts.json"

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
Performance Regression Detection Script

USAGE:
    ./scripts/performance-regression-check.sh [OPTIONS]

OPTIONS:
    --threshold PERCENT     Regression threshold percentage (default: 10)
    --baseline-dir DIR      Directory containing baseline benchmarks
    --results-dir DIR       Directory containing current results
    --output FILE           Output file for alerts (default: performance-alerts.json)
    --slack-webhook URL     Slack webhook URL for notifications
    --github-token TOKEN    GitHub token for issue creation
    --repo REPO             GitHub repository (owner/repo format)
    -v, --verbose           Verbose output
    -h, --help              Show this help message

EXAMPLES:
    # Basic regression check
    ./scripts/performance-regression-check.sh

    # Custom threshold and Slack notifications
    ./scripts/performance-regression-check.sh --threshold 5 --slack-webhook https://hooks.slack.com/...

    # GitHub integration
    ./scripts/performance-regression-check.sh --github-token ghp_xxx --repo owner/repo

EOF
}

# Parse command line arguments
VERBOSE=false
SLACK_WEBHOOK=""
GITHUB_TOKEN=""
GITHUB_REPO=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --threshold)
            REGRESSION_THRESHOLD="$2"
            shift 2
            ;;
        --baseline-dir)
            BASELINE_DIR="$2"
            shift 2
            ;;
        --results-dir)
            BENCHMARK_DIR="$2"
            shift 2
            ;;
        --output)
            ALERTS_FILE="$2"
            shift 2
            ;;
        --slack-webhook)
            SLACK_WEBHOOK="$2"
            shift 2
            ;;
        --github-token)
            GITHUB_TOKEN="$2"
            shift 2
            ;;
        --repo)
            GITHUB_REPO="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
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

# Validate prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check required tools
    for tool in jq bc; do
        if ! command -v $tool &> /dev/null; then
            log_error "$tool is required but not installed"
            exit 1
        fi
    done
    
    # Check Python for analysis
    if ! command -v python3 &> /dev/null; then
        log_error "Python 3 is required for regression analysis"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Load benchmark results
load_benchmark_data() {
    log_info "Loading benchmark data..."
    
    if [ ! -f "$BENCHMARK_DIR/benchmark-output.json" ]; then
        log_error "Current benchmark results not found: $BENCHMARK_DIR/benchmark-output.json"
        exit 1
    fi
    
    if [ ! -f "$BASELINE_DIR/baseline-results.json" ]; then
        log_warning "Baseline results not found: $BASELINE_DIR/baseline-results.json"
        log_info "This will be the first baseline - no regression analysis possible"
        return 1
    fi
    
    log_success "Benchmark data loaded successfully"
    return 0
}

# Analyze performance regression
analyze_regression() {
    log_info "Analyzing performance regression..."
    
    python3 << EOF
import json
import sys
from datetime import datetime

def analyze_benchmarks():
    # Load current and baseline results
    try:
        with open('$BENCHMARK_DIR/benchmark-output.json', 'r') as f:
            current_data = json.load(f)
        
        with open('$BASELINE_DIR/baseline-results.json', 'r') as f:
            baseline_data = json.load(f)
    except Exception as e:
        print(f"Error loading benchmark data: {e}")
        return False
    
    regressions = []
    improvements = []
    stable_benchmarks = []
    
    # Create lookup for baseline benchmarks
    baseline_benchmarks = {}
    if 'benchmarks' in baseline_data:
        for bench in baseline_data['benchmarks']:
            baseline_benchmarks[bench.get('id')] = bench.get('typical', 0)
    
    # Analyze current benchmarks against baseline
    if 'benchmarks' in current_data:
        for bench in current_data['benchmarks']:
            bench_id = bench.get('id')
            current_time = bench.get('typical', 0)
            
            if bench_id in baseline_benchmarks:
                baseline_time = baseline_benchmarks[bench_id]
                
                if baseline_time > 0:
                    change_percent = ((current_time - baseline_time) / baseline_time) * 100
                    
                    benchmark_info = {
                        'name': bench_id,
                        'current_ms': current_time / 1_000_000,
                        'baseline_ms': baseline_time / 1_000_000,
                        'change_percent': change_percent,
                        'change_ms': (current_time - baseline_time) / 1_000_000
                    }
                    
                    if change_percent > $REGRESSION_THRESHOLD:
                        regressions.append(benchmark_info)
                    elif change_percent < -$IMPROVEMENT_THRESHOLD:
                        improvements.append(benchmark_info)
                    else:
                        stable_benchmarks.append(benchmark_info)
    
    # Generate analysis report
    analysis = {
        'timestamp': datetime.now().isoformat(),
        'regression_threshold': $REGRESSION_THRESHOLD,
        'improvement_threshold': $IMPROVEMENT_THRESHOLD,
        'summary': {
            'total_benchmarks': len(stable_benchmarks) + len(regressions) + len(improvements),
            'regressions': len(regressions),
            'improvements': len(improvements),
            'stable': len(stable_benchmarks)
        },
        'regressions': regressions,
        'improvements': improvements,
        'stable': stable_benchmarks
    }
    
    # Save analysis results
    with open('$ALERTS_FILE', 'w') as f:
        json.dump(analysis, f, indent=2)
    
    # Print summary
    if regressions:
        print("🔴 PERFORMANCE REGRESSIONS DETECTED")
        for reg in regressions:
            print(f"  ❌ {reg['name']}: {reg['current_ms']:.2f}ms (+{reg['change_percent']:.1f}%)")
        print()
    
    if improvements:
        print("🟢 PERFORMANCE IMPROVEMENTS DETECTED")
        for imp in improvements:
            print(f"  ✅ {imp['name']}: {imp['current_ms']:.2f}ms ({imp['change_percent']:.1f}%)")
        print()
    
    if stable_benchmarks:
        print(f"🟡 STABLE BENCHMARKS: {len(stable_benchmarks)}")
        if $VERBOSE:
            for stable in stable_benchmarks:
                print(f"  ➡️  {stable['name']}: {stable['current_ms']:.2f}ms ({stable['change_percent']:+.1f}%)")
    
    return len(regressions) == 0

if __name__ == "__main__":
    success = analyze_benchmarks()
    sys.exit(0 if success else 1)
EOF

    ANALYSIS_RESULT=$?
    
    if [ $ANALYSIS_RESULT -eq 0 ]; then
        log_success "No significant performance regressions detected"
        return 0
    else
        log_error "Performance regressions detected!"
        return 1
    fi
}

# Send Slack notification
send_slack_notification() {
    if [ -z "$SLACK_WEBHOOK" ]; then
        return 0
    fi
    
    log_info "Sending Slack notification..."
    
    # Load analysis results
    if [ ! -f "$ALERTS_FILE" ]; then
        log_warning "No analysis results found for Slack notification"
        return 0
    fi
    
    # Extract key metrics for Slack message
    REGRESSION_COUNT=$(jq -r '.summary.regressions' "$ALERTS_FILE")
    IMPROVEMENT_COUNT=$(jq -r '.summary.improvements' "$ALERTS_FILE")
    TOTAL_BENCHMARKS=$(jq -r '.summary.total_benchmarks' "$ALERTS_FILE")
    
    if [ "$REGRESSION_COUNT" -gt 0 ]; then
        COLOR="danger"
        STATUS="⚠️ Performance Regression Alert"
        MESSAGE="$REGRESSION_COUNT performance regression(s) detected in SwiftConcur benchmarks"
    elif [ "$IMPROVEMENT_COUNT" -gt 0 ]; then
        COLOR="good"
        STATUS="🚀 Performance Improvement"
        MESSAGE="$IMPROVEMENT_COUNT performance improvement(s) detected in SwiftConcur benchmarks"
    else
        COLOR="good"
        STATUS="✅ Performance Stable"
        MESSAGE="All $TOTAL_BENCHMARKS benchmarks are performing within expected ranges"
    fi
    
    # Create Slack payload
    SLACK_PAYLOAD=$(cat << EOF
{
  "attachments": [
    {
      "color": "$COLOR",
      "title": "$STATUS",
      "text": "$MESSAGE",
      "fields": [
        {
          "title": "Regressions",
          "value": "$REGRESSION_COUNT",
          "short": true
        },
        {
          "title": "Improvements", 
          "value": "$IMPROVEMENT_COUNT",
          "short": true
        },
        {
          "title": "Total Benchmarks",
          "value": "$TOTAL_BENCHMARKS",
          "short": true
        },
        {
          "title": "Threshold",
          "value": "${REGRESSION_THRESHOLD}%",
          "short": true
        }
      ],
      "footer": "SwiftConcur Performance Monitor",
      "ts": $(date +%s)
    }
  ]
}
EOF
    )
    
    # Send to Slack
    if curl -X POST -H 'Content-type: application/json' \
       --data "$SLACK_PAYLOAD" \
       "$SLACK_WEBHOOK" &> /dev/null; then
        log_success "Slack notification sent"
    else
        log_warning "Failed to send Slack notification"
    fi
}

# Create GitHub issue for regressions
create_github_issue() {
    if [ -z "$GITHUB_TOKEN" ] || [ -z "$GITHUB_REPO" ]; then
        return 0
    fi
    
    log_info "Checking for GitHub issue creation..."
    
    # Only create issues for regressions
    REGRESSION_COUNT=$(jq -r '.summary.regressions' "$ALERTS_FILE")
    if [ "$REGRESSION_COUNT" -eq 0 ]; then
        log_info "No regressions - skipping GitHub issue creation"
        return 0
    fi
    
    log_info "Creating GitHub issue for performance regression..."
    
    # Generate issue body
    ISSUE_BODY=$(cat << 'EOF'
## 🚨 Performance Regression Detected

Automated performance monitoring has detected significant performance regressions in SwiftConcur parsing benchmarks.

### 📊 Regression Summary

EOF
    )
    
    # Add regression details
    echo "$ISSUE_BODY" > github_issue_body.md
    
    jq -r '.regressions[] | "- **\(.name)**: \(.current_ms | round * 100 / 100)ms (was \(.baseline_ms | round * 100 / 100)ms) - **+\(.change_percent | round * 10 / 10)% slower**"' "$ALERTS_FILE" >> github_issue_body.md
    
    cat << 'EOF' >> github_issue_body.md

### 🎯 Action Required

Please investigate the performance regression and implement optimizations to restore performance to baseline levels.

### 📋 Analysis Details

- **Regression Threshold**: 
- **Detection Time**: 
- **Affected Benchmarks**: See details above

### 🔍 Investigation Steps

1. Review recent commits that may have affected parsing performance
2. Run local benchmarks to reproduce the regression
3. Profile the code to identify performance bottlenecks
4. Implement optimizations and verify performance recovery

---

*This issue was automatically created by the SwiftConcur performance monitoring system.*
EOF
    
    # Fill in the template values
    sed -i.bak "s/\*\*Regression Threshold\*\*:/\*\*Regression Threshold\*\*: ${REGRESSION_THRESHOLD}%/" github_issue_body.md
    sed -i.bak "s/\*\*Detection Time\*\*:/\*\*Detection Time\*\*: $(date)/" github_issue_body.md
    sed -i.bak "s/\*\*Affected Benchmarks\*\*:/\*\*Affected Benchmarks\*\*: ${REGRESSION_COUNT}/" github_issue_body.md
    rm github_issue_body.md.bak
    
    # Create GitHub issue
    ISSUE_TITLE="🚨 Performance Regression: ${REGRESSION_COUNT} benchmark(s) slower than baseline"
    
    ISSUE_RESPONSE=$(curl -s -X POST \
        -H "Authorization: token $GITHUB_TOKEN" \
        -H "Accept: application/vnd.github.v3+json" \
        "https://api.github.com/repos/$GITHUB_REPO/issues" \
        -d "{
            \"title\": \"$ISSUE_TITLE\",
            \"body\": $(jq -Rs . github_issue_body.md),
            \"labels\": [\"performance\", \"regression\", \"automated\"]
        }")
    
    ISSUE_URL=$(echo "$ISSUE_RESPONSE" | jq -r '.html_url // empty')
    
    if [ -n "$ISSUE_URL" ]; then
        log_success "GitHub issue created: $ISSUE_URL"
        echo "GITHUB_ISSUE_URL=$ISSUE_URL" >> performance_regression_env.txt
    else
        log_warning "Failed to create GitHub issue"
        echo "GitHub API Response: $ISSUE_RESPONSE" >&2
    fi
    
    # Cleanup
    rm -f github_issue_body.md
}

# Generate regression report
generate_report() {
    log_info "Generating regression analysis report..."
    
    if [ ! -f "$ALERTS_FILE" ]; then
        log_warning "No analysis results found"
        return 0
    fi
    
    cat > performance-regression-report.md << 'EOF'
# 🔍 Performance Regression Analysis Report

**Generated**: $(date)
**Threshold**: $(echo $REGRESSION_THRESHOLD)%
**Baseline**: $(echo $BASELINE_DIR)
**Results**: $(echo $BENCHMARK_DIR)

## 📊 Summary

EOF
    
    # Add summary from JSON
    jq -r '"- **Total Benchmarks**: \(.summary.total_benchmarks)
- **Regressions**: \(.summary.regressions)
- **Improvements**: \(.summary.improvements)
- **Stable**: \(.summary.stable)"' "$ALERTS_FILE" >> performance-regression-report.md
    
    # Add detailed results if there are regressions
    REGRESSION_COUNT=$(jq -r '.summary.regressions' "$ALERTS_FILE")
    if [ "$REGRESSION_COUNT" -gt 0 ]; then
        echo "" >> performance-regression-report.md
        echo "## 🚨 Performance Regressions" >> performance-regression-report.md
        echo "" >> performance-regression-report.md
        echo "| Benchmark | Current | Baseline | Change | Impact |" >> performance-regression-report.md
        echo "|-----------|---------|----------|--------|--------|" >> performance-regression-report.md
        
        jq -r '.regressions[] | "| \(.name) | \(.current_ms | round * 100 / 100)ms | \(.baseline_ms | round * 100 / 100)ms | +\(.change_percent | round * 10 / 10)% | 🔴 Regression |"' "$ALERTS_FILE" >> performance-regression-report.md
    fi
    
    # Add improvements if any
    IMPROVEMENT_COUNT=$(jq -r '.summary.improvements' "$ALERTS_FILE")
    if [ "$IMPROVEMENT_COUNT" -gt 0 ]; then
        echo "" >> performance-regression-report.md
        echo "## 🚀 Performance Improvements" >> performance-regression-report.md
        echo "" >> performance-regression-report.md
        echo "| Benchmark | Current | Baseline | Change | Impact |" >> performance-regression-report.md
        echo "|-----------|---------|----------|--------|--------|" >> performance-regression-report.md
        
        jq -r '.improvements[] | "| \(.name) | \(.current_ms | round * 100 / 100)ms | \(.baseline_ms | round * 100 / 100)ms | \(.change_percent | round * 10 / 10)% | 🟢 Improvement |"' "$ALERTS_FILE" >> performance-regression-report.md
    fi
    
    echo "" >> performance-regression-report.md
    echo "---" >> performance-regression-report.md
    echo "*Generated by SwiftConcur Performance Regression Detection System*" >> performance-regression-report.md
    
    log_success "Regression report generated: performance-regression-report.md"
}

# Main execution
echo "🔍 SwiftConcur Performance Regression Detection"
echo "=============================================="
echo "Regression Threshold: ${REGRESSION_THRESHOLD}%"
echo "Baseline Directory: $BASELINE_DIR"
echo "Results Directory: $BENCHMARK_DIR"
echo ""

check_prerequisites

if load_benchmark_data; then
    if analyze_regression; then
        log_success "✅ No performance regressions detected"
        REGRESSION_DETECTED=false
    else
        log_error "❌ Performance regressions detected"
        REGRESSION_DETECTED=true
    fi
    
    generate_report
    send_slack_notification
    
    if [ "$REGRESSION_DETECTED" = true ]; then
        create_github_issue
    fi
    
else
    log_info "No baseline available - establishing initial baseline"
    REGRESSION_DETECTED=false
fi

echo ""
echo "🎯 Regression Analysis Complete"
echo "=============================="

if [ -f "$ALERTS_FILE" ]; then
    echo "📊 Analysis Results:"
    jq -r '"  • Total Benchmarks: \(.summary.total_benchmarks)
  • Regressions: \(.summary.regressions)  
  • Improvements: \(.summary.improvements)
  • Stable: \(.summary.stable)"' "$ALERTS_FILE"
    
    echo ""
    echo "📁 Generated Files:"
    echo "  • Analysis: $ALERTS_FILE"
    echo "  • Report: performance-regression-report.md"
fi

if [ "$REGRESSION_DETECTED" = true ]; then
    echo ""
    log_error "Performance regression detected - requires attention!"
    exit 1
else
    echo ""
    log_success "Performance check passed!"
    exit 0
fi