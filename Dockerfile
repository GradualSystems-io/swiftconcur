FROM rust:slim as builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy source code
COPY . .

# Build the parser with error handling
RUN cargo build --release --bin cli || \
    (echo "Build failed, attempting with verbose output..." && \
     cargo build --release --bin cli --verbose) || \
    (echo "Build failed completely" && exit 1)

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies including xcodebuild requirements
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    jq \
    git \
    gnupg \
    wget \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -r swiftconcur && useradd -r -g swiftconcur swiftconcur

# Create necessary directories
RUN mkdir -p /app /home/swiftconcur && \
    chown -R swiftconcur:swiftconcur /app /home/swiftconcur

# Copy parser binary
COPY --from=builder /app/target/release/cli /usr/local/bin/swiftconcur-parser
RUN chmod +x /usr/local/bin/swiftconcur-parser

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set working directory
WORKDIR /github/workspace

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD /usr/local/bin/swiftconcur-parser --help || exit 1

# Switch to non-root user
USER swiftconcur

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]