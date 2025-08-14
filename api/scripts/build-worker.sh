#!/bin/bash

# Cloudflare Worker Build Script
# Comprehensive build process for SwiftConcur API Worker

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-development}
BUILD_MODE=${2:-standard}
OUTPUT_DIR="dist"
WORKER_NAME="swiftconcur-api"

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
Cloudflare Worker Build Script

USAGE:
    ./scripts/build-worker.sh [ENVIRONMENT] [BUILD_MODE]

ARGUMENTS:
    ENVIRONMENT     Target environment (development|staging|production) [default: development]
    BUILD_MODE      Build mode (standard|optimized|debug) [default: standard]

OPTIONS:
    -h, --help      Show this help message
    --clean         Clean build artifacts before building
    --analyze       Run bundle analysis after build
    --validate      Validate build without deployment

EXAMPLES:
    # Development build
    ./scripts/build-worker.sh development

    # Production optimized build
    ./scripts/build-worker.sh production optimized

    # Debug build with analysis
    ./scripts/build-worker.sh development debug --analyze

EOF
}

# Parse command line arguments
CLEAN=false
ANALYZE=false
VALIDATE_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN=true
            shift
            ;;
        --analyze)
            ANALYZE=true
            shift
            ;;
        --validate)
            VALIDATE_ONLY=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            if [[ $1 =~ ^(development|staging|production)$ ]]; then
                ENVIRONMENT="$1"
            elif [[ $1 =~ ^(standard|optimized|debug)$ ]]; then
                BUILD_MODE="$1"
            fi
            shift
            ;;
    esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
    log_error "Invalid environment: $ENVIRONMENT"
    log_info "Valid environments: development, staging, production"
    exit 1
fi

# Validate build mode
if [[ ! "$BUILD_MODE" =~ ^(standard|optimized|debug)$ ]]; then
    log_error "Invalid build mode: $BUILD_MODE"
    log_info "Valid build modes: standard, optimized, debug"
    exit 1
fi

echo "🏗️ SwiftConcur Cloudflare Worker Build"
echo "====================================="
echo "Environment: $ENVIRONMENT"
echo "Build Mode: $BUILD_MODE"
echo "Output: $OUTPUT_DIR"
echo ""

# Check prerequisites
check_prerequisites() {
    log_info "Checking build prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is required but not installed"
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        log_error "Node.js 18+ required. Current version: $(node --version)"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is required but not installed"
        exit 1
    fi
    
    # Check Wrangler
    if ! command -v wrangler &> /dev/null && ! npm list -g wrangler &> /dev/null; then
        log_warning "Wrangler CLI not found globally, will use local version"
    fi
    
    # Check package.json
    if [ ! -f "package.json" ]; then
        log_error "package.json not found. Run from api/ directory"
        exit 1
    fi
    
    # Check wrangler.toml
    if [ ! -f "wrangler.toml" ]; then
        log_error "wrangler.toml not found"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Clean build artifacts
clean_build() {
    if [ "$CLEAN" = true ]; then
        log_info "Cleaning build artifacts..."
        
        rm -rf "$OUTPUT_DIR"
        rm -rf node_modules/.cache
        rm -rf .wrangler
        rm -f src/build-info.json
        
        log_success "Build artifacts cleaned"
    fi
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    # Use npm ci for faster, reliable builds in CI
    if [ -f "package-lock.json" ] && [ "${CI:-false}" = "true" ]; then
        npm ci --prefer-offline --no-audit
    else
        npm install --prefer-offline
    fi
    
    log_success "Dependencies installed"
}

# Generate build information
generate_build_info() {
    log_info "Generating build information..."
    
    # Get git information
    GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    GIT_TAG=$(git describe --tags --exact-match 2>/dev/null || echo "")
    
    # Create build info
    BUILD_INFO=$(cat << EOF
{
  "buildTime": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "gitCommit": "$GIT_COMMIT",
  "gitBranch": "$GIT_BRANCH",
  "gitTag": "$GIT_TAG",
  "environment": "$ENVIRONMENT",
  "buildMode": "$BUILD_MODE",
  "nodeVersion": "$(node --version)",
  "wranglerVersion": "$(npx wrangler --version 2>/dev/null || echo 'unknown')",
  "buildNumber": "${GITHUB_RUN_NUMBER:-local}",
  "buildUrl": "${GITHUB_SERVER_URL:-}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}"
}
EOF
    )
    
    echo "$BUILD_INFO" > src/build-info.json
    
    log_success "Build information generated"
}

# Run pre-build checks
pre_build_checks() {
    log_info "Running pre-build checks..."
    
    # TypeScript compilation check
    log_info "Checking TypeScript compilation..."
    npm run type-check
    
    # ESLint check
    log_info "Running ESLint..."
    npm run lint
    
    # Run tests based on build mode
    if [ "$BUILD_MODE" = "debug" ]; then
        log_info "Running comprehensive tests (debug mode)..."
        npm run test
    elif [ "$BUILD_MODE" = "optimized" ]; then
        log_info "Running critical tests (optimized mode)..."
        npm run test -- --run tests/critical/
    else
        log_info "Running standard tests..."
        npm run test -- --run --reporter=basic
    fi
    
    log_success "Pre-build checks passed"
}

# Build the worker
build_worker() {
    log_info "Building Cloudflare Worker..."
    
    # Create output directory
    mkdir -p "$OUTPUT_DIR"
    
    # Set build-specific environment variables
    case "$BUILD_MODE" in
        optimized)
            export NODE_ENV=production
            export WRANGLER_SEND_METRICS=false
            ;;
        debug)
            export NODE_ENV=development
            export DEBUG=true
            ;;
        standard)
            export NODE_ENV=production
            ;;
    esac
    
    # Validate wrangler configuration
    log_info "Validating Wrangler configuration..."
    npx wrangler validate
    
    # Perform dry-run build to catch issues early
    log_info "Performing dry-run build..."
    npx wrangler deploy --dry-run --env "$ENVIRONMENT" --outdir "$OUTPUT_DIR"
    
    # Bundle size analysis (if requested or for optimized builds)
    if [ "$ANALYZE" = true ] || [ "$BUILD_MODE" = "optimized" ]; then
        analyze_bundle
    fi
    
    log_success "Worker build completed"
}

# Analyze bundle size and performance
analyze_bundle() {
    log_info "Analyzing bundle size and performance..."
    
    # Create a temporary analysis build
    ANALYSIS_DIR="analysis"
    mkdir -p "$ANALYSIS_DIR"
    
    # Generate bundle analysis
    npx wrangler deploy --dry-run --env "$ENVIRONMENT" --outdir "$ANALYSIS_DIR" --minify
    
    # Analyze the built files
    if [ -f "$ANALYSIS_DIR/index.js" ]; then
        BUNDLE_SIZE=$(stat -f%z "$ANALYSIS_DIR/index.js" 2>/dev/null || stat -c%s "$ANALYSIS_DIR/index.js" 2>/dev/null || echo "unknown")
        BUNDLE_SIZE_KB=$((BUNDLE_SIZE / 1024))
        
        echo ""
        echo "📊 Bundle Analysis Results"
        echo "========================="
        echo "Bundle Size: ${BUNDLE_SIZE_KB}KB"
        
        # Warn if bundle is large
        if [ "$BUNDLE_SIZE_KB" -gt 1000 ]; then
            log_warning "Bundle size is large (${BUNDLE_SIZE_KB}KB). Consider optimization."
        elif [ "$BUNDLE_SIZE_KB" -gt 500 ]; then
            log_warning "Bundle size is moderate (${BUNDLE_SIZE_KB}KB). Monitor growth."
        else
            log_success "Bundle size is good (${BUNDLE_SIZE_KB}KB)"
        fi
        
        # Check for common optimization opportunities
        if grep -q "console.log\|console.debug" "$ANALYSIS_DIR/index.js"; then
            log_warning "Bundle contains console statements - consider removing for production"
        fi
        
        # Estimate cold start time
        ESTIMATED_COLD_START=$((BUNDLE_SIZE_KB / 10))
        echo "Estimated Cold Start: ~${ESTIMATED_COLD_START}ms"
        
    fi
    
    # Cleanup analysis files
    rm -rf "$ANALYSIS_DIR"
    
    log_success "Bundle analysis completed"
}

# Validate the built worker
validate_build() {
    log_info "Validating built worker..."
    
    # Check if build artifacts exist
    if [ ! -d "$OUTPUT_DIR" ]; then
        log_error "Build output directory not found: $OUTPUT_DIR"
        exit 1
    fi
    
    # Validate worker configuration
    npx wrangler validate
    
    # Test worker locally (if not in CI)
    if [ "${CI:-false}" != "true" ] && [ "$VALIDATE_ONLY" = true ]; then
        log_info "Starting local worker for validation..."
        
        # Start worker in background for testing
        npx wrangler dev --local --env "$ENVIRONMENT" &
        WORKER_PID=$!
        
        # Wait for worker to start
        sleep 5
        
        # Test health endpoint
        if curl -s "http://localhost:8787/health" > /dev/null; then
            log_success "Local worker validation passed"
        else
            log_warning "Local worker health check failed"
        fi
        
        # Stop the worker
        kill $WORKER_PID 2>/dev/null || true
    fi
    
    log_success "Build validation completed"
}

# Generate deployment summary
generate_summary() {
    log_info "Generating build summary..."
    
    SUMMARY_FILE="$OUTPUT_DIR/build-summary.json"
    
    BUILD_SUMMARY=$(cat << EOF
{
  "build": {
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "environment": "$ENVIRONMENT",
    "buildMode": "$BUILD_MODE",
    "worker": "$WORKER_NAME",
    "success": true
  },
  "git": {
    "commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
    "tag": "$(git describe --tags --exact-match 2>/dev/null || echo '')"
  },
  "tools": {
    "node": "$(node --version)",
    "npm": "$(npm --version)",
    "wrangler": "$(npx wrangler --version 2>/dev/null || echo 'unknown')"
  },
  "configuration": {
    "compatibilityDate": "$(grep compatibility_date wrangler.toml | cut -d'"' -f2)",
    "main": "$(grep '^main = ' wrangler.toml | cut -d'"' -f2)"
  }
}
EOF
    )
    
    echo "$BUILD_SUMMARY" > "$SUMMARY_FILE"
    
    echo ""
    echo "📋 Build Summary"
    echo "==============="
    echo "Environment: $ENVIRONMENT"
    echo "Build Mode: $BUILD_MODE"
    echo "Worker Name: $WORKER_NAME"
    echo "Output Directory: $OUTPUT_DIR"
    echo "Build Info: src/build-info.json"
    echo "Summary: $SUMMARY_FILE"
    echo ""
    
    log_success "Build summary generated"
}

# Main build process
main() {
    check_prerequisites
    clean_build
    install_dependencies
    generate_build_info
    pre_build_checks
    build_worker
    validate_build
    generate_summary
    
    echo ""
    log_success "🎉 Cloudflare Worker build completed successfully!"
    echo ""
    echo "📁 Next Steps:"
    echo "  • Deploy: npx wrangler deploy --env $ENVIRONMENT"
    echo "  • Test locally: npx wrangler dev --env $ENVIRONMENT"
    echo "  • Monitor: npx wrangler tail --env $ENVIRONMENT"
    echo ""
}

# Error handling
trap 'log_error "Build failed on line $LINENO"' ERR

# Run main process
main