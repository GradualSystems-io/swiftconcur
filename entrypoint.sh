#!/bin/bash
set -e

# Resolve action root directory (works for composite actions)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
# Thresholds
WARN_THRESHOLD="${INPUT_WARN_THRESHOLD:-0}"
THRESHOLD="${INPUT_THRESHOLD:-0}"
BASELINE_PATH="${INPUT_BASELINE_PATH}"
POST_COMMENT="${INPUT_POST_COMMENT:-true}"
FAIL_ON_WARNINGS="${INPUT_FAIL_ON_WARNINGS:-true}"
CONTEXT_LINES="${INPUT_CONTEXT_LINES:-3}"
# Dashboard URL for details link
DASHBOARD_URL="${INPUT_DASHBOARD_URL}"

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

# Ensure we produce a result bundle for structured parsing
RESULT_BUNDLE_PATH=""
if echo "$INPUT_XCODEBUILD_ARGS" | grep -q -- "-resultBundlePath"; then
    RESULT_BUNDLE_PATH=$(echo "$INPUT_XCODEBUILD_ARGS" | sed -n 's/.*-resultBundlePath[[:space:]]\([^[:space:]]\+\).*/\1/p')
else
    RESULT_BUNDLE_PATH="build.xcresult"
    XCODEBUILD_CMD="$XCODEBUILD_CMD -resultBundlePath $RESULT_BUNDLE_PATH"
fi

# Append build action
XCODEBUILD_CMD="$XCODEBUILD_CMD clean build"

# Append extra xcodebuild args if provided
if [ -n "$INPUT_XCODEBUILD_ARGS" ]; then
    XCODEBUILD_CMD="$XCODEBUILD_CMD $INPUT_XCODEBUILD_ARGS"
fi

# Create temporary directory for outputs
OUTPUT_DIR=$(mktemp -d)
LOG_OUTPUT="$OUTPUT_DIR/xcodebuild.log"
JSON_OUTPUT="$OUTPUT_DIR/xcodebuild.json"
PARSED_OUTPUT="$OUTPUT_DIR/warnings.json"
MARKDOWN_OUTPUT="$OUTPUT_DIR/summary.md"

echo -e "${YELLOW}📦 Building project...${NC}"
echo "Command: $XCODEBUILD_CMD"

# Time the build
START_TS=$(date +%s)

# Run xcodebuild and capture output
if ! eval "$XCODEBUILD_CMD" 2>&1 | tee "$LOG_OUTPUT"; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build completed${NC}"

END_TS=$(date +%s)
BUILD_TIME_SECONDS=$((END_TS-START_TS))

# Format build time (e.g., 18m, or 1h 3m)
format_duration() {
  local SECS=$1
  if [ "$SECS" -ge 3600 ]; then
    local H=$((SECS/3600))
    local M=$(((SECS%3600)/60))
    echo "${H}h ${M}m"
  elif [ "$SECS" -ge 60 ]; then
    local M=$((SECS/60))
    echo "${M}m"
  else
    echo "${SECS}s"
  fi
}
BUILD_TIME_HUMAN=$(format_duration "$BUILD_TIME_SECONDS")

# Parse warnings
echo -e "${YELLOW}🔍 Parsing warnings...${NC}"

# If we have an xcresult bundle, extract warnings JSON via xcresulttool
if [ -d "$RESULT_BUNDLE_PATH" ]; then
  if command -v xcrun >/dev/null 2>&1; then
    xcrun xcresulttool get object --path "$RESULT_BUNDLE_PATH" --format json --legacy \
      | jq '.actions._values[0].buildResult.issues.warningSummaries' > "$JSON_OUTPUT" || echo '{"_values":[]}' > "$JSON_OUTPUT"
  else
    echo '{"_values":[]}' > "$JSON_OUTPUT"
  fi
else
  # Fallback to build log as input (parser will try to interpret lines)
  cp "$LOG_OUTPUT" "$JSON_OUTPUT"
fi

# Detect parser binary name and ensure availability
SWIFTPARSE_BIN="${SWIFTPARSE_BIN:-swiftconcur}"
if [ ! -x "$SWIFTPARSE_BIN" ]; then
  if command -v swiftconcur-parser >/dev/null 2>&1; then
    SWIFTPARSE_BIN="$(command -v swiftconcur-parser)"
  elif [ -x "$SCRIPT_DIR/parser/target/release/swiftconcur-parser" ]; then
    SWIFTPARSE_BIN="$SCRIPT_DIR/parser/target/release/swiftconcur-parser"
  else
    echo -e "${YELLOW}🔧 Parser binary not found; attempting local build...${NC}"
    if command -v cargo >/dev/null 2>&1; then
      (
        cd "$SCRIPT_DIR/parser" && cargo build --release
      ) || {
        echo -e "${RED}❌ Failed to build parser binary${NC}"
        exit 2
      }
      SWIFTPARSE_BIN="$SCRIPT_DIR/parser/target/release/swiftconcur-parser"
    else
      echo -e "${RED}❌ Parser binary not available and cargo not installed${NC}"
      exit 2
    fi
  fi
fi

# Final sanity check and diagnostics
if [ ! -x "$SWIFTPARSE_BIN" ]; then
  echo -e "${RED}❌ Parser binary still not found at: $SWIFTPARSE_BIN${NC}"
  echo "Contents of parser target dir (if any):"
  ls -la "$SCRIPT_DIR/parser/target/release" 2>/dev/null || echo "(missing)"
  exit 2
fi

PARSER_CMD="$SWIFTPARSE_BIN -f \"$JSON_OUTPUT\" --format json --context $CONTEXT_LINES"

if [ -n "$THRESHOLD" ] && [ "$THRESHOLD" -gt 0 ]; then
    PARSER_CMD="$PARSER_CMD --threshold $THRESHOLD"
fi

# Run parser directly; fallback to cargo run if exec fails
if ! eval "$PARSER_CMD" > "$PARSED_OUTPUT" 2>/dev/null; then
    PARSER_EXIT_CODE=$?
    echo -e "${YELLOW}🔁 Parser direct exec failed (code $PARSER_EXIT_CODE). Retrying via cargo run...${NC}"
    if command -v cargo >/dev/null 2>&1; then
      (
        cd "$SCRIPT_DIR/parser" && cargo run --release -- -f "$JSON_OUTPUT" --format json --context "$CONTEXT_LINES" ${THRESHOLD:+--threshold "$THRESHOLD"}
      ) > "$PARSED_OUTPUT" 2>/dev/null || {
        PARSER_EXIT_CODE=$?
        if [ $PARSER_EXIT_CODE -eq 1 ]; then
            echo -e "${RED}❌ Warning threshold exceeded${NC}"
        else
            echo -e "${RED}❌ Parser error${NC}"
            exit 2
        fi
      }
    else
      if [ $PARSER_EXIT_CODE -eq 1 ]; then
          echo -e "${RED}❌ Warning threshold exceeded${NC}"
      else
          echo -e "${RED}❌ Parser error${NC}"
          exit 2
      fi
    fi
fi

# Generate markdown summary with explicit fallback (avoid SC2015)
if ! "$SWIFTPARSE_BIN" -f "$JSON_OUTPUT" --format markdown > "$MARKDOWN_OUTPUT" 2>/dev/null; then
  if command -v cargo >/dev/null 2>&1; then
    (
      cd "$SCRIPT_DIR/parser" && cargo run --release -- -f "$JSON_OUTPUT" --format markdown > "$MARKDOWN_OUTPUT" 2>/dev/null
    ) || true
  fi
fi

# Compute metrics and baseline diffs with jq
FINAL_OUTPUT="$OUTPUT_DIR/report.json"

# Start with parsed output and add build_time_seconds
jq --argjson secs "$BUILD_TIME_SECONDS" '. + { build_time_seconds: $secs }' "$PARSED_OUTPUT" > "$FINAL_OUTPUT"

# If a baseline exists, compute diffs and build time delta
if [ -n "$BASELINE_PATH" ] && [ -f "$BASELINE_PATH" ]; then
  # New and fixed warning ID sets
  CUR_IDS=$(jq -r '.warnings[].id' "$PARSED_OUTPUT" | sort | uniq)
  BASE_IDS=$(jq -r '.warnings[].id' "$BASELINE_PATH" 2>/dev/null | sort | uniq)

  # Create temp files for set operations
  CUR_IDS_FILE=$(mktemp)
  BASE_IDS_FILE=$(mktemp)
  echo "$CUR_IDS" > "$CUR_IDS_FILE"
  echo "$BASE_IDS" > "$BASE_IDS_FILE"

  NEW_IDS=$(comm -13 "$BASE_IDS_FILE" "$CUR_IDS_FILE" | jq -R -s -c 'split("\n") | map(select(length>0))')
  FIXED_IDS=$(comm -23 "$BASE_IDS_FILE" "$CUR_IDS_FILE" | jq -R -s -c 'split("\n") | map(select(length>0))')

  # Merge arrays into FINAL_OUTPUT
  jq --argjson new "$NEW_IDS" --argjson fixed "$FIXED_IDS" '. + { new_warnings: $new, fixed_warnings: $fixed }' "$FINAL_OUTPUT" > "$FINAL_OUTPUT.tmp" && mv "$FINAL_OUTPUT.tmp" "$FINAL_OUTPUT"

  # Build time delta vs baseline (percentage string like +12%)
  BASE_SECS=$(jq -r '.build_time_seconds // empty' "$BASELINE_PATH" 2>/dev/null || echo "")
  if [ -n "$BASE_SECS" ] && [ "$BASE_SECS" -gt 0 ] 2>/dev/null; then
    DELTA_PCT=$(awk -v c="$BUILD_TIME_SECONDS" -v b="$BASE_SECS" 'BEGIN { printf "%+0.0f%%", ((c-b)*100.0)/b }')
  else
    DELTA_PCT=""
  fi
else
  # No baseline
  jq '. + { new_warnings: [], fixed_warnings: [] }' "$FINAL_OUTPUT" > "$FINAL_OUTPUT.tmp" && mv "$FINAL_OUTPUT.tmp" "$FINAL_OUTPUT"
  DELTA_PCT=""
fi

# Extract metrics for summary and outputs
WARNING_COUNT=$(jq '.warnings | length' "$FINAL_OUTPUT")
NEW_WARNINGS=$(jq '.new_warnings | length' "$FINAL_OUTPUT")
FIXED_WARNINGS=$(jq '.fixed_warnings | length' "$FINAL_OUTPUT")

# Actor-isolation specific metrics
ACTOR_COUNT=$(jq '[.warnings[] | select(.warning_type=="actor_isolation")] | length' "$FINAL_OUTPUT")
# New actor-isolation warnings only (intersection of new_warnings IDs and actor warnings)
ACTOR_NEW_COUNT=$(jq '
  (.new_warnings // []) as $new
  | (.warnings // []) as $ws
  | ($ws | map(select(.warning_type=="actor_isolation") | .id)) as $actorIds
  | ($new | map({(.): true}) | add // {}) as $newSet
  | [$actorIds[] | select($newSet[.]) ] | length
' "$FINAL_OUTPUT")

# Top 3 actor-isolation offenders: file:line
TOP3=$(jq -r '[.warnings[] | select(.warning_type=="actor_isolation") | ((.file_path|tostring|split("/"))[-1] + ":" + (.line_number|tostring))] | unique | .[:3] | join(", ")' "$FINAL_OUTPUT")

echo -e "${YELLOW}📊 Results:${NC}"
echo "  Total warnings: $WARNING_COUNT"
echo "  New warnings: $NEW_WARNINGS"
echo "  Fixed warnings: $FIXED_WARNINGS"
echo "  Actor-isolation warnings: $ACTOR_COUNT"
echo "  Build time: $BUILD_TIME_HUMAN ${DELTA_PCT:+($DELTA_PCT vs baseline)}"

# Set outputs
{
  echo "warning-count=$WARNING_COUNT"
  echo "new-warnings=$NEW_WARNINGS"
  echo "fixed-warnings=$FIXED_WARNINGS"
  echo "summary-markdown=$MARKDOWN_OUTPUT"
  echo "json-report=$FINAL_OUTPUT"
  echo "build-time-seconds=$BUILD_TIME_SECONDS"
} >> "$GITHUB_OUTPUT"

# Post comment if in PR context
if [ "$POST_COMMENT" = "true" ] && [ -n "$GITHUB_EVENT_PATH" ]; then
    EVENT_NAME=$(jq -r .event_name "$GITHUB_EVENT_PATH" 2>/dev/null || echo "")
    
    if [ "$EVENT_NAME" = "pull_request" ]; then
        echo -e "${YELLOW}💬 Posting PR comment...${NC}"
        node "$SCRIPT_DIR/scripts/post-comment.js" \
          "$BUILD_TIME_HUMAN" \
          "$DELTA_PCT" \
          "$ACTOR_COUNT" \
          "$ACTOR_NEW_COUNT" \
          "$TOP3" \
          "${DASHBOARD_URL:-https://dashboard.swiftconcur.com}"
    fi
fi

# Set commit status
if [ -n "$GITHUB_SHA" ]; then
    echo -e "${YELLOW}📌 Setting commit status...${NC}"
    "$SCRIPT_DIR/scripts/check-status.sh" "$WARNING_COUNT" "$WARN_THRESHOLD" "$THRESHOLD"
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
