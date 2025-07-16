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