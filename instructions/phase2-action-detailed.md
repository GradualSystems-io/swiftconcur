# Phase 2: GitHub Action - Detailed Implementation Guide

## Overview
This phase packages the Rust parser into a GitHub Action that integrates seamlessly with Swift project CI workflows.

## File Structure
```
/
├── action.yml              # Action metadata
├── Dockerfile             # Container definition
├── entrypoint.sh          # Main execution script
├── scripts/
│   ├── post-comment.js    # GitHub API comment poster
│   └── check-status.sh    # Set commit status
├── .github/
│   └── workflows/
│       ├── test-action.yml # Test the action itself
│       └── examples/
│           ├── basic-usage.yml
│           ├── multi-scheme.yml
│           └── advanced-security.yml
└── README.md
```

## Implementation

### 1. Action Definition (action.yml)
```yaml
name: 'SwiftConcur CI'
description: 'Detect and track Swift concurrency warnings in your codebase'
author: 'SwiftConcur'
branding:
  icon: 'check-circle'
  color: 'orange'

inputs:
  swift-version:
    description: 'Swift version to use'
    required: false
    default: 'latest'
  
  workspace-path:
    description: 'Path to .xcworkspace file'
    required: false
  
  project-path:
    description: 'Path to .xcodeproj file (if not using workspace)'
    required: false
  
  scheme:
    description: 'Xcode scheme to build'
    required: true
  
  configuration:
    description: 'Build configuration (Debug/Release)'
    required: false
    default: 'Debug'
  
  threshold:
    description: 'Maximum allowed warnings (fail if exceeded)'
    required: false
    default: '0'
  
  baseline-path:
    description: 'Path to baseline JSON for comparison'
    required: false
  
  post-comment:
    description: 'Post results as PR comment'
    required: false
    default: 'true'
  
  fail-on-warnings:
    description: 'Fail the action if any warnings found'
    required: false
    default: 'true'
  
  context-lines:
    description: 'Lines of code context to include'
    required: false
    default: '3'
  
  github-token:
    description: 'GitHub token for posting comments'
    required: false
    default: ${{ github.token }}

outputs:
  warning-count:
    description: 'Total number of warnings found'
    value: ${{ steps.parse.outputs.warning-count }}
  
  summary-markdown:
    description: 'Markdown summary of warnings'
    value: ${{ steps.parse.outputs.summary-markdown }}
  
  json-report:
    description: 'Path to full JSON report'
    value: ${{ steps.parse.outputs.json-report }}
  
  new-warnings:
    description: 'Number of new warnings vs baseline'
    value: ${{ steps.parse.outputs.new-warnings }}
  
  fixed-warnings:
    description: 'Number of fixed warnings vs baseline'
    value: ${{ steps.parse.outputs.fixed-warnings }}

runs:
  using: 'docker'
  image: 'Dockerfile'
  env:
    GITHUB_TOKEN: ${{ inputs.github-token }}
```

### 2. Dockerfile
```dockerfile
# Multi-stage build for efficiency
FROM rust:1.78-slim as builder

# Install dependencies for building
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy parser source
WORKDIR /build
COPY parser/Cargo.toml parser/Cargo.lock ./
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
COPY --from=builder /build/target/release/swiftconcur-parser /usr/local/bin/swiftconcur

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
```

### 3. Main Entry Point (entrypoint.sh)
```bash
#!/bin/bash
set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 SwiftConcur CI Starting...${NC}"

# Parse inputs
SWIFT_VERSION="${INPUT_SWIFT_VERSION:-latest}"
WORKSPACE_PATH="${INPUT_WORKSPACE_PATH}"
PROJECT_PATH="${INPUT_PROJECT_PATH}"
SCHEME="${INPUT_SCHEME}"
CONFIGURATION="${INPUT_CONFIGURATION:-Debug}"
THRESHOLD="${INPUT_THRESHOLD:-0}"
BASELINE_PATH="${INPUT_BASELINE_PATH}"
POST_COMMENT="${INPUT_POST_COMMENT:-true}"
FAIL_ON_WARNINGS="${INPUT_FAIL_ON_WARNINGS:-true}"
CONTEXT_LINES="${INPUT_CONTEXT_LINES:-3}"

# Validate inputs
if [ -z "$SCHEME" ]; then
    echo -e "${RED}❌ Error: scheme is required${NC}"
    exit 1
fi

if [ -z "$WORKSPACE_PATH" ] && [ -z "$PROJECT_PATH" ]; then
    echo -e "${RED}❌ Error: Either workspace-path or project-path must be specified${NC}"
    exit 1
fi

# Setup Swift version if needed
if [ "$SWIFT_VERSION" != "latest" ]; then
    echo "Setting up Swift $SWIFT_VERSION..."
    # Implementation depends on the Swift Docker image
fi

# Prepare xcodebuild command
XCODEBUILD_CMD="xcodebuild"

if [ -n "$WORKSPACE_PATH" ]; then
    XCODEBUILD_CMD="$XCODEBUILD_CMD -workspace $WORKSPACE_PATH"
else
    XCODEBUILD_CMD="$XCODEBUILD_CMD -project $PROJECT_PATH"
fi

XCODEBUILD_CMD="$XCODEBUILD_CMD -scheme $SCHEME -configuration $CONFIGURATION"

# Add JSON output format
XCODEBUILD_CMD="$XCODEBUILD_CMD -resultBundleFormat JSON clean build"

# Create temporary directory for outputs
OUTPUT_DIR=$(mktemp -d)
JSON_OUTPUT="$OUTPUT_DIR/xcodebuild.json"
PARSED_OUTPUT="$OUTPUT_DIR/warnings.json"
MARKDOWN_OUTPUT="$OUTPUT_DIR/summary.md"

echo -e "${YELLOW}📦 Building project...${NC}"
echo "Command: $XCODEBUILD_CMD"

# Run xcodebuild and capture output
if ! $XCODEBUILD_CMD 2>&1 | tee "$JSON_OUTPUT"; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build completed${NC}"

# Parse warnings
echo -e "${YELLOW}🔍 Parsing warnings...${NC}"

PARSER_CMD="swiftconcur --format json --context $CONTEXT_LINES"

if [ -n "$BASELINE_PATH" ]; then
    PARSER_CMD="$PARSER_CMD --baseline $BASELINE_PATH"
fi

if [ -n "$THRESHOLD" ] && [ "$THRESHOLD" -gt 0 ]; then
    PARSER_CMD="$PARSER_CMD --threshold $THRESHOLD"
fi

# Run parser
if ! cat "$JSON_OUTPUT" | $PARSER_CMD > "$PARSED_OUTPUT"; then
    PARSER_EXIT_CODE=$?
    if [ $PARSER_EXIT_CODE -eq 1 ]; then
        echo -e "${RED}❌ Warning threshold exceeded${NC}"
    else
        echo -e "${RED}❌ Parser error${NC}"
        exit 2
    fi
fi

# Generate markdown summary
swiftconcur --format markdown < "$JSON_OUTPUT" > "$MARKDOWN_OUTPUT"

# Extract metrics
WARNING_COUNT=$(jq '.warnings | length' "$PARSED_OUTPUT")
NEW_WARNINGS=0
FIXED_WARNINGS=0

if [ -n "$BASELINE_PATH" ]; then
    NEW_WARNINGS=$(jq '.new_warnings | length' "$PARSED_OUTPUT" || echo "0")
    FIXED_WARNINGS=$(jq '.fixed_warnings | length' "$PARSED_OUTPUT" || echo "0")
fi

echo -e "${YELLOW}📊 Results:${NC}"
echo "  Total warnings: $WARNING_COUNT"
echo "  New warnings: $NEW_WARNINGS"
echo "  Fixed warnings: $FIXED_WARNINGS"

# Set outputs
echo "warning-count=$WARNING_COUNT" >> $GITHUB_OUTPUT
echo "new-warnings=$NEW_WARNINGS" >> $GITHUB_OUTPUT
echo "fixed-warnings=$FIXED_WARNINGS" >> $GITHUB_OUTPUT
echo "summary-markdown=$MARKDOWN_OUTPUT" >> $GITHUB_OUTPUT
echo "json-report=$PARSED_OUTPUT" >> $GITHUB_OUTPUT

# Post comment if in PR context
if [ "$POST_COMMENT" = "true" ] && [ -n "$GITHUB_EVENT_PATH" ]; then
    EVENT_NAME=$(jq -r .event_name "$GITHUB_EVENT_PATH" 2>/dev/null || echo "")
    
    if [ "$EVENT_NAME" = "pull_request" ]; then
        echo -e "${YELLOW}💬 Posting PR comment...${NC}"
        node /scripts/post-comment.js "$MARKDOWN_OUTPUT" "$WARNING_COUNT" "$NEW_WARNINGS" "$FIXED_WARNINGS"
    fi
fi

# Set commit status
if [ -n "$GITHUB_SHA" ]; then
    echo -e "${YELLOW}📌 Setting commit status...${NC}"
    /scripts/check-status.sh "$WARNING_COUNT" "$THRESHOLD"
fi

# Upload artifacts
echo -e "${YELLOW}📤 Uploading artifacts...${NC}"
echo "::group::Full JSON Report"
cat "$PARSED_OUTPUT"
echo "::endgroup::"

# Fail if warnings found and fail-on-warnings is true
if [ "$FAIL_ON_WARNINGS" = "true" ] && [ "$WARNING_COUNT" -gt 0 ]; then
    echo -e "${RED}❌ Action failed: $WARNING_COUNT warnings found${NC}"
    exit 1
fi

if [ "$PARSER_EXIT_CODE" -eq 1 ]; then
    echo -e "${RED}❌ Action failed: Warning threshold exceeded${NC}"
    exit 1
fi

echo -e "${GREEN}✅ SwiftConcur CI completed successfully${NC}"
```

### 4. PR Comment Poster (scripts/post-comment.js)
```javascript
const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');

async function run() {
    try {
        const markdownPath = process.argv[2];
        const warningCount = parseInt(process.argv[3]);
        const newWarnings = parseInt(process.argv[4]);
        const fixedWarnings = parseInt(process.argv[5]);

        const token = process.env.GITHUB_TOKEN;
        const octokit = github.getOctokit(token);
        const context = github.context;

        if (!context.payload.pull_request) {
            console.log('Not a pull request, skipping comment');
            return;
        }

        const markdown = fs.readFileSync(markdownPath, 'utf8');

        // Create comment header
        const header = `## 🔍 SwiftConcur CI Results

| Metric | Count |
|--------|-------|
| Total Warnings | ${warningCount} |
| New Warnings | ${newWarnings > 0 ? `⚠️ ${newWarnings}` : `✅ ${newWarnings}`} |
| Fixed Warnings | ${fixedWarnings > 0 ? `🎉 ${fixedWarnings}` : fixedWarnings} |

`;

        const body = header + markdown;

        // Find existing comment
        const comments = await octokit.rest.issues.listComments({
            ...context.repo,
            issue_number: context.payload.pull_request.number,
        });

        const botComment = comments.data.find(comment => 
            comment.user.type === 'Bot' && 
            comment.body.includes('SwiftConcur CI Results')
        );

        if (botComment) {
            // Update existing comment
            await octokit.rest.issues.updateComment({
                ...context.repo,
                comment_id: botComment.id,
                body: body
            });
        } else {
            // Create new comment
            await octokit.rest.issues.createComment({
                ...context.repo,
                issue_number: context.payload.pull_request.number,
                body: body
            });
        }

        console.log('✅ Comment posted successfully');
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
```

### 5. Commit Status Script (scripts/check-status.sh)
```bash
#!/bin/bash

WARNING_COUNT=$1
THRESHOLD=$2

# Use GitHub API to set commit status
STATUS="success"
DESCRIPTION="No Swift concurrency warnings found"

if [ "$WARNING_COUNT" -gt 0 ]; then
    if [ -n "$THRESHOLD" ] && [ "$WARNING_COUNT" -gt "$THRESHOLD" ]; then
        STATUS="failure"
        DESCRIPTION="❌ $WARNING_COUNT warnings found (threshold: $THRESHOLD)"
    else
        STATUS="warning"
        DESCRIPTION="⚠️ $WARNING_COUNT Swift concurrency warnings found"
    fi
fi

# Set status using GitHub CLI if available
if command -v gh &> /dev/null; then
    gh api \
        --method POST \
        -H "Accept: application/vnd.github+json" \
        /repos/$GITHUB_REPOSITORY/statuses/$GITHUB_SHA \
        -f state="$STATUS" \
        -f description="$DESCRIPTION" \
        -f context="swiftconcur/warnings"
else
    echo "GitHub CLI not available, skipping status update"
fi
```

### 6. Example Workflows

#### Basic Usage (.github/workflows/examples/basic-usage.yml)
```yaml
name: SwiftConcur CI Example - Basic
on:
  pull_request:
    branches: [ main ]

jobs:
  concurrency-check:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: swiftconcur/swiftconcur-ci@v1
        with:
          scheme: 'MyApp'
          workspace-path: 'MyApp.xcworkspace'
```

#### Advanced Configuration (.github/workflows/examples/advanced-security.yml)
```yaml
name: SwiftConcur CI Example - Advanced
on:
  pull_request:
    branches: [ main, develop ]
  push:
    branches: [ main ]

jobs:
  concurrency-check:
    runs-on: macos-latest
    strategy:
      matrix:
        configuration: [Debug, Release]
        
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # For baseline comparison
      
      # Cache Swift packages
      - uses: actions/cache@v3
        with:
          path: .build
          key: ${{ runner.os }}-spm-${{ hashFiles('**/Package.resolved') }}
      
      # Download baseline from main branch
      - name: Download baseline
        if: github.event_name == 'pull_request'
        run: |
          git fetch origin main
          git checkout origin/main -- .swiftconcur/baseline.json || echo "No baseline found"
      
      - uses: swiftconcur/swiftconcur-ci@v1
        id: swiftconcur
        with:
          scheme: 'MyApp'
          workspace-path: 'MyApp.xcworkspace'
          configuration: ${{ matrix.configuration }}
          threshold: 10
          baseline-path: '.swiftconcur/baseline.json'
          context-lines: 5
      
      # Upload results
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: swiftconcur-results-${{ matrix.configuration }}
          path: ${{ steps.swiftconcur.outputs.json-report }}
      
      # Update baseline on main branch
      - name: Update baseline
        if: github.ref == 'refs/heads/main' && matrix.configuration == 'Release'
        run: |
          mkdir -p .swiftconcur
          cp ${{ steps.swiftconcur.outputs.json-report }} .swiftconcur/baseline.json
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .swiftconcur/baseline.json
          git commit -m "Update SwiftConcur baseline" || echo "No changes"
          git push
```

#### Multi-Scheme (.github/workflows/examples/multi-scheme.yml)
```yaml
name: SwiftConcur CI Example - Multi-Scheme
on: [pull_request]

jobs:
  concurrency-matrix:
    runs-on: macos-latest
    strategy:
      fail-fast: false
      matrix:
        scheme: [App, AppTests, AppUITests]
        
    steps:
      - uses: actions/checkout@v4
      
      - uses: swiftconcur/swiftconcur-ci@v1
        with:
          scheme: ${{ matrix.scheme }}
          project-path: 'MyApp.xcodeproj'
          fail-on-warnings: ${{ matrix.scheme == 'App' }}
```

### 7. Test Workflow (.github/workflows/test-action.yml)
```yaml
name: Test Action
on:
  push:
    paths:
      - 'action.yml'
      - 'Dockerfile'
      - 'entrypoint.sh'
      - 'scripts/**'
      - '.github/workflows/test-action.yml'

jobs:
  test-action:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Build Docker image
        run: docker build -t swiftconcur-action .
      
      - name: Test entrypoint script
        run: |
          docker run --rm \
            -e INPUT_SCHEME="TestScheme" \
            -e INPUT_PROJECT_PATH="Test.xcodeproj" \
            -e GITHUB_OUTPUT=/dev/null \
            swiftconcur-action || echo "Expected failure"
      
      - name: Lint shell scripts
        run: |
          sudo apt-get install -y shellcheck
          shellcheck entrypoint.sh scripts/*.sh
      
      - name: Test Node scripts
        run: |
          cd scripts
          npm install
          node -c post-comment.js
```

### 8. README.md
```markdown
# SwiftConcur CI GitHub Action

Automatically detect and track Swift concurrency warnings in your iOS/macOS projects.

## Features

- 🔍 Detects actor isolation violations, Sendable conformance issues, and data races
- 📊 Posts detailed PR comments with warning summaries
- 📈 Tracks warning trends with baseline comparison
- 🚦 Configurable thresholds and failure conditions
- 🎯 Integrates seamlessly with GitHub workflows

## Quick Start

```yaml
- uses: swiftconcur/swiftconcur-ci@v1
  with:
    scheme: 'MyApp'
    workspace-path: 'MyApp.xcworkspace'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `scheme` | Xcode scheme to build | ✅ | - |
| `workspace-path` | Path to .xcworkspace | ❌* | - |
| `project-path` | Path to .xcodeproj | ❌* | - |
| `configuration` | Build configuration | ❌ | `Debug` |
| `threshold` | Max warnings allowed | ❌ | `0` |
| `baseline-path` | Baseline for comparison | ❌ | - |
| `post-comment` | Post PR comment | ❌ | `true` |
| `fail-on-warnings` | Fail if warnings found | ❌ | `true` |

*Either `workspace-path` or `project-path` must be specified

## Outputs

| Output | Description |
|--------|-------------|
| `warning-count` | Total warnings found |
| `new-warnings` | New warnings vs baseline |
| `fixed-warnings` | Fixed warnings vs baseline |
| `summary-markdown` | Markdown summary path |
| `json-report` | Full JSON report path |

## Examples

See the [examples directory](.github/workflows/examples/) for common use cases.

## License

MIT
```

## Testing Strategy

### 1. Unit Tests
- Test parser integration
- Test output formatting
- Test baseline comparison
- Test threshold logic

### 2. Integration Tests
- Test with real Swift projects
- Test PR comment posting
- Test commit status updates
- Test artifact uploads

### 3. End-to-End Tests
- Create test Swift project with known warnings
- Run action in test workflow
- Verify outputs and side effects

## Deployment Checklist

- [ ] Docker image builds successfully
- [ ] Entrypoint script handles all input combinations
- [ ] PR comment posting works with bot token
- [ ] Commit status updates correctly
- [ ] Examples run without errors
- [ ] Documentation is complete
- [ ] Action published to GitHub Marketplace
- [ ] Version tagging strategy defined

## Next Steps

After completing the GitHub Action, proceed to Phase 3 (Cloudflare Workers API) to build the backend for storing and analyzing warning data across multiple repositories.