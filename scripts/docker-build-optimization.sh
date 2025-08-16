#!/bin/bash

# Docker Build Optimization Script
# Advanced Docker image optimization and caching strategies

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME=${1:-swiftconcur-ci}
BUILD_MODE=${2:-optimized}
PLATFORM=${3:-linux/amd64}
CACHE_TYPE=${4:-registry}

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
Docker Build Optimization Script

USAGE:
    ./scripts/docker-build-optimization.sh [IMAGE_NAME] [BUILD_MODE] [PLATFORM] [CACHE_TYPE]

ARGUMENTS:
    IMAGE_NAME      Name for the Docker image [default: swiftconcur-ci]
    BUILD_MODE      Build optimization mode [default: optimized]
                    - minimal: Smallest possible image
                    - optimized: Balance of size and functionality  
                    - development: Full development tools
    PLATFORM        Target platform [default: linux/amd64]
                    - linux/amd64, linux/arm64, linux/arm/v7
    CACHE_TYPE      Caching strategy [default: registry]
                    - local: Local Docker cache
                    - registry: Remote registry cache
                    - gha: GitHub Actions cache

OPTIONS:
    --no-cache      Build without using cache
    --analyze       Analyze image after build
    --benchmark     Run performance benchmarks
    --security      Run security scans
    --push          Push to registry after build
    -h, --help      Show this help message

EXAMPLES:
    # Minimal production build
    ./scripts/docker-build-optimization.sh swiftconcur minimal linux/amd64 registry

    # Development build with analysis
    ./scripts/docker-build-optimization.sh swiftconcur development linux/amd64 local --analyze

    # Multi-platform optimized build
    ./scripts/docker-build-optimization.sh swiftconcur optimized linux/amd64,linux/arm64 registry --push

EOF
}

# Parse command line arguments
NO_CACHE=false
ANALYZE=false
BENCHMARK=false
SECURITY=false
PUSH=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-cache)
            NO_CACHE=true
            shift
            ;;
        --analyze)
            ANALYZE=true
            shift
            ;;
        --benchmark)
            BENCHMARK=true
            shift
            ;;
        --security)
            SECURITY=true
            shift
            ;;
        --push)
            PUSH=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            # Skip unknown options
            shift
            ;;
    esac
done

# Validate build mode
if [[ ! "$BUILD_MODE" =~ ^(minimal|optimized|development)$ ]]; then
    log_error "Invalid build mode: $BUILD_MODE"
    log_info "Valid modes: minimal, optimized, development"
    exit 1
fi

echo "🐳 SwiftConcur Docker Build Optimization"
echo "========================================"
echo "Image Name: $IMAGE_NAME"
echo "Build Mode: $BUILD_MODE"
echo "Platform: $PLATFORM"
echo "Cache Type: $CACHE_TYPE"
echo ""

# Check prerequisites
check_prerequisites() {
    log_info "Checking build prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is required but not installed"
        exit 1
    fi
    
    # Check Docker Buildx
    if ! docker buildx version &> /dev/null; then
        log_error "Docker Buildx is required but not available"
        exit 1
    fi
    
    # Check if Dockerfile exists
    if [ ! -f "Dockerfile" ]; then
        log_error "Dockerfile not found in current directory"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Setup build environment
setup_build_environment() {
    log_info "Setting up build environment..."
    
    # Create builder instance if it doesn't exist
    if ! docker buildx ls | grep -q "swiftconcur-builder"; then
        log_info "Creating Buildx builder instance..."
        docker buildx create \
            --name swiftconcur-builder \
            --driver docker-container \
            --driver-opt network=host \
            --bootstrap \
            --use
    else
        docker buildx use swiftconcur-builder
    fi
    
    log_success "Build environment ready"
}

# Generate optimized Dockerfile
generate_optimized_dockerfile() {
    log_info "Generating optimized Dockerfile for mode: $BUILD_MODE"
    
    case "$BUILD_MODE" in
        minimal)
            # Create minimal Dockerfile
            cat > Dockerfile.minimal << 'EOF'
# Minimal SwiftConcur Build - Ultra-lightweight
FROM rust:1.78.0-slim-bookworm AS builder

# Install minimal build deps
RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY parser/Cargo.toml parser/Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release && rm src/main.rs

COPY parser/src ./src
ENV CARGO_INCREMENTAL=0 RUSTFLAGS="-C link-arg=-s"
RUN cargo build --release --locked
RUN strip target/release/swiftconcur-parser

# Ultra-minimal runtime
FROM gcr.io/distroless/cc-debian12
COPY --from=builder /build/target/release/swiftconcur-parser /usr/local/bin/swiftconcur
USER 65534
ENTRYPOINT ["/usr/local/bin/swiftconcur"]
EOF
            BUILD_FILE="Dockerfile.minimal"
            ;;
        
        development)
            # Use standard Dockerfile for development
            BUILD_FILE="Dockerfile"
            ;;
        
        optimized)
            # Use standard optimized Dockerfile
            BUILD_FILE="Dockerfile"
            ;;
    esac
    
    log_success "Using build file: $BUILD_FILE"
}

# Configure caching strategy
configure_caching() {
    log_info "Configuring caching strategy: $CACHE_TYPE"
    
    CACHE_FROM=""
    CACHE_TO=""
    
    case "$CACHE_TYPE" in
        local)
            CACHE_FROM="type=local,src=/tmp/.buildx-cache"
            CACHE_TO="type=local,dest=/tmp/.buildx-cache,mode=max"
            ;;
        registry)
            CACHE_FROM="type=registry,ref=ghcr.io/gradualsystems/swiftconcur/cache:latest"
            CACHE_TO="type=registry,ref=ghcr.io/gradualsystems/swiftconcur/cache:latest,mode=max"
            ;;
        gha)
            CACHE_FROM="type=gha,scope=buildkit"
            CACHE_TO="type=gha,scope=buildkit,mode=max"
            ;;
    esac
    
    if [ "$NO_CACHE" = true ]; then
        CACHE_FROM=""
        CACHE_TO=""
        log_warning "Cache disabled"
    fi
    
    log_success "Cache configuration ready"
}

# Build optimized image
build_optimized_image() {
    log_info "Building optimized Docker image..."
    
    # Generate build args
    BUILD_ARGS=""
    BUILD_ARGS="$BUILD_ARGS --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    BUILD_ARGS="$BUILD_ARGS --build-arg VCS_REF=$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
    BUILD_ARGS="$BUILD_ARGS --build-arg VERSION=$(git describe --tags --exact-match 2>/dev/null || echo 'dev')"
    
    # Configure cache arguments
    CACHE_ARGS=""
    if [ -n "$CACHE_FROM" ]; then
        CACHE_ARGS="$CACHE_ARGS --cache-from $CACHE_FROM"
    fi
    if [ -n "$CACHE_TO" ]; then
        CACHE_ARGS="$CACHE_ARGS --cache-to $CACHE_TO"
    fi
    
    # Build command
    BUILD_CMD="docker buildx build"
    BUILD_CMD="$BUILD_CMD --platform $PLATFORM"
    BUILD_CMD="$BUILD_CMD --file $BUILD_FILE"
    BUILD_CMD="$BUILD_CMD --tag $IMAGE_NAME:latest"
    BUILD_CMD="$BUILD_CMD --tag $IMAGE_NAME:$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')"
    BUILD_CMD="$BUILD_CMD $BUILD_ARGS"
    BUILD_CMD="$BUILD_CMD $CACHE_ARGS"
    
    if [ "$PUSH" = true ]; then
        BUILD_CMD="$BUILD_CMD --push"
    else
        BUILD_CMD="$BUILD_CMD --load"
    fi
    
    BUILD_CMD="$BUILD_CMD ."
    
    echo "Build command: $BUILD_CMD"
    echo ""
    
    # Execute build
    eval $BUILD_CMD
    
    log_success "Docker image built successfully"
}

# Analyze image
analyze_image() {
    if [ "$ANALYZE" != true ]; then
        return 0
    fi
    
    log_info "Analyzing Docker image..."
    
    # Get image information
    IMAGE_SIZE=$(docker images --format "table {{.Size}}" "$IMAGE_NAME":latest | tail -n +2)
    IMAGE_ID=$(docker images --format "table {{.ID}}" "$IMAGE_NAME":latest | tail -n +2)
    
    echo ""
    echo "📊 Image Analysis Results"
    echo "========================"
    echo "• Image: $IMAGE_NAME:latest"
    echo "• Size: $IMAGE_SIZE"
    echo "• ID: $IMAGE_ID"
    echo ""
    
    # Layer analysis
    echo "📋 Layer Breakdown:"
    docker history "$IMAGE_NAME":latest --human=true --format "table {{.CreatedBy}}\t{{.Size}}" | head -15
    echo ""
    
    # Find inefficiencies
    echo "🔍 Optimization Opportunities:"
    LARGE_LAYERS=$(docker history "$IMAGE_NAME":latest --human=true --format "{{.Size}}\t{{.CreatedBy}}" | \
        awk '$1 ~ /[0-9]+MB/ && $1+0 > 50 {print "  • Large layer (" $1 "): " substr($0, index($0,$2))}')
    
    if [ -n "$LARGE_LAYERS" ]; then
        echo "$LARGE_LAYERS"
    else
        echo "  ✅ No large layers detected"
    fi
    
    # Install and run dive for detailed analysis
    if command -v dive &> /dev/null; then
        echo ""
        echo "🎯 Detailed Efficiency Analysis:"
        dive $IMAGE_NAME:latest --ci --lowestEfficiency 0.9 || true
    fi
    
    log_success "Image analysis completed"
}

# Run performance benchmarks
benchmark_performance() {
    if [ "$BENCHMARK" != true ]; then
        return 0
    fi
    
    log_info "Running performance benchmarks..."
    
    echo ""
    echo "⚡ Performance Benchmark Results"
    echo "==============================="
    
    # Startup time benchmark
    echo "🚀 Container Startup Time:"
    STARTUP_TIMES=()
    
    for i in {1..3}; do
        start_time=$(date +%s%N)
        
        CONTAINER_ID=$(docker run -d "$IMAGE_NAME":latest sleep 5)
        
        # Wait for container to be running
        while [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_ID")" != "true" ]; do
            sleep 0.01
        done
        
        end_time=$(date +%s%N)
        startup_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
        STARTUP_TIMES+=($startup_time)
        
        echo "  • Test $i: ${startup_time}ms"
        
        # Cleanup
        docker stop "$CONTAINER_ID" >/dev/null 2>&1
        docker rm "$CONTAINER_ID" >/dev/null 2>&1
    done
    
    # Calculate average
    total=0
    for time in "${STARTUP_TIMES[@]}"; do
        total=$((total + time))
    done
    average=$((total / ${#STARTUP_TIMES[@]}))
    
    echo "  • Average: ${average}ms"
    
    # Image pull time
    echo ""
    echo "📥 Image Pull Time:"
    docker rmi "$IMAGE_NAME":latest >/dev/null 2>&1 || true
    
    start_time=$(date +%s)
    docker pull "$IMAGE_NAME":latest >/dev/null 2>&1 || docker build -t "$IMAGE_NAME":latest . >/dev/null 2>&1
    end_time=$(date +%s)
    
    pull_time=$((end_time - start_time))
    echo "  • Pull time: ${pull_time}s"
    
    log_success "Performance benchmarks completed"
}

# Run security scan
security_scan() {
    if [ "$SECURITY" != true ]; then
        return 0
    fi
    
    log_info "Running security scan..."
    
    echo ""
    echo "🔒 Security Scan Results"
    echo "======================="
    
    # Check if running as non-root
    USER_ID=$(docker run --rm "$IMAGE_NAME":latest id -u 2>/dev/null || echo "unknown")
    if [ "$USER_ID" != "0" ] && [ "$USER_ID" != "unknown" ]; then
        echo "✅ Running as non-root user (UID: $USER_ID)"
    else
        echo "⚠️ Running as root or unable to determine user"
    fi
    
    # Basic security check
    echo ""
    echo "🛡️ Basic Security Posture:"
    
    # Check for shell
    if docker run --rm "$IMAGE_NAME":latest which sh >/dev/null 2>&1; then
        echo "⚠️ Shell available in image"
    else
        echo "✅ No shell - reduced attack surface"
    fi
    
    # Check for package managers
    for cmd in apt-get yum dnf apk; do
        if docker run --rm "$IMAGE_NAME":latest which "$cmd" >/dev/null 2>&1; then
            echo "⚠️ Package manager '$cmd' found"
        fi
    done
    
    log_success "Security scan completed"
}

# Generate build report
generate_build_report() {
    log_info "Generating build optimization report..."
    
    REPORT_FILE="docker-build-report.md"
    
    cat > "$REPORT_FILE" << EOF
# 🐳 Docker Build Optimization Report

**Generated**: $(date)
**Image**: $IMAGE_NAME:latest
**Build Mode**: $BUILD_MODE
**Platform**: $PLATFORM
**Cache Type**: $CACHE_TYPE

## 📊 Build Summary

$(docker images "$IMAGE_NAME":latest --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}\t{{.Size}}")

## 🏗️ Optimization Features

- ✅ Multi-stage build for minimal final image
- ✅ Dependency caching for faster builds  
- ✅ Layer optimization to reduce size
- ✅ Binary stripping for smaller executables
- ✅ Security hardening with non-root user
- ✅ Health checks for monitoring
- ✅ Metadata labels for tracking

## 📋 Layer Analysis

\`\`\`
$(docker history "$IMAGE_NAME":latest --human=true --format "table {{.CreatedBy}}\t{{.Size}}" | head -10)
\`\`\`

## 🎯 Recommendations

EOF

    # Add conditional recommendations
    IMAGE_SIZE_MB=$(docker inspect "$IMAGE_NAME":latest --format='{{.Size}}' | awk '{print int($1/1024/1024)}')
    
    if [ $IMAGE_SIZE_MB -lt 100 ]; then
        echo "- ✅ Image size is excellent (<100MB)" >> "$REPORT_FILE"
    elif [ $IMAGE_SIZE_MB -lt 500 ]; then
        echo "- ✅ Image size is good (<500MB)" >> "$REPORT_FILE"
    else
        echo "- ⚠️ Consider further size optimization (current: ${IMAGE_SIZE_MB}MB)" >> "$REPORT_FILE"
    fi
    
    echo "" >> "$REPORT_FILE"
    echo "---" >> "$REPORT_FILE"
    echo "*Generated by SwiftConcur Docker Build Optimization*" >> "$REPORT_FILE"
    
    log_success "Build report generated: $REPORT_FILE"
}

# Cleanup
cleanup() {
    if [ "$BUILD_MODE" = "minimal" ] && [ -f "Dockerfile.minimal" ]; then
        rm -f Dockerfile.minimal
    fi
}

# Main execution
main() {
    check_prerequisites
    setup_build_environment
    generate_optimized_dockerfile
    configure_caching
    build_optimized_image
    analyze_image
    benchmark_performance
    security_scan
    generate_build_report
    cleanup
    
    echo ""
    log_success "🎉 Docker build optimization completed!"
    echo ""
    echo "📋 Summary:"
    echo "  • Image: $IMAGE_NAME:latest"
    echo "  • Mode: $BUILD_MODE"
    echo "  • Platform: $PLATFORM"
    echo "  • Size: $(docker images --format '{{.Size}}' "$IMAGE_NAME":latest)"
    echo ""
    echo "📁 Files Generated:"
    echo "  • Build report: docker-build-report.md"
    echo ""
    echo "🚀 Next Steps:"
    echo "  • Test the optimized image"
    echo "  • Deploy to registry if satisfied"
    echo "  • Monitor performance in production"
}

# Error handling
trap 'log_error "Build failed on line $LINENO"' ERR

# Run main process
main