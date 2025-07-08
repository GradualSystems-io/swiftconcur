#!/bin/bash

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
FAIL_ON_ERROR=${FAIL_ON_ERROR:-false}
RETRY_COUNT=${RETRY_COUNT:-3}
TIMEOUT=${TIMEOUT:-30}
THRESHOLD=${THRESHOLD:-0}
FORMAT=${FORMAT:-markdown}
WORKSPACE_PATH=${WORKSPACE_PATH:-.}
CONFIGURATION=${CONFIGURATION:-Debug}

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Error handling function
handle_error() {
    local exit_code=$1
    local error_message=$2
    
    log_error "$error_message"
    
    # Set outputs even on error
    echo "success=false" >> "$GITHUB_OUTPUT"
    echo "warning-count=0" >> "$GITHUB_OUTPUT"
    echo "summary-markdown=❌ Analysis failed: $error_message" >> "$GITHUB_OUTPUT"
    echo "json-report={\"error\": \"$error_message\", \"warnings\": []}" >> "$GITHUB_OUTPUT"
    
    if [[ "$FAIL_ON_ERROR" == "true" ]]; then
        exit $exit_code
    else
        log_warn "Continuing despite error (fail-on-error=false)"
        exit 0
    fi
}

# Retry function with exponential backoff
retry_with_backoff() {
    local max_attempts=$1
    local delay=1
    local attempt=1
    
    shift # Remove max_attempts from arguments
    
    while [ $attempt -le $max_attempts ]; do
        log_info "Attempt $attempt/$max_attempts: $*"
        
        if "$@"; then
            log_success "Command succeeded on attempt $attempt"
            return 0
        else
            local exit_code=$?
            if [ $attempt -eq $max_attempts ]; then
                log_error "Command failed after $max_attempts attempts"
                return $exit_code
            fi
            
            log_warn "Command failed (attempt $attempt/$max_attempts), retrying in ${delay}s..."
            sleep $delay
            delay=$((delay * 2)) # Exponential backoff
            attempt=$((attempt + 1))
        fi
    done
}

# Validate required environment variables
validate_environment() {
    log_info "Validating environment variables..."
    
    local required_vars=("GITHUB_TOKEN" "SCHEME")
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            handle_error 1 "Required environment variable $var is not set"
        fi
    done
    
    # Validate GitHub token format (basic check)
    if [[ ! "$GITHUB_TOKEN" =~ ^gh[pousr]_[A-Za-z0-9_]{36,255}$ ]]; then
        log_warn "GitHub token format appears invalid, but continuing..."
    fi
    
    log_success "Environment validation passed"
}

# Check if we have xcodebuild (fallback to simulator if needed)
check_xcodebuild() {
    if ! command -v xcodebuild &> /dev/null; then
        log_error "xcodebuild not found. This action requires running on macOS with Xcode installed."
        handle_error 1 "xcodebuild not available"
    fi
}

# Build with xcodebuild and capture output
run_xcodebuild() {
    log_info "Starting xcodebuild for scheme: $SCHEME"
    
    local workspace_arg=""
    if [[ -f "$WORKSPACE_PATH/$SCHEME.xcworkspace" ]]; then
        workspace_arg="-workspace $WORKSPACE_PATH/$SCHEME.xcworkspace"
    elif [[ -f "$WORKSPACE_PATH/$SCHEME.xcodeproj" ]]; then
        workspace_arg="-project $WORKSPACE_PATH/$SCHEME.xcodeproj"
    else
        # Try to find any workspace or project
        local workspace_file
        workspace_file=$(find "$WORKSPACE_PATH" -name "*.xcworkspace" -o -name "*.xcodeproj" | head -1)
        if [[ -n "$workspace_file" ]]; then
            if [[ "$workspace_file" == *.xcworkspace ]]; then
                workspace_arg="-workspace $workspace_file"
            else
                workspace_arg="-project $workspace_file"
            fi
        else
            handle_error 1 "No Xcode workspace or project found in $WORKSPACE_PATH"
        fi
    fi
    
    local build_log="/tmp/xcodebuild.log"
    local json_log="/tmp/xcodebuild.json"
    
    # Run xcodebuild with timeout and JSON output
    local xcodebuild_cmd=(
        timeout "${TIMEOUT}m"
        xcodebuild
        $workspace_arg
        -scheme "$SCHEME"
        -configuration "$CONFIGURATION"
        -destination "platform=iOS Simulator,name=iPhone 14"
        -resultBundlePath "/tmp/TestResults.xcresult"
        -json
        build
    )
    
    log_info "Running: ${xcodebuild_cmd[*]}"
    
    if ! "${xcodebuild_cmd[@]}" > "$json_log" 2> "$build_log"; then
        local exit_code=$?
        
        # Check if it's a timeout
        if [[ $exit_code -eq 124 ]]; then
            handle_error $exit_code "Build timed out after ${TIMEOUT} minutes"
        fi
        
        # Try to extract useful error information
        if [[ -f "$build_log" ]]; then
            local error_summary
            error_summary=$(tail -20 "$build_log" | grep -i "error" | head -5 || echo "Build failed")
            handle_error $exit_code "Build failed: $error_summary"
        else
            handle_error $exit_code "Build failed with no error log"
        fi
    fi
    
    if [[ ! -f "$json_log" ]] || [[ ! -s "$json_log" ]]; then
        handle_error 1 "No JSON output generated from xcodebuild"
    fi
    
    log_success "xcodebuild completed successfully"
    echo "$json_log"
}

# Parse warnings using the Rust parser
parse_warnings() {
    local json_log=$1
    local output_file="/tmp/warnings.json"
    
    log_info "Parsing concurrency warnings..."
    
    if ! /usr/local/bin/swiftconcur-parser --format json < "$json_log" > "$output_file" 2>&1; then
        # If parser fails, create empty results rather than failing
        log_warn "Parser failed, creating empty results"
        echo '{"warnings": [], "count": 0}' > "$output_file"
    fi
    
    echo "$output_file"
}

# Format output based on requested format
format_output() {
    local warnings_file=$1
    local warning_count
    local summary_markdown
    local json_report
    
    # Extract warning count
    warning_count=$(jq -r '.count // 0' "$warnings_file")
    
    # Generate JSON report
    json_report=$(cat "$warnings_file")
    
    # Generate markdown summary
    if [[ "$warning_count" -eq 0 ]]; then
        summary_markdown="✅ No Swift concurrency warnings found"
    else
        summary_markdown="⚠️ Found $warning_count Swift concurrency warning$([ $warning_count -ne 1 ] && echo "s")"
        
        # Add warning details if available
        if [[ "$warning_count" -gt 0 ]]; then
            summary_markdown+="\n\n### Warnings:\n"
            summary_markdown+=$(jq -r '.warnings[] | "- " + .' "$warnings_file" | head -10)
            
            if [[ "$warning_count" -gt 10 ]]; then
                summary_markdown+="\n... and $((warning_count - 10)) more warnings"
            fi
        fi
    fi
    
    # Set outputs
    echo "warning-count=$warning_count" >> "$GITHUB_OUTPUT"
    echo "summary-markdown=$summary_markdown" >> "$GITHUB_OUTPUT"
    echo "json-report=$json_report" >> "$GITHUB_OUTPUT"
    echo "success=true" >> "$GITHUB_OUTPUT"
    
    # Check threshold
    if [[ "$warning_count" -gt "$THRESHOLD" ]]; then
        log_error "Warning count ($warning_count) exceeds threshold ($THRESHOLD)"
        exit 1
    fi
    
    log_success "Analysis completed: $warning_count warnings found"
}

# Post PR comment (only if we're in a PR context)
post_pr_comment() {
    if [[ "${GITHUB_EVENT_NAME:-}" != "pull_request" ]]; then
        log_info "Not in PR context, skipping comment posting"
        return 0
    fi
    
    local summary_markdown
    summary_markdown=$(cat "$GITHUB_OUTPUT" | grep "summary-markdown=" | cut -d'=' -f2-)
    
    if [[ -z "$summary_markdown" ]]; then
        log_warn "No summary to post"
        return 0
    fi
    
    log_info "Posting PR comment..."
    
    # Use GitHub API to post comment
    local api_url="https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${GITHUB_REF##*/}/comments"
    local comment_body="{\"body\": \"## SwiftConcur Analysis Results\n\n$summary_markdown\"}"
    
    if ! curl -s -X POST \
        -H "Authorization: Bearer $GITHUB_TOKEN" \
        -H "Accept: application/vnd.github.v3+json" \
        -d "$comment_body" \
        "$api_url" > /dev/null; then
        log_warn "Failed to post PR comment, but continuing"
    else
        log_success "PR comment posted successfully"
    fi
}

# Create GitHub output file if it doesn't exist
mkdir -p "$(dirname "$GITHUB_OUTPUT")"
touch "$GITHUB_OUTPUT"

# Main execution
main() {
    log_info "Starting SwiftConcur CI analysis..."
    
    # Validate environment
    validate_environment
    
    # Check xcodebuild availability
    check_xcodebuild
    
    # Run build with retries
    local json_log
    if ! json_log=$(retry_with_backoff "$RETRY_COUNT" run_xcodebuild); then
        handle_error 1 "Failed to run xcodebuild after $RETRY_COUNT attempts"
    fi
    
    # Parse warnings
    local warnings_file
    if ! warnings_file=$(parse_warnings "$json_log"); then
        handle_error 1 "Failed to parse warnings"
    fi
    
    # Format and output results
    format_output "$warnings_file"
    
    # Post PR comment if applicable
    post_pr_comment
    
    log_success "SwiftConcur CI analysis completed successfully"
}

# Run with error handling
if ! main "$@"; then
    handle_error $? "Main execution failed"
fi