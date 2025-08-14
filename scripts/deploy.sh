#!/bin/bash

# SwiftConcur Deployment Management Script
# Usage: ./scripts/deploy.sh [command] [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT=""
VERSION=""
ACTION=""
SKIP_TESTS=false
FORCE=false
DRY_RUN=false

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
SwiftConcur Deployment Management Script

USAGE:
    ./scripts/deploy.sh [COMMAND] [OPTIONS]

COMMANDS:
    deploy          Deploy to specified environment
    rollback        Rollback to previous version
    status          Check deployment status
    monitor         Monitor deployment health
    security        Run security scans
    cleanup         Clean up old artifacts

OPTIONS:
    -e, --environment ENV    Target environment (staging|production)
    -v, --version VERSION    Version to deploy/rollback to
    -s, --skip-tests        Skip test execution
    -f, --force             Force deployment (bypass checks)
    -n, --dry-run           Show what would be done without executing
    -h, --help              Show this help message

EXAMPLES:
    # Deploy to staging
    ./scripts/deploy.sh deploy --environment staging

    # Deploy specific version to production
    ./scripts/deploy.sh deploy --environment production --version v1.2.3

    # Rollback production to previous version
    ./scripts/deploy.sh rollback --environment production --version v1.2.2

    # Check deployment status
    ./scripts/deploy.sh status --environment production

    # Run security scan
    ./scripts/deploy.sh security --environment staging

    # Dry run deployment
    ./scripts/deploy.sh deploy --environment staging --dry-run

EOF
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check required tools
    for tool in gh jq curl; do
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

validate_environment() {
    case $ENVIRONMENT in
        staging|production)
            log_info "Environment: $ENVIRONMENT"
            ;;
        "")
            log_error "Environment is required. Use -e/--environment flag"
            exit 1
            ;;
        *)
            log_error "Invalid environment: $ENVIRONMENT. Use 'staging' or 'production'"
            exit 1
            ;;
    esac
}

validate_version() {
    if [ -n "$VERSION" ]; then
        # Check if version exists as a git tag
        if ! git tag -l | grep -q "^${VERSION}$"; then
            log_error "Version $VERSION not found as a git tag"
            log_info "Available versions:"
            git tag -l --sort=-version:refname | head -10
            exit 1
        fi
        log_info "Version: $VERSION"
    fi
}

deploy_command() {
    log_info "Starting deployment to $ENVIRONMENT"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would deploy to $ENVIRONMENT"
        log_info "DRY RUN: Would trigger workflow: enhanced-ci.yml"
        log_info "DRY RUN: Would use parameters:"
        echo "  - environment: $ENVIRONMENT"
        echo "  - skip_tests: $SKIP_TESTS"
        [ -n "$VERSION" ] && echo "  - version: $VERSION"
        return 0
    fi
    
    # Build workflow dispatch parameters
    PARAMS="--field environment=$ENVIRONMENT"
    
    if [ "$SKIP_TESTS" = true ]; then
        PARAMS="$PARAMS --field skip_tests=true"
    fi
    
    # Trigger deployment workflow
    log_info "Triggering deployment workflow..."
    
    if [ -n "$VERSION" ]; then
        # Deploy specific version
        gh workflow run enhanced-release.yml \
            $PARAMS \
            --field version_type=deploy \
            --field deploy_version="$VERSION"
    else
        # Deploy latest from branch
        gh workflow run enhanced-ci.yml $PARAMS
    fi
    
    log_success "Deployment workflow triggered"
    log_info "Monitor progress: gh run list --workflow=enhanced-ci.yml"
}

rollback_command() {
    if [ -z "$VERSION" ]; then
        log_error "Version is required for rollback. Use -v/--version flag"
        exit 1
    fi
    
    log_warning "Rolling back $ENVIRONMENT to $VERSION"
    
    if [ "$ENVIRONMENT" = "production" ] && [ "$FORCE" != true ]; then
        log_warning "Production rollback requires confirmation"
        read -p "Are you sure you want to rollback production to $VERSION? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Rollback cancelled"
            exit 0
        fi
    fi
    
    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would rollback $ENVIRONMENT to $VERSION"
        return 0
    fi
    
    log_info "Triggering rollback workflow..."
    gh workflow run deployment-monitor.yml \
        --field action=rollback \
        --field environment="$ENVIRONMENT" \
        --field rollback_version="$VERSION"
    
    log_success "Rollback workflow triggered"
    log_info "Monitor progress: gh run list --workflow=deployment-monitor.yml"
}

status_command() {
    log_info "Checking deployment status for $ENVIRONMENT"
    
    # Get latest workflow run
    LATEST_RUN=$(gh run list --workflow=enhanced-ci.yml --json status,conclusion,url,headSha --jq '.[0]')
    
    if [ "$LATEST_RUN" = "null" ]; then
        log_warning "No deployment runs found"
        exit 0
    fi
    
    STATUS=$(echo "$LATEST_RUN" | jq -r '.status')
    CONCLUSION=$(echo "$LATEST_RUN" | jq -r '.conclusion // "in_progress"')
    URL=$(echo "$LATEST_RUN" | jq -r '.url')
    SHA=$(echo "$LATEST_RUN" | jq -r '.headSha')
    
    log_info "Latest deployment:"
    echo "  Status: $STATUS"
    echo "  Conclusion: $CONCLUSION"
    echo "  Commit: $SHA"
    echo "  URL: $URL"
    
    # Check health status if deployed
    if [ "$CONCLUSION" = "success" ]; then
        check_health_status
    fi
}

check_health_status() {
    log_info "Checking application health..."
    
    case $ENVIRONMENT in
        staging)
            HEALTH_URL="https://staging.gradualsystems.io/SwiftConcur/api/health"
            ;;
        production)
            HEALTH_URL="https://gradualsystems.io/SwiftConcur/api/health"
            ;;
    esac
    
    if curl -f -s "$HEALTH_URL" > /dev/null; then
        log_success "Application is healthy"
    else
        log_error "Application health check failed"
        log_info "URL: $HEALTH_URL"
    fi
}

monitor_command() {
    log_info "Starting deployment monitoring for $ENVIRONMENT"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would start monitoring for $ENVIRONMENT"
        return 0
    fi
    
    gh workflow run deployment-monitor.yml \
        --field action=monitor \
        --field environment="$ENVIRONMENT"
    
    log_success "Monitoring workflow triggered"
    log_info "Monitor progress: gh run list --workflow=deployment-monitor.yml"
}

security_command() {
    log_info "Starting security scan"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would run comprehensive security scan"
        return 0
    fi
    
    gh workflow run security-scan.yml \
        --field scan_type=comprehensive
    
    log_success "Security scan workflow triggered"
    log_info "Monitor progress: gh run list --workflow=security-scan.yml"
}

cleanup_command() {
    log_info "Starting cleanup process"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would clean up old artifacts and deployments"
        return 0
    fi
    
    # Get old workflow runs (older than 30 days)
    OLD_RUNS=$(gh run list --json databaseId,createdAt --jq '.[] | select(.createdAt < (now - 30*24*3600 | strftime("%Y-%m-%dT%H:%M:%SZ"))) | .databaseId')
    
    if [ -n "$OLD_RUNS" ]; then
        log_info "Cleaning up old workflow runs..."
        echo "$OLD_RUNS" | while read run_id; do
            gh run delete "$run_id" --confirm
        done
        log_success "Old workflow runs cleaned up"
    else
        log_info "No old workflow runs to clean up"
    fi
    
    # Clean up old artifacts (this would require additional API calls)
    log_info "Triggering artifact cleanup..."
    # This would be handled by the cleanup job in the workflows
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        deploy|rollback|status|monitor|security|cleanup)
            ACTION="$1"
            shift
            ;;
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -s|--skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -n|--dry-run)
            DRY_RUN=true
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
if [ -z "$ACTION" ]; then
    log_error "No command specified"
    show_help
    exit 1
fi

# Show banner
cat << "EOF"
   ____         _ ______  ______                               
  / __/      __(_) __/ /_/ ____/___  ____  _______  _______   
 _\ \| | /| / / / /_/ __/ /   / __ \/ __ \/ ___/ / / / ___/   
/___/| |/ |/ / / __/ /_/ /___/ /_/ / / / / /__/ /_/ / /       
     |__/|__/_/_/  \__/\____/\____/_/ /_/\___/\__,_/_/        

          Deployment Management Script
EOF

echo

check_prerequisites

case $ACTION in
    deploy)
        validate_environment
        validate_version
        deploy_command
        ;;
    rollback)
        validate_environment
        validate_version
        rollback_command
        ;;
    status)
        validate_environment
        status_command
        ;;
    monitor)
        validate_environment
        monitor_command
        ;;
    security)
        security_command
        ;;
    cleanup)
        cleanup_command
        ;;
    *)
        log_error "Unknown command: $ACTION"
        exit 1
        ;;
esac

log_success "Command completed successfully"