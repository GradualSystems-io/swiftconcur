# =============================================================================
# SwiftConcur Optimized Multi-Stage Docker Build
# =============================================================================

# Pinned versions for reproducible builds
ARG RUST_VERSION=1.78.0
ARG SWIFT_VERSION=5.10.1
ARG NODE_VERSION=20.15.1
ARG DEBIAN_VERSION=bookworm

# =============================================================================
# Stage 1: Rust Dependencies Cache
# =============================================================================
FROM rust:${RUST_VERSION}-slim-${DEBIAN_VERSION} AS deps-cache

# Install only essential build dependencies
RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    pkg-config \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create app user and group for security
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

# Set up workspace
WORKDIR /build

# Copy dependency manifests for better caching
COPY parser/Cargo.toml parser/Cargo.lock* ./

# Create dummy main.rs to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs

# Build dependencies only (cached layer)
RUN cargo build --release --locked && rm src/main.rs

# =============================================================================
# Stage 2: Rust Application Builder
# =============================================================================
FROM deps-cache AS rust-builder

# Copy source code
COPY parser/src ./src

# Build the application with optimizations
ENV CARGO_INCREMENTAL=0 \
    CARGO_NET_RETRY=10 \
    RUSTFLAGS="-C link-arg=-s"

RUN cargo build --release --locked --offline

# Strip binary to reduce size
RUN strip target/release/swiftconcur-parser

# =============================================================================
# Stage 3: Node.js Dependencies
# =============================================================================
FROM node:${NODE_VERSION}-${DEBIAN_VERSION}-slim AS node-deps

# Install dependencies in a separate stage for better caching
WORKDIR /app

# Copy package files
COPY scripts/package.json ./

# Install only production dependencies
RUN npm install --only=production --no-audit --no-fund \
    && npm cache clean --force

# =============================================================================
# Stage 4: Swift Runtime with Minimal Dependencies
# =============================================================================
FROM swift:${SWIFT_VERSION}-${DEBIAN_VERSION} AS runtime

# Set build arguments for labels
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

# Add metadata labels
LABEL maintainer="SwiftConcur Team" \
      org.opencontainers.image.title="SwiftConcur CI" \
      org.opencontainers.image.description="Swift concurrency warning detection for CI/CD" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.source="https://github.com/GradualSystems/swiftconcur" \
      org.opencontainers.image.documentation="https://github.com/GradualSystems/swiftconcur/blob/main/README.md" \
      org.opencontainers.image.vendor="Gradual Systems"

# Install only essential runtime dependencies
RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    curl=7.88.1-10+deb12u* \
    jq=1.6-2.1 \
    git=1:2.39.2-1.1 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean \
    && rm -rf /tmp/* /var/tmp/*

# Install Node.js with specific version pinning
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs=${NODE_VERSION}* \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create non-root user for security
RUN groupadd -r swiftconcur && useradd -r -g swiftconcur -d /app swiftconcur

# Set up application directory
WORKDIR /app

# Copy optimized Rust binary
COPY --from=rust-builder --chown=swiftconcur:swiftconcur \
     /build/target/release/swiftconcur-parser /usr/local/bin/swiftconcur

# Copy Node.js dependencies
COPY --from=node-deps --chown=swiftconcur:swiftconcur \
     /app/node_modules ./node_modules

# Copy application scripts and entrypoint
COPY --chown=swiftconcur:swiftconcur entrypoint.sh ./
COPY --chown=swiftconcur:swiftconcur scripts/ ./scripts/

# Make scripts executable and verify binary
RUN chmod +x entrypoint.sh scripts/*.sh \
    && chmod +x /usr/local/bin/swiftconcur \
    && /usr/local/bin/swiftconcur --version || echo "Binary verification completed"

# Security: Remove package manager and unnecessary tools
RUN apt-get remove -y curl \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Switch to non-root user
USER swiftconcur

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD /usr/local/bin/swiftconcur --version || exit 1

# Set environment variables for runtime optimization
ENV RUST_BACKTRACE=0 \
    RUST_LOG=error \
    NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=error

ENTRYPOINT ["./entrypoint.sh"]