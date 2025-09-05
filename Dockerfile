# Multi-stage build for efficiency
FROM rust:1.81-slim AS builder

# Install dependencies for building
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy parser source
WORKDIR /build
COPY parser/Cargo.toml ./
COPY parser/src ./src

# Build the parser
RUN cargo build --release

# Runtime image
FROM swift:5.10-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    curl \
    jq \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js for GitHub API scripts
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

# Copy parser binary
COPY --from=builder /build/target/release/swiftconcur-parser /usr/local/bin/swiftconcur-parser

# Copy action scripts
COPY entrypoint.sh /entrypoint.sh
COPY scripts/ /scripts/

# Make scripts executable
RUN chmod +x /entrypoint.sh /scripts/*.sh

# Install Node dependencies for comment poster
WORKDIR /scripts
RUN npm install @actions/core @actions/github

WORKDIR /

ENTRYPOINT ["/entrypoint.sh"]
