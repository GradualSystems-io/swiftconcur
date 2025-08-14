#!/bin/bash

# Benchmark Data Storage & Comparison Setup Script
# Configures local and CI environment for benchmark data management

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BENCHMARK_BASE_DIR="benchmark-data"
BASELINE_DIR="$BENCHMARK_BASE_DIR/baseline"
HISTORY_DIR="$BENCHMARK_BASE_DIR/history"
CACHE_DIR="$BENCHMARK_BASE_DIR/cache"
REPORTS_DIR="$BENCHMARK_BASE_DIR/reports"
CONFIG_FILE="$BENCHMARK_BASE_DIR/config.json"

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
Benchmark Data Storage & Comparison Setup Script

USAGE:
    ./scripts/setup-benchmark-storage.sh [OPTIONS]

OPTIONS:
    --clean                 Clean existing benchmark data
    --backup DIR            Backup existing data to directory
    --restore DIR           Restore data from backup directory
    --init                  Initialize fresh benchmark storage
    --validate              Validate storage setup
    --config-only           Only setup configuration files
    -h, --help              Show this help message

EXAMPLES:
    # Initial setup
    ./scripts/setup-benchmark-storage.sh --init

    # Clean and reinitialize
    ./scripts/setup-benchmark-storage.sh --clean --init

    # Backup before major changes
    ./scripts/setup-benchmark-storage.sh --backup ./benchmark-backup

EOF
}

# Create directory structure
create_directories() {
    log_info "Creating benchmark storage directories..."
    
    mkdir -p "$BASELINE_DIR"
    mkdir -p "$HISTORY_DIR"
    mkdir -p "$CACHE_DIR"
    mkdir -p "$REPORTS_DIR"
    mkdir -p "$BENCHMARK_BASE_DIR/exports"
    mkdir -p "$BENCHMARK_BASE_DIR/imports"
    mkdir -p "$BENCHMARK_BASE_DIR/archives"
    
    log_success "Directory structure created"
}

# Setup configuration
setup_configuration() {
    log_info "Setting up benchmark configuration..."
    
    cat > "$CONFIG_FILE" << 'EOF'
{
  "version": "1.0",
  "created": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "storage": {
    "baseline_dir": "baseline",
    "history_dir": "history", 
    "cache_dir": "cache",
    "reports_dir": "reports",
    "retention": {
      "history_days": 90,
      "cache_days": 30,
      "reports_days": 60
    }
  },
  "comparison": {
    "regression_threshold": 10.0,
    "improvement_threshold": 5.0,
    "statistical_confidence": 0.95,
    "minimum_samples": 5
  },
  "performance_budgets": {
    "xcresult_small": {
      "target_ms": 10.0,
      "warning_ms": 8.0,
      "critical_ms": 15.0
    },
    "xcresult_medium": {
      "target_ms": 50.0,
      "warning_ms": 40.0,
      "critical_ms": 75.0
    },
    "xcresult_large": {
      "target_ms": 200.0,
      "warning_ms": 160.0,
      "critical_ms": 300.0
    },
    "xcodebuild_small": {
      "target_ms": 15.0,
      "warning_ms": 12.0,
      "critical_ms": 22.5
    },
    "xcodebuild_medium": {
      "target_ms": 75.0,
      "warning_ms": 60.0,
      "critical_ms": 112.5
    },
    "xcodebuild_large": {
      "target_ms": 300.0,
      "warning_ms": 240.0,
      "critical_ms": 450.0
    }
  },
  "notifications": {
    "slack": {
      "enabled": false,
      "webhook_url_env": "SLACK_WEBHOOK_URL",
      "channel": "#performance-alerts"
    },
    "github": {
      "enabled": false,
      "token_env": "GITHUB_TOKEN",
      "repo_env": "GITHUB_REPOSITORY",
      "create_issues": true,
      "labels": ["performance", "regression", "automated"]
    },
    "email": {
      "enabled": false,
      "smtp_host": "",
      "smtp_port": 587,
      "recipients": []
    }
  },
  "ci_integration": {
    "fail_on_regression": true,
    "require_baseline": false,
    "auto_update_baseline": true,
    "parallel_execution": true
  },
  "archiving": {
    "enabled": true,
    "compress_old_data": true,
    "archive_after_days": 30,
    "max_archive_size_mb": 500
  }
}
EOF
    
    # Replace the date placeholder
    sed -i.bak "s/\$(date -u +%Y-%m-%dT%H:%M:%SZ)/$(date -u +%Y-%m-%dT%H:%M:%SZ)/" "$CONFIG_FILE"
    rm "$CONFIG_FILE.bak"
    
    log_success "Configuration file created: $CONFIG_FILE"
}

# Setup benchmark comparison scripts
setup_comparison_scripts() {
    log_info "Setting up benchmark comparison utilities..."
    
    # Create benchmark comparison utility
    cat > "$BENCHMARK_BASE_DIR/compare-benchmarks.py" << 'EOF'
#!/usr/bin/env python3
"""
Benchmark Comparison Utility for SwiftConcur
Compares benchmark results and generates detailed analysis reports
"""

import json
import sys
import argparse
import statistics
from datetime import datetime, timedelta
from pathlib import Path

class BenchmarkComparator:
    def __init__(self, config_path="config.json"):
        self.config = self.load_config(config_path)
        
    def load_config(self, config_path):
        """Load configuration settings"""
        try:
            with open(config_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"Warning: Config file {config_path} not found, using defaults")
            return self.default_config()
    
    def default_config(self):
        """Default configuration if config file is missing"""
        return {
            "comparison": {
                "regression_threshold": 10.0,
                "improvement_threshold": 5.0,
                "statistical_confidence": 0.95
            }
        }
    
    def compare_results(self, current_file, baseline_file):
        """Compare current benchmark results against baseline"""
        try:
            with open(current_file, 'r') as f:
                current_data = json.load(f)
            with open(baseline_file, 'r') as f:
                baseline_data = json.load(f)
        except Exception as e:
            print(f"Error loading benchmark files: {e}")
            return None
        
        comparison = {
            "timestamp": datetime.now().isoformat(),
            "current_file": str(current_file),
            "baseline_file": str(baseline_file),
            "regressions": [],
            "improvements": [],
            "stable": []
        }
        
        # Create baseline lookup
        baseline_benchmarks = {}
        if 'benchmarks' in baseline_data:
            for bench in baseline_data['benchmarks']:
                baseline_benchmarks[bench.get('id')] = bench.get('typical', 0)
        
        # Compare each current benchmark
        if 'benchmarks' in current_data:
            for bench in current_data['benchmarks']:
                bench_id = bench.get('id')
                current_time = bench.get('typical', 0)
                
                if bench_id in baseline_benchmarks:
                    baseline_time = baseline_benchmarks[bench_id]
                    
                    if baseline_time > 0:
                        change_percent = ((current_time - baseline_time) / baseline_time) * 100
                        
                        benchmark_result = {
                            'id': bench_id,
                            'current_ms': current_time / 1_000_000,
                            'baseline_ms': baseline_time / 1_000_000,
                            'change_percent': change_percent,
                            'change_ms': (current_time - baseline_time) / 1_000_000
                        }
                        
                        regression_threshold = self.config['comparison']['regression_threshold']
                        improvement_threshold = self.config['comparison']['improvement_threshold']
                        
                        if change_percent > regression_threshold:
                            comparison['regressions'].append(benchmark_result)
                        elif change_percent < -improvement_threshold:
                            comparison['improvements'].append(benchmark_result)
                        else:
                            comparison['stable'].append(benchmark_result)
        
        return comparison
    
    def analyze_trends(self, history_dir, benchmark_id, days=30):
        """Analyze performance trends over time"""
        history_path = Path(history_dir)
        trend_data = []
        
        # Find all benchmark files in the time range
        cutoff_date = datetime.now() - timedelta(days=days)
        
        for file_path in history_path.glob("benchmark_*.json"):
            try:
                # Extract timestamp from filename
                timestamp_str = file_path.stem.split('_')[1]
                file_date = datetime.strptime(timestamp_str, '%Y%m%d_%H%M%S')
                
                if file_date >= cutoff_date:
                    with open(file_path, 'r') as f:
                        data = json.load(f)
                    
                    # Find the specific benchmark
                    if 'benchmarks' in data:
                        for bench in data['benchmarks']:
                            if bench.get('id') == benchmark_id:
                                trend_data.append({
                                    'timestamp': file_date.isoformat(),
                                    'time_ms': bench.get('typical', 0) / 1_000_000
                                })
                                break
            except:
                continue
        
        # Calculate trend statistics
        if len(trend_data) >= 3:
            times = [d['time_ms'] for d in trend_data]
            return {
                'benchmark_id': benchmark_id,
                'sample_count': len(trend_data),
                'mean_ms': statistics.mean(times),
                'median_ms': statistics.median(times),
                'stdev_ms': statistics.stdev(times) if len(times) > 1 else 0,
                'min_ms': min(times),
                'max_ms': max(times),
                'trend_direction': 'improving' if times[-1] < times[0] else 'degrading' if times[-1] > times[0] else 'stable',
                'total_change_percent': ((times[-1] - times[0]) / times[0]) * 100 if times[0] > 0 else 0,
                'data': trend_data
            }
        
        return None
    
    def generate_report(self, comparison, output_file=None):
        """Generate a detailed comparison report"""
        report = []
        
        report.append("# 📊 Benchmark Comparison Report")
        report.append("")
        report.append(f"**Generated**: {comparison['timestamp']}")
        report.append(f"**Current**: {comparison['current_file']}")
        report.append(f"**Baseline**: {comparison['baseline_file']}")
        report.append("")
        
        # Summary
        total = len(comparison['regressions']) + len(comparison['improvements']) + len(comparison['stable'])
        report.append("## 📋 Summary")
        report.append("")
        report.append(f"- **Total Benchmarks**: {total}")
        report.append(f"- **Regressions**: {len(comparison['regressions'])}")
        report.append(f"- **Improvements**: {len(comparison['improvements'])}")
        report.append(f"- **Stable**: {len(comparison['stable'])}")
        report.append("")
        
        # Regressions
        if comparison['regressions']:
            report.append("## 🚨 Performance Regressions")
            report.append("")
            report.append("| Benchmark | Current | Baseline | Change | Impact |")
            report.append("|-----------|---------|----------|--------|--------|")
            
            for reg in comparison['regressions']:
                report.append(f"| {reg['id']} | {reg['current_ms']:.2f}ms | {reg['baseline_ms']:.2f}ms | +{reg['change_percent']:.1f}% | 🔴 Regression |")
            report.append("")
        
        # Improvements
        if comparison['improvements']:
            report.append("## 🚀 Performance Improvements")
            report.append("")
            report.append("| Benchmark | Current | Baseline | Change | Impact |")
            report.append("|-----------|---------|----------|--------|--------|")
            
            for imp in comparison['improvements']:
                report.append(f"| {imp['id']} | {imp['current_ms']:.2f}ms | {imp['baseline_ms']:.2f}ms | {imp['change_percent']:.1f}% | 🟢 Improvement |")
            report.append("")
        
        report_text = "\n".join(report)
        
        if output_file:
            with open(output_file, 'w') as f:
                f.write(report_text)
        
        return report_text

def main():
    parser = argparse.ArgumentParser(description='Compare SwiftConcur benchmark results')
    parser.add_argument('current', help='Current benchmark results file')
    parser.add_argument('baseline', help='Baseline benchmark results file')
    parser.add_argument('--output', '-o', help='Output report file')
    parser.add_argument('--config', '-c', default='config.json', help='Configuration file')
    parser.add_argument('--json', action='store_true', help='Output JSON format')
    
    args = parser.parse_args()
    
    comparator = BenchmarkComparator(args.config)
    comparison = comparator.compare_results(args.current, args.baseline)
    
    if comparison is None:
        print("Error: Could not compare benchmark results")
        sys.exit(1)
    
    if args.json:
        print(json.dumps(comparison, indent=2))
    else:
        report = comparator.generate_report(comparison, args.output)
        if not args.output:
            print(report)
    
    # Exit with error code if regressions detected
    if comparison['regressions']:
        sys.exit(1)

if __name__ == '__main__':
    main()
EOF
    
    chmod +x "$BENCHMARK_BASE_DIR/compare-benchmarks.py"
    
    log_success "Comparison utility created: $BENCHMARK_BASE_DIR/compare-benchmarks.py"
}

# Setup data management utilities
setup_data_management() {
    log_info "Setting up data management utilities..."
    
    # Create data cleanup script
    cat > "$BENCHMARK_BASE_DIR/cleanup-old-data.sh" << 'EOF'
#!/bin/bash

# Cleanup old benchmark data based on retention policies

set -e

CONFIG_FILE="$(dirname "$0")/config.json"

if [ -f "$CONFIG_FILE" ]; then
    HISTORY_DAYS=$(jq -r '.storage.retention.history_days // 90' "$CONFIG_FILE")
    CACHE_DAYS=$(jq -r '.storage.retention.cache_days // 30' "$CONFIG_FILE")
    REPORTS_DAYS=$(jq -r '.storage.retention.reports_days // 60' "$CONFIG_FILE")
else
    HISTORY_DAYS=90
    CACHE_DAYS=30
    REPORTS_DAYS=60
fi

echo "🧹 Cleaning up benchmark data..."
echo "  • History retention: $HISTORY_DAYS days"
echo "  • Cache retention: $CACHE_DAYS days"  
echo "  • Reports retention: $REPORTS_DAYS days"

# Cleanup history files
if [ -d "history" ]; then
    find history/ -name "benchmark_*.json" -mtime +$HISTORY_DAYS -delete 2>/dev/null || true
    CLEANED_HISTORY=$(find history/ -name "benchmark_*.json" -mtime +$HISTORY_DAYS 2>/dev/null | wc -l || echo 0)
    echo "  ✅ Cleaned $CLEANED_HISTORY old history files"
fi

# Cleanup cache files
if [ -d "cache" ]; then
    find cache/ -type f -mtime +$CACHE_DAYS -delete 2>/dev/null || true
    echo "  ✅ Cleaned cache files older than $CACHE_DAYS days"
fi

# Cleanup old reports
if [ -d "reports" ]; then
    find reports/ -name "*.md" -mtime +$REPORTS_DAYS -delete 2>/dev/null || true
    find reports/ -name "*.json" -mtime +$REPORTS_DAYS -delete 2>/dev/null || true
    echo "  ✅ Cleaned reports older than $REPORTS_DAYS days"
fi

echo "🎉 Data cleanup completed"
EOF
    
    chmod +x "$BENCHMARK_BASE_DIR/cleanup-old-data.sh"
    
    # Create data export script
    cat > "$BENCHMARK_BASE_DIR/export-benchmark-data.sh" << 'EOF'
#!/bin/bash

# Export benchmark data for external analysis or backup

set -e

EXPORT_DIR="exports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
EXPORT_FILE="benchmark_export_${TIMESTAMP}.tar.gz"

echo "📦 Exporting benchmark data..."

mkdir -p "$EXPORT_DIR"

# Create comprehensive export
tar -czf "$EXPORT_DIR/$EXPORT_FILE" \
    --exclude="exports" \
    --exclude="*.tmp" \
    --exclude="*.log" \
    baseline/ history/ reports/ config.json 2>/dev/null || true

if [ -f "$EXPORT_DIR/$EXPORT_FILE" ]; then
    SIZE=$(du -h "$EXPORT_DIR/$EXPORT_FILE" | cut -f1)
    echo "✅ Export created: $EXPORT_FILE ($SIZE)"
    echo "📁 Location: $EXPORT_DIR/$EXPORT_FILE"
else
    echo "❌ Export failed"
    exit 1
fi
EOF
    
    chmod +x "$BENCHMARK_BASE_DIR/export-benchmark-data.sh"
    
    log_success "Data management utilities created"
}

# Create gitignore for benchmark data
setup_gitignore() {
    log_info "Setting up .gitignore for benchmark data..."
    
    cat > "$BENCHMARK_BASE_DIR/.gitignore" << 'EOF'
# Benchmark data files - exclude from git to prevent repo bloat
# Only configuration and scripts should be versioned

# Benchmark results and history
history/
cache/
baseline/baseline-results.json
reports/

# Exports and archives
exports/
imports/
archives/

# Temporary files
*.tmp
*.log
*.backup

# Cache directories
.criterion/
target/criterion/

# OS and editor files
.DS_Store
Thumbs.db
*.swp
*.swo
*~

# Keep directory structure
!.gitkeep
EOF
    
    # Create .gitkeep files to maintain directory structure
    touch "$BASELINE_DIR/.gitkeep"
    touch "$HISTORY_DIR/.gitkeep"
    touch "$CACHE_DIR/.gitkeep"
    touch "$REPORTS_DIR/.gitkeep"
    
    log_success ".gitignore and directory structure preserved"
}

# Validate setup
validate_setup() {
    log_info "Validating benchmark storage setup..."
    
    local errors=0
    
    # Check directories
    for dir in "$BASELINE_DIR" "$HISTORY_DIR" "$CACHE_DIR" "$REPORTS_DIR"; do
        if [ ! -d "$dir" ]; then
            log_error "Missing directory: $dir"
            errors=$((errors + 1))
        fi
    done
    
    # Check configuration
    if [ ! -f "$CONFIG_FILE" ]; then
        log_error "Missing configuration file: $CONFIG_FILE"
        errors=$((errors + 1))
    elif ! jq empty "$CONFIG_FILE" >/dev/null 2>&1; then
        log_error "Invalid JSON in configuration file: $CONFIG_FILE"
        errors=$((errors + 1))
    fi
    
    # Check scripts
    local scripts=("compare-benchmarks.py" "cleanup-old-data.sh" "export-benchmark-data.sh")
    for script in "${scripts[@]}"; do
        if [ ! -x "$BENCHMARK_BASE_DIR/$script" ]; then
            log_error "Missing or non-executable script: $BENCHMARK_BASE_DIR/$script"
            errors=$((errors + 1))
        fi
    done
    
    if [ $errors -eq 0 ]; then
        log_success "Validation passed - benchmark storage setup is complete"
        return 0
    else
        log_error "Validation failed with $errors errors"
        return 1
    fi
}

# Clean existing data
clean_data() {
    log_warning "Cleaning existing benchmark data..."
    
    if [ -d "$BENCHMARK_BASE_DIR" ]; then
        rm -rf "$BENCHMARK_BASE_DIR"
        log_success "Existing benchmark data cleaned"
    else
        log_info "No existing data to clean"
    fi
}

# Backup data
backup_data() {
    local backup_dir="$1"
    
    if [ ! -d "$BENCHMARK_BASE_DIR" ]; then
        log_warning "No benchmark data to backup"
        return 0
    fi
    
    log_info "Backing up benchmark data to: $backup_dir"
    
    mkdir -p "$backup_dir"
    cp -r "$BENCHMARK_BASE_DIR" "$backup_dir/"
    
    log_success "Backup completed"
}

# Restore data
restore_data() {
    local backup_dir="$1"
    
    if [ ! -d "$backup_dir/$BENCHMARK_BASE_DIR" ]; then
        log_error "Backup directory not found: $backup_dir/$BENCHMARK_BASE_DIR"
        exit 1
    fi
    
    log_info "Restoring benchmark data from: $backup_dir"
    
    if [ -d "$BENCHMARK_BASE_DIR" ]; then
        log_warning "Removing existing benchmark data"
        rm -rf "$BENCHMARK_BASE_DIR"
    fi
    
    cp -r "$backup_dir/$BENCHMARK_BASE_DIR" ./
    
    log_success "Data restored successfully"
}

# Parse command line arguments
CLEAN=false
INIT=false
VALIDATE_ONLY=false
CONFIG_ONLY=false
BACKUP_DIR=""
RESTORE_DIR=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN=true
            shift
            ;;
        --init)
            INIT=true
            shift
            ;;
        --backup)
            BACKUP_DIR="$2"
            shift 2
            ;;
        --restore)
            RESTORE_DIR="$2"
            shift 2
            ;;
        --validate)
            VALIDATE_ONLY=true
            shift
            ;;
        --config-only)
            CONFIG_ONLY=true
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

# Main execution
echo "🗄️ SwiftConcur Benchmark Storage Setup"
echo "======================================"

# Handle backup
if [ -n "$BACKUP_DIR" ]; then
    backup_data "$BACKUP_DIR"
fi

# Handle restore
if [ -n "$RESTORE_DIR" ]; then
    restore_data "$RESTORE_DIR"
    exit 0
fi

# Handle validation only
if [ "$VALIDATE_ONLY" = true ]; then
    validate_setup
    exit $?
fi

# Handle clean
if [ "$CLEAN" = true ]; then
    clean_data
fi

# Setup benchmark storage
if [ "$INIT" = true ] || [ "$CONFIG_ONLY" = true ]; then
    if [ "$CONFIG_ONLY" = false ]; then
        create_directories
        setup_comparison_scripts
        setup_data_management
        setup_gitignore
    fi
    
    setup_configuration
    
    if [ "$CONFIG_ONLY" = false ]; then
        validate_setup
    fi
    
    echo ""
    log_success "🎉 Benchmark storage setup completed!"
    echo ""
    echo "📁 Directory Structure:"
    echo "  • $BENCHMARK_BASE_DIR/"
    echo "    ├── baseline/           (Performance baselines)"
    echo "    ├── history/            (Historical benchmark data)"
    echo "    ├── cache/              (Temporary cache files)"
    echo "    ├── reports/            (Generated reports)"
    echo "    ├── exports/            (Data exports)"
    echo "    ├── config.json         (Configuration)"
    echo "    ├── compare-benchmarks.py (Comparison utility)"
    echo "    ├── cleanup-old-data.sh (Data cleanup)"
    echo "    └── export-benchmark-data.sh (Data export)"
    echo ""
    echo "🔧 Next Steps:"
    echo "  1. Run benchmarks to establish baseline"
    echo "  2. Configure CI integration"
    echo "  3. Set up notification webhooks"
    echo "  4. Schedule regular cleanup"
else
    show_help
fi