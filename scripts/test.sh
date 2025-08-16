#!/bin/bash

# SwiftConcur Testing Script
# Usage: ./scripts/test.sh [component] [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
COMPONENT="all"
COVERAGE=true
WATCH=false
UPDATE_SNAPSHOTS=false
PARALLEL=true
VERBOSE=false

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
SwiftConcur Testing Script

USAGE:
    ./scripts/test.sh [COMPONENT] [OPTIONS]

COMPONENTS:
    all                 Run all tests (default)
    parser              Run Rust parser tests
    dashboard           Run dashboard tests
    api                 Run API tests
    integration         Run integration tests

OPTIONS:
    --no-coverage       Skip coverage collection
    --watch             Run tests in watch mode
    --update-snapshots  Update test snapshots
    --no-parallel       Run tests sequentially
    --verbose           Enable verbose output
    -h, --help          Show this help message

EXAMPLES:
    # Run all tests with coverage
    ./scripts/test.sh

    # Run only parser tests
    ./scripts/test.sh parser

    # Run dashboard tests in watch mode
    ./scripts/test.sh dashboard --watch

    # Run tests without coverage
    ./scripts/test.sh --no-coverage

    # Update snapshots
    ./scripts/test.sh --update-snapshots

EOF
}

run_parser_tests() {
    log_info "Running Rust parser tests..."
    cd parser
    
    # Check formatting first
    log_info "Checking Rust code formatting..."
    cargo fmt --all -- --check
    
    # Run clippy
    log_info "Running Clippy lints..."
    cargo clippy --all-targets --all-features -- -D warnings
    
    # Run unit tests
    log_info "Running Rust unit tests..."
    if [ "$PARALLEL" = true ]; then
        cargo nextest run --workspace --all-features ${VERBOSE:+--verbose}
    else
        cargo test --workspace --all-features ${VERBOSE:+--verbose}
    fi
    
    # Run doctests
    log_info "Running Rust doctests..."
    cargo test --doc --workspace
    
    # Generate coverage if requested
    if [ "$COVERAGE" = true ]; then
        log_info "Generating Rust coverage report..."
        cargo tarpaulin --workspace --engine llvm --out html --out xml --out json \
            --output-dir ../coverage/rust --timeout 120 ${VERBOSE:+--verbose}
        
        # Extract coverage percentage
        RUST_COVERAGE=$(jq -r '.files | map(.summary.lines.percent) | add / length' ../coverage/rust/tarpaulin-report.json)
        log_info "Rust coverage: ${RUST_COVERAGE}%"
        
        # Check threshold
        if (( $(echo "$RUST_COVERAGE < 80" | bc -l) )); then
            log_warning "Rust coverage below 80% threshold"
        else
            log_success "Rust coverage meets threshold"
        fi
    fi
    
    cd ..
    log_success "Rust parser tests completed"
}

run_dashboard_tests() {
    if [ ! -d "dashboard" ]; then
        log_warning "Dashboard directory not found, skipping"
        return 0
    fi
    
    log_info "Running dashboard tests..."
    cd dashboard
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log_info "Installing dashboard dependencies..."
        npm ci
    fi
    
    # Check TypeScript compilation
    log_info "Checking TypeScript compilation..."
    if [ -f "tsconfig.json" ]; then
        npx tsc --noEmit
    fi
    
    # Run ESLint
    log_info "Running ESLint..."
    if [ -f ".eslintrc.js" ] || [ -f ".eslintrc.json" ] || [ -f "eslint.config.js" ]; then
        npm run lint || npx eslint . --ext .js,.ts,.tsx
    fi
    
    # Prepare test command
    TEST_CMD="npm test"
    if [ "$WATCH" = true ]; then
        TEST_CMD="$TEST_CMD -- --watch"
    else
        TEST_CMD="$TEST_CMD -- --watchAll=false"
    fi
    
    if [ "$COVERAGE" = true ]; then
        TEST_CMD="$TEST_CMD -- --coverage"
    fi
    
    if [ "$UPDATE_SNAPSHOTS" = true ]; then
        TEST_CMD="$TEST_CMD -- --updateSnapshot"
    fi
    
    if [ "$VERBOSE" = true ]; then
        TEST_CMD="$TEST_CMD -- --verbose"
    fi
    
    # Run tests
    log_info "Running dashboard tests..."
    eval "$TEST_CMD"
    
    # Check coverage if generated
    if [ "$COVERAGE" = true ] && [ -f "coverage/coverage-summary.json" ]; then
        DASHBOARD_COVERAGE=$(jq -r '.total.lines.pct' coverage/coverage-summary.json)
        log_info "Dashboard coverage: ${DASHBOARD_COVERAGE}%"
        
        if (( $(echo "$DASHBOARD_COVERAGE < 80" | bc -l) )); then
            log_warning "Dashboard coverage below 80% threshold"
        else
            log_success "Dashboard coverage meets threshold"
        fi
    fi
    
    cd ..
    log_success "Dashboard tests completed"
}

run_api_tests() {
    if [ ! -d "api" ]; then
        log_warning "API directory not found, skipping"
        return 0
    fi
    
    log_info "Running API tests..."
    cd api
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log_info "Installing API dependencies..."
        npm ci
    fi
    
    # Check TypeScript compilation
    log_info "Checking TypeScript compilation..."
    if [ -f "tsconfig.json" ]; then
        npx tsc --noEmit
    fi
    
    # Prepare vitest command
    TEST_CMD="npx vitest run"
    
    if [ "$WATCH" = true ]; then
        TEST_CMD="npx vitest"
    fi
    
    if [ "$COVERAGE" = true ]; then
        TEST_CMD="$TEST_CMD --coverage"
    fi
    
    if [ "$UPDATE_SNAPSHOTS" = true ]; then
        TEST_CMD="$TEST_CMD --update-snapshots"
    fi
    
    if [ "$VERBOSE" = true ]; then
        TEST_CMD="$TEST_CMD --reporter=verbose"
    fi
    
    # Run tests
    log_info "Running API tests..."
    eval "$TEST_CMD"
    
    # Check coverage if generated
    if [ "$COVERAGE" = true ] && [ -f "coverage/coverage-summary.json" ]; then
        API_COVERAGE=$(jq -r '.total.lines.pct' coverage/coverage-summary.json)
        log_info "API coverage: ${API_COVERAGE}%"
        
        if (( $(echo "$API_COVERAGE < 80" | bc -l) )); then
            log_warning "API coverage below 80% threshold"
        else
            log_success "API coverage meets threshold"
        fi
    fi
    
    cd ..
    log_success "API tests completed"
}

run_integration_tests() {
    log_info "Running integration tests..."
    
    # Build parser first
    log_info "Building parser for integration tests..."
    cd parser
    cargo build --release
    cd ..
    
    # Copy binary for tests
    cp parser/target/release/swiftconcur-parser swiftconcur-cli
    chmod +x swiftconcur-cli
    
    # Run parser integration tests
    log_info "Running parser integration tests..."
    cd parser/tests/fixtures
    
    # Test with sample fixtures
    for fixture in *.json; do
        if [ -f "$fixture" ]; then
            log_info "Testing with fixture: $fixture"
            ../../../swiftconcur-cli -f "$fixture" --format json > "/tmp/test_${fixture%.*}.json"
            
            # Basic validation - check if output is valid JSON
            if jq empty "/tmp/test_${fixture%.*}.json" 2>/dev/null; then
                log_success "✅ $fixture: Valid JSON output"
            else
                log_error "❌ $fixture: Invalid JSON output"
                exit 1
            fi
        fi
    done
    
    cd ../../..
    
    # Clean up
    rm -f swiftconcur-cli
    
    log_success "Integration tests completed"
}

generate_coverage_report() {
    if [ "$COVERAGE" != true ]; then
        return 0
    fi
    
    log_info "Generating comprehensive coverage report..."
    
    mkdir -p coverage/combined
    
    # Create combined coverage report
    cat > coverage/combined/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>SwiftConcur Test Coverage Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .component { margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
        .coverage-bar { width: 200px; height: 20px; background: #f0f0f0; border-radius: 10px; overflow: hidden; }
        .coverage-fill { height: 100%; background: linear-gradient(90deg, #ff4444, #ffaa44, #44ff44); }
        .high { background: #44ff44; }
        .medium { background: #ffaa44; }
        .low { background: #ff4444; }
    </style>
</head>
<body>
    <h1>SwiftConcur Test Coverage Report</h1>
    <p>Generated on: <strong>$(date)</strong></p>
    
    <div class="component">
        <h2>Rust Parser</h2>
        <p>Location: <a href="../rust/tarpaulin-report.html">View Report</a></p>
        <div class="coverage-bar">
            <div class="coverage-fill high" style="width: ${RUST_COVERAGE:-0}%"></div>
        </div>
        <p>Coverage: <strong>${RUST_COVERAGE:-0}%</strong></p>
    </div>
    
    <div class="component">
        <h2>Dashboard</h2>
        <p>Location: <a href="../../dashboard/coverage/lcov-report/index.html">View Report</a></p>
        <div class="coverage-bar">
            <div class="coverage-fill medium" style="width: ${DASHBOARD_COVERAGE:-0}%"></div>
        </div>
        <p>Coverage: <strong>${DASHBOARD_COVERAGE:-0}%</strong></p>
    </div>
    
    <div class="component">
        <h2>API</h2>
        <p>Location: <a href="../../api/coverage/index.html">View Report</a></p>
        <div class="coverage-bar">
            <div class="coverage-fill medium" style="width: ${API_COVERAGE:-0}%"></div>
        </div>
        <p>Coverage: <strong>${API_COVERAGE:-0}%</strong></p>
    </div>
</body>
</html>
EOF
    
    log_success "Combined coverage report generated: coverage/combined/index.html"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        all|parser|dashboard|api|integration)
            COMPONENT="$1"
            shift
            ;;
        --no-coverage)
            COVERAGE=false
            shift
            ;;
        --watch)
            WATCH=true
            shift
            ;;
        --update-snapshots)
            UPDATE_SNAPSHOTS=true
            shift
            ;;
        --no-parallel)
            PARALLEL=false
            shift
            ;;
        --verbose)
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

# Main execution
echo "🧪 SwiftConcur Test Suite"
echo "========================"
echo "Component: $COMPONENT"
echo "Coverage: $COVERAGE"
echo "Watch: $WATCH"
echo "Verbose: $VERBOSE"
echo ""

# Check prerequisites
log_info "Checking prerequisites..."
for tool in cargo jq bc; do
    if ! command -v $tool &> /dev/null; then
        log_error "$tool is required but not installed"
        exit 1
    fi
done

# Run tests based on component
case $COMPONENT in
    parser)
        run_parser_tests
        ;;
    dashboard)
        run_dashboard_tests
        ;;
    api)
        run_api_tests
        ;;
    integration)
        run_integration_tests
        ;;
    all)
        run_parser_tests
        run_dashboard_tests
        run_api_tests
        run_integration_tests
        generate_coverage_report
        ;;
esac

log_success "All tests completed successfully! 🎉"

# Open coverage report if generated and not in watch mode
if [ "$COVERAGE" = true ] && [ "$WATCH" != true ] && [ "$COMPONENT" = "all" ]; then
    log_info "Coverage reports available:"
    echo "  - Combined: coverage/combined/index.html"
    echo "  - Rust: coverage/rust/tarpaulin-report.html"
    echo "  - Dashboard: dashboard/coverage/lcov-report/index.html"
    echo "  - API: api/coverage/index.html"
    
    # Open in browser if available
    if command -v open &> /dev/null; then
        open coverage/combined/index.html
    elif command -v xdg-open &> /dev/null; then
        xdg-open coverage/combined/index.html
    fi
fi