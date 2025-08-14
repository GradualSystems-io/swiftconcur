#!/bin/bash

# Cloudflare Worker Secrets Management Script
# Secure setup and management of Wrangler secrets for different environments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEFAULT_ENVIRONMENT="development"
SECRETS_FILE=".env.example"
REQUIRED_SECRETS=(
    "SUPABASE_URL"
    "SUPABASE_SERVICE_KEY"
    "OPENAI_API_KEY"
    "SLACK_WEBHOOK_URL"
    "TEAMS_WEBHOOK_URL"
)

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
Cloudflare Worker Secrets Management Script

USAGE:
    ./scripts/setup-secrets.sh [COMMAND] [OPTIONS]

COMMANDS:
    setup ENV          Setup secrets for environment (development|staging|production)
    list ENV           List current secrets for environment
    rotate ENV SECRET  Rotate a specific secret
    sync ENV           Sync secrets from .env file
    validate ENV       Validate all required secrets exist
    backup ENV         Backup current secrets configuration
    
OPTIONS:
    --interactive      Interactive mode for secret input
    --from-file FILE   Load secrets from file
    --dry-run          Show what would be done without executing
    -h, --help         Show this help message

EXAMPLES:
    # Setup development secrets interactively
    ./scripts/setup-secrets.sh setup development --interactive

    # List production secrets
    ./scripts/setup-secrets.sh list production

    # Rotate OpenAI API key for staging
    ./scripts/setup-secrets.sh rotate staging OPENAI_API_KEY

    # Sync secrets from .env.production file
    ./scripts/setup-secrets.sh sync production --from-file .env.production

    # Validate all secrets are set
    ./scripts/setup-secrets.sh validate production

EOF
}

# Validate environment
validate_environment() {
    local env="$1"
    if [[ ! "$env" =~ ^(development|staging|production)$ ]]; then
        log_error "Invalid environment: $env"
        log_info "Valid environments: development, staging, production"
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Wrangler CLI
    if ! command -v wrangler &> /dev/null; then
        log_error "Wrangler CLI not found. Install with: npm install -g wrangler"
        exit 1
    fi
    
    # Check wrangler.toml
    if [ ! -f "wrangler.toml" ]; then
        log_error "wrangler.toml not found. Run from api/ directory"
        exit 1
    fi
    
    # Check authentication
    if ! wrangler whoami &> /dev/null; then
        log_error "Wrangler not authenticated. Run: wrangler login"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# List current secrets for environment
list_secrets() {
    local env="$1"
    
    log_info "Listing secrets for environment: $env"
    
    echo ""
    echo "🔐 Current Secrets for $env environment:"
    echo "========================================"
    
    # Get secrets list from Wrangler
    if wrangler secret list --env "$env" &> /dev/null; then
        wrangler secret list --env "$env"
    else
        log_warning "Failed to list secrets or no secrets configured"
    fi
    
    echo ""
    echo "📋 Required Secrets:"
    for secret in "${REQUIRED_SECRETS[@]}"; do
        if wrangler secret list --env "$env" 2>/dev/null | grep -q "^$secret"; then
            echo "  ✅ $secret"
        else
            echo "  ❌ $secret (missing)"
        fi
    done
}

# Setup secrets for environment
setup_secrets() {
    local env="$1"
    local interactive="$2"
    local from_file="$3"
    local dry_run="$4"
    
    log_info "Setting up secrets for environment: $env"
    
    if [ "$dry_run" = true ]; then
        log_warning "DRY RUN MODE - No secrets will be actually set"
    fi
    
    declare -A secret_values
    
    # Load secrets from file if specified
    if [ -n "$from_file" ]; then
        if [ ! -f "$from_file" ]; then
            log_error "Secrets file not found: $from_file"
            exit 1
        fi
        
        log_info "Loading secrets from file: $from_file"
        
        # Source the file to load environment variables
        set -a
        source "$from_file"
        set +a
        
        # Extract secret values
        for secret in "${REQUIRED_SECRETS[@]}"; do
            value="${!secret}"
            if [ -n "$value" ]; then
                secret_values["$secret"]="$value"
            fi
        done
    fi
    
    # Interactive input for missing secrets
    if [ "$interactive" = true ]; then
        echo ""
        echo "🔑 Interactive Secret Setup"
        echo "==========================="
        
        for secret in "${REQUIRED_SECRETS[@]}"; do
            if [ -z "${secret_values[$secret]}" ]; then
                echo ""
                echo "Enter value for $secret:"
                
                # Provide hints for each secret
                case "$secret" in
                    "SUPABASE_URL")
                        echo "  Example: https://your-project.supabase.co"
                        ;;
                    "SUPABASE_SERVICE_KEY")
                        echo "  Get from Supabase Dashboard > Settings > API"
                        ;;
                    "OPENAI_API_KEY")
                        echo "  Get from OpenAI Dashboard > API Keys"
                        ;;
                    "SLACK_WEBHOOK_URL")
                        echo "  Create at https://api.slack.com/apps > Incoming Webhooks"
                        ;;
                    "TEAMS_WEBHOOK_URL")
                        echo "  Create in Teams > Connectors > Incoming Webhook"
                        ;;
                esac
                
                read -s -p "  Value: " value
                echo ""
                
                if [ -n "$value" ]; then
                    secret_values["$secret"]="$value"
                else
                    log_warning "Skipping empty value for $secret"
                fi
            fi
        done
    fi
    
    # Set secrets using Wrangler
    echo ""
    log_info "Setting secrets via Wrangler..."
    
    for secret in "${REQUIRED_SECRETS[@]}"; do
        if [ -n "${secret_values[$secret]}" ]; then
            if [ "$dry_run" = true ]; then
                echo "  [DRY RUN] Would set: $secret"
            else
                log_info "Setting secret: $secret"
                echo "${secret_values[$secret]}" | wrangler secret put "$secret" --env "$env"
                
                if [ $? -eq 0 ]; then
                    log_success "Secret $secret set successfully"
                else
                    log_error "Failed to set secret: $secret"
                fi
            fi
        else
            log_warning "No value provided for required secret: $secret"
        fi
    done
    
    if [ "$dry_run" != true ]; then
        log_success "Secrets setup completed for environment: $env"
        
        # Validate secrets were set correctly
        validate_secrets "$env"
    fi
}

# Rotate a specific secret
rotate_secret() {
    local env="$1"
    local secret_name="$2"
    
    log_info "Rotating secret: $secret_name for environment: $env"
    
    # Check if secret exists
    if ! wrangler secret list --env "$env" 2>/dev/null | grep -q "^$secret_name"; then
        log_error "Secret $secret_name not found in environment: $env"
        exit 1
    fi
    
    echo ""
    echo "🔄 Rotating Secret: $secret_name"
    echo "================================"
    echo ""
    echo "Enter new value for $secret_name:"
    
    read -s -p "New value: " new_value
    echo ""
    
    if [ -z "$new_value" ]; then
        log_error "Cannot rotate to empty value"
        exit 1
    fi
    
    # Confirm rotation
    echo ""
    read -p "Are you sure you want to rotate $secret_name in $env? (y/N): " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Secret rotation cancelled"
        exit 0
    fi
    
    # Perform rotation
    log_info "Rotating secret..."
    echo "$new_value" | wrangler secret put "$secret_name" --env "$env"
    
    if [ $? -eq 0 ]; then
        log_success "Secret $secret_name rotated successfully"
        
        # Verify rotation
        log_info "Verifying secret rotation..."
        sleep 2
        
        if wrangler secret list --env "$env" 2>/dev/null | grep -q "^$secret_name"; then
            log_success "Secret rotation verified"
        else
            log_warning "Could not verify secret rotation"
        fi
    else
        log_error "Failed to rotate secret: $secret_name"
        exit 1
    fi
}

# Sync secrets from environment file
sync_secrets() {
    local env="$1"
    local from_file="$2"
    
    if [ -z "$from_file" ]; then
        from_file=".env.$env"
    fi
    
    log_info "Syncing secrets from $from_file to environment: $env"
    
    if [ ! -f "$from_file" ]; then
        log_error "Environment file not found: $from_file"
        exit 1
    fi
    
    # Backup current secrets first
    backup_secrets "$env"
    
    # Setup secrets from file
    setup_secrets "$env" false "$from_file" false
}

# Validate all required secrets exist
validate_secrets() {
    local env="$1"
    
    log_info "Validating secrets for environment: $env"
    
    local missing_secrets=()
    
    for secret in "${REQUIRED_SECRETS[@]}"; do
        if ! wrangler secret list --env "$env" 2>/dev/null | grep -q "^$secret"; then
            missing_secrets+=("$secret")
        fi
    done
    
    if [ ${#missing_secrets[@]} -eq 0 ]; then
        log_success "All required secrets are configured for environment: $env"
        return 0
    else
        log_error "Missing secrets in environment $env:"
        for secret in "${missing_secrets[@]}"; do
            echo "  ❌ $secret"
        done
        return 1
    fi
}

# Backup secrets configuration
backup_secrets() {
    local env="$1"
    
    log_info "Backing up secrets configuration for environment: $env"
    
    local backup_file="secrets-backup-$env-$(date +%Y%m%d_%H%M%S).txt"
    
    echo "# SwiftConcur API Secrets Backup" > "$backup_file"
    echo "# Environment: $env" >> "$backup_file"
    echo "# Generated: $(date)" >> "$backup_file"
    echo "" >> "$backup_file"
    
    if wrangler secret list --env "$env" &> /dev/null; then
        echo "# Current secrets (names only, values not included for security):" >> "$backup_file"
        wrangler secret list --env "$env" 2>/dev/null | while read -r line; do
            echo "# $line" >> "$backup_file"
        done
    else
        echo "# No secrets found or error accessing secrets" >> "$backup_file"
    fi
    
    echo "" >> "$backup_file"
    echo "# Required secrets for reference:" >> "$backup_file"
    for secret in "${REQUIRED_SECRETS[@]}"; do
        echo "# $secret=" >> "$backup_file"
    done
    
    log_success "Secrets backup saved to: $backup_file"
}

# Parse command line arguments
COMMAND=""
ENVIRONMENT=""
SECRET_NAME=""
INTERACTIVE=false
FROM_FILE=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        setup|list|rotate|sync|validate|backup)
            COMMAND="$1"
            shift
            ;;
        development|staging|production)
            ENVIRONMENT="$1"
            shift
            ;;
        --interactive)
            INTERACTIVE=true
            shift
            ;;
        --from-file)
            FROM_FILE="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            if [ "$COMMAND" = "rotate" ] && [ -z "$SECRET_NAME" ]; then
                SECRET_NAME="$1"
            fi
            shift
            ;;
    esac
done

# Validate command
if [ -z "$COMMAND" ]; then
    log_error "No command specified"
    show_help
    exit 1
fi

# Set default environment if not specified
if [ -z "$ENVIRONMENT" ]; then
    ENVIRONMENT="$DEFAULT_ENVIRONMENT"
    log_warning "No environment specified, using: $ENVIRONMENT"
fi

# Validate environment
validate_environment "$ENVIRONMENT"

echo "🔐 SwiftConcur Cloudflare Worker Secrets Management"
echo "=================================================="
echo "Command: $COMMAND"
echo "Environment: $ENVIRONMENT"
echo ""

# Check prerequisites
check_prerequisites

# Execute command
case "$COMMAND" in
    setup)
        setup_secrets "$ENVIRONMENT" "$INTERACTIVE" "$FROM_FILE" "$DRY_RUN"
        ;;
    list)
        list_secrets "$ENVIRONMENT"
        ;;
    rotate)
        if [ -z "$SECRET_NAME" ]; then
            log_error "Secret name required for rotate command"
            exit 1
        fi
        rotate_secret "$ENVIRONMENT" "$SECRET_NAME"
        ;;
    sync)
        sync_secrets "$ENVIRONMENT" "$FROM_FILE"
        ;;
    validate)
        validate_secrets "$ENVIRONMENT"
        ;;
    backup)
        backup_secrets "$ENVIRONMENT"
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        show_help
        exit 1
        ;;
esac

echo ""
log_success "Secrets management operation completed!"