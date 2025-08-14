#!/bin/bash

# Cloudflare Worker Deployment Verification & Rollback Script
# Comprehensive testing and rollback capabilities for Worker deployments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-development}
VERIFICATION_TIMEOUT=300  # 5 minutes
HEALTH_CHECK_RETRIES=10
ROLLBACK_ENABLED=true

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
Cloudflare Worker Deployment Verification Script

USAGE:
    ./scripts/deployment-verification.sh [ENVIRONMENT] [OPTIONS]

ARGUMENTS:
    ENVIRONMENT     Target environment (development|staging|production) [default: development]

OPTIONS:
    --timeout SECONDS       Verification timeout in seconds [default: 300]
    --retries COUNT         Health check retry count [default: 10]
    --no-rollback          Disable automatic rollback on failure
    --rollback-only        Only perform rollback operation
    --verify-only          Only perform verification (no rollback)
    -h, --help             Show this help message

EXAMPLES:
    # Verify development deployment
    ./scripts/deployment-verification.sh development

    # Verify production with custom timeout
    ./scripts/deployment-verification.sh production --timeout 600

    # Rollback production deployment
    ./scripts/deployment-verification.sh production --rollback-only

EOF
}

# Get Worker URL for environment
get_worker_url() {
    local env="$1"
    
    case "$env" in
        development)
            echo "https://swiftconcur-api-dev.workers.dev"
            ;;
        staging)
            echo "https://swiftconcur-api-staging.workers.dev"
            ;;
        production)
            echo "https://swiftconcur-api.workers.dev"
            ;;
        *)
            log_error "Unknown environment: $env"
            exit 1
            ;;
    esac
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking verification prerequisites..."
    
    # Check curl
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi
    
    # Check jq
    if ! command -v jq &> /dev/null; then
        log_error "jq is required but not installed"
        exit 1
    fi
    
    # Check Wrangler CLI
    if ! command -v wrangler &> /dev/null; then
        log_error "Wrangler CLI not found. Install with: npm install -g wrangler"
        exit 1
    fi
    
    # Check authentication
    if ! wrangler whoami &> /dev/null; then
        log_error "Wrangler not authenticated. Run: wrangler login"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Basic health check
health_check() {
    local worker_url="$1"
    local retries="$2"
    
    log_info "Performing health check: $worker_url"
    
    for i in $(seq 1 $retries); do
        log_info "Health check attempt $i/$retries..."
        
        local http_status
        local response_time
        
        # Measure response time and get status
        local start_time=$(date +%s%N)
        http_status=$(curl -s -o /dev/null -w "%{http_code}" "$worker_url/health" --max-time 30 || echo "000")
        local end_time=$(date +%s%N)
        response_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
        
        if [ "$http_status" = "200" ]; then
            log_success "Health check passed (${response_time}ms)"
            return 0
        else
            log_warning "Health check failed - HTTP $http_status (${response_time}ms)"
            
            if [ $i -lt $retries ]; then
                sleep $(( i * 5 )) # Exponential backoff
            fi
        fi
    done
    
    log_error "Health check failed after $retries attempts"
    return 1
}

# Detailed service verification
detailed_verification() {
    local worker_url="$1"
    
    log_info "Performing detailed service verification..."
    
    # Test detailed health endpoint
    log_info "Testing detailed health endpoint..."
    local health_response
    health_response=$(curl -s "$worker_url/health?detailed=true" --max-time 30 || echo "")
    
    if [ -z "$health_response" ]; then
        log_error "Failed to get detailed health response"
        return 1
    fi
    
    # Parse health response
    local status
    status=$(echo "$health_response" | jq -r '.status // "unknown"')
    
    if [ "$status" != "healthy" ]; then
        log_error "Worker status is not healthy: $status"
        return 1
    fi
    
    log_success "Detailed health check passed"
    
    # Test CORS headers
    log_info "Testing CORS configuration..."
    local cors_headers
    cors_headers=$(curl -s -I "$worker_url/health" --max-time 30 | grep -i "access-control" || echo "")
    
    if [ -z "$cors_headers" ]; then
        log_warning "CORS headers not found"
    else
        log_success "CORS headers configured correctly"
    fi
    
    # Test 404 handling
    log_info "Testing 404 error handling..."
    local notfound_status
    notfound_status=$(curl -s -o /dev/null -w "%{http_code}" "$worker_url/non-existent-endpoint" --max-time 30 || echo "000")
    
    if [ "$notfound_status" = "404" ]; then
        log_success "404 handling works correctly"
    else
        log_warning "Unexpected status for 404 test: $notfound_status"
    fi
    
    # Test authentication on protected endpoints
    log_info "Testing authentication on protected endpoints..."
    local auth_status
    auth_status=$(curl -s -o /dev/null -w "%{http_code}" "$worker_url/v1/warnings" -X POST --max-time 30 || echo "000")
    
    if [ "$auth_status" = "401" ]; then
        log_success "Authentication protection working correctly"
    else
        log_warning "Unexpected auth status: $auth_status"
    fi
    
    return 0
}

# Performance verification
performance_verification() {
    local worker_url="$1"
    
    log_info "Performing performance verification..."
    
    local total_time=0
    local success_count=0
    local test_count=5
    
    for i in $(seq 1 $test_count); do
        local start_time=$(date +%s%N)
        local http_status
        http_status=$(curl -s -o /dev/null -w "%{http_code}" "$worker_url/health" --max-time 30 || echo "000")
        local end_time=$(date +%s%N)
        
        local response_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
        
        if [ "$http_status" = "200" ]; then
            total_time=$((total_time + response_time))
            success_count=$((success_count + 1))
            log_info "Performance test $i: ${response_time}ms"
        else
            log_warning "Performance test $i failed: HTTP $http_status"
        fi
        
        sleep 1
    done
    
    if [ $success_count -eq 0 ]; then
        log_error "All performance tests failed"
        return 1
    fi
    
    local avg_response_time=$((total_time / success_count))
    log_info "Average response time: ${avg_response_time}ms ($success_count/$test_count successful)"
    
    # Performance thresholds
    if [ $avg_response_time -gt 5000 ]; then
        log_error "Average response time too high: ${avg_response_time}ms (threshold: 5000ms)"
        return 1
    elif [ $avg_response_time -gt 2000 ]; then
        log_warning "Average response time elevated: ${avg_response_time}ms"
    else
        log_success "Performance verification passed: ${avg_response_time}ms"
    fi
    
    return 0
}

# Get deployment history
get_deployment_history() {
    local env="$1"
    
    log_info "Getting deployment history for environment: $env"
    
    # Get deployment list from Wrangler
    local deployments
    deployments=$(wrangler deployments list --env "$env" --json 2>/dev/null || echo "[]")
    
    if [ "$deployments" = "[]" ]; then
        log_warning "No deployment history found"
        return 1
    fi
    
    echo "$deployments"
    return 0
}

# Rollback deployment
rollback_deployment() {
    local env="$1"
    
    log_warning "Initiating rollback for environment: $env"
    
    # Get deployment history
    local deployments
    deployments=$(get_deployment_history "$env")
    
    if [ $? -ne 0 ]; then
        log_error "Cannot rollback - no deployment history available"
        return 1
    fi
    
    # Get previous deployment ID
    local previous_deployment
    previous_deployment=$(echo "$deployments" | jq -r '.[1].id // empty' 2>/dev/null)
    
    if [ -z "$previous_deployment" ]; then
        log_error "No previous deployment found for rollback"
        return 1
    fi
    
    log_info "Rolling back to deployment: $previous_deployment"
    
    # Confirm rollback in production
    if [ "$env" = "production" ]; then
        echo ""
        log_warning "You are about to rollback PRODUCTION environment"
        read -p "Are you sure? (y/N): " -n 1 -r
        echo ""
        
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Rollback cancelled"
            return 1
        fi
    fi
    
    # Perform rollback
    log_info "Executing rollback..."
    
    if wrangler rollback --env "$env" "$previous_deployment"; then
        log_success "Rollback completed successfully"
        
        # Wait for rollback to propagate
        log_info "Waiting for rollback to propagate..."
        sleep 15
        
        # Verify rollback
        local worker_url
        worker_url=$(get_worker_url "$env")
        
        if health_check "$worker_url" 5; then
            log_success "Rollback verification passed"
            
            # Send rollback notification
            send_rollback_notification "$env" "$previous_deployment"
            
            return 0
        else
            log_error "Rollback verification failed"
            return 1
        fi
    else
        log_error "Rollback failed"
        return 1
    fi
}

# Send rollback notification
send_rollback_notification() {
    local env="$1"
    local deployment_id="$2"
    
    log_info "Sending rollback notification..."
    
    local notification_payload
    notification_payload=$(cat << EOF
{
  "text": "⚠️ SwiftConcur API Rollback Executed",
  "attachments": [
    {
      "color": "warning",
      "fields": [
        {
          "title": "Environment",
          "value": "$env",
          "short": true
        },
        {
          "title": "Rollback To",
          "value": "$deployment_id",
          "short": true
        },
        {
          "title": "Timestamp",
          "value": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
          "short": true
        },
        {
          "title": "Initiated By",
          "value": "Deployment Verification Script",
          "short": true
        }
      ]
    }
  ]
}
EOF
    )
    
    # Send to Slack if webhook is available
    if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
        curl -X POST -H 'Content-type: application/json' \
             --data "$notification_payload" \
             "$SLACK_WEBHOOK_URL" &>/dev/null || log_warning "Failed to send Slack notification"
    fi
}

# Comprehensive verification
verify_deployment() {
    local env="$1"
    local worker_url
    
    worker_url=$(get_worker_url "$env")
    
    log_info "Starting comprehensive verification for: $worker_url"
    
    # Wait for deployment to propagate
    log_info "Waiting for deployment to propagate..."
    sleep 10
    
    # Step 1: Basic health check
    if ! health_check "$worker_url" "$HEALTH_CHECK_RETRIES"; then
        log_error "Basic health check failed"
        return 1
    fi
    
    # Step 2: Detailed service verification
    if ! detailed_verification "$worker_url"; then
        log_error "Detailed verification failed"
        return 1
    fi
    
    # Step 3: Performance verification
    if ! performance_verification "$worker_url"; then
        log_error "Performance verification failed"
        return 1
    fi
    
    log_success "All verification checks passed for environment: $env"
    return 0
}

# Parse command line arguments
ROLLBACK_ONLY=false
VERIFY_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        development|staging|production)
            ENVIRONMENT="$1"
            shift
            ;;
        --timeout)
            VERIFICATION_TIMEOUT="$2"
            shift 2
            ;;
        --retries)
            HEALTH_CHECK_RETRIES="$2"
            shift 2
            ;;
        --no-rollback)
            ROLLBACK_ENABLED=false
            shift
            ;;
        --rollback-only)
            ROLLBACK_ONLY=true
            shift
            ;;
        --verify-only)
            VERIFY_ONLY=true
            ROLLBACK_ENABLED=false
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

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
    log_error "Invalid environment: $ENVIRONMENT"
    log_info "Valid environments: development, staging, production"
    exit 1
fi

echo "🔍 SwiftConcur Cloudflare Worker Deployment Verification"
echo "========================================================"
echo "Environment: $ENVIRONMENT"
echo "Timeout: ${VERIFICATION_TIMEOUT}s"
echo "Health Check Retries: $HEALTH_CHECK_RETRIES"
echo "Rollback Enabled: $ROLLBACK_ENABLED"
echo ""

# Check prerequisites
check_prerequisites

# Handle rollback-only mode
if [ "$ROLLBACK_ONLY" = true ]; then
    log_info "Rollback-only mode - performing rollback operation"
    
    if rollback_deployment "$ENVIRONMENT"; then
        log_success "Rollback completed successfully"
        exit 0
    else
        log_error "Rollback failed"
        exit 1
    fi
fi

# Perform verification with timeout
log_info "Starting verification process with ${VERIFICATION_TIMEOUT}s timeout..."

# Run verification in background with timeout
(
    verify_deployment "$ENVIRONMENT"
) &
VERIFICATION_PID=$!

# Wait for verification with timeout
VERIFICATION_SUCCESS=false

for i in $(seq 1 $VERIFICATION_TIMEOUT); do
    if ! kill -0 $VERIFICATION_PID 2>/dev/null; then
        # Process finished
        wait $VERIFICATION_PID
        VERIFICATION_EXIT_CODE=$?
        
        if [ $VERIFICATION_EXIT_CODE -eq 0 ]; then
            VERIFICATION_SUCCESS=true
        fi
        break
    fi
    
    sleep 1
    
    # Show progress every 30 seconds
    if [ $((i % 30)) -eq 0 ]; then
        log_info "Verification in progress... (${i}s elapsed)"
    fi
done

# Kill verification if it's still running (timeout)
if kill -0 $VERIFICATION_PID 2>/dev/null; then
    log_warning "Verification timeout reached (${VERIFICATION_TIMEOUT}s)"
    kill $VERIFICATION_PID 2>/dev/null
    VERIFICATION_SUCCESS=false
fi

# Handle verification results
if [ "$VERIFICATION_SUCCESS" = true ]; then
    log_success "🎉 Deployment verification passed!"
    
    # Send success notification
    if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
        SUCCESS_PAYLOAD=$(cat << EOF
{
  "text": "✅ SwiftConcur API deployment verified successfully",
  "attachments": [
    {
      "color": "good",
      "fields": [
        {
          "title": "Environment",
          "value": "$ENVIRONMENT",
          "short": true
        },
        {
          "title": "Status",
          "value": "Verified",
          "short": true
        }
      ]
    }
  ]
}
EOF
        )
        
        curl -X POST -H 'Content-type: application/json' \
             --data "$SUCCESS_PAYLOAD" \
             "$SLACK_WEBHOOK_URL" &>/dev/null || true
    fi
    
    exit 0
else
    log_error "Deployment verification failed!"
    
    # Perform rollback if enabled and not in verify-only mode
    if [ "$ROLLBACK_ENABLED" = true ] && [ "$VERIFY_ONLY" != true ]; then
        log_warning "Attempting automatic rollback..."
        
        if rollback_deployment "$ENVIRONMENT"; then
            log_success "Automatic rollback completed"
            exit 2 # Exit with code 2 to indicate rollback was performed
        else
            log_error "Automatic rollback failed"
            exit 3 # Exit with code 3 to indicate both verification and rollback failed
        fi
    else
        log_info "Rollback disabled or verify-only mode - manual intervention required"
        exit 1
    fi
fi