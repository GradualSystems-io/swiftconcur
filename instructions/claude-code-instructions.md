# Claude Code Implementation Instructions

## Overview
You are building SwiftConcur CI, a tool that detects Swift concurrency warnings in iOS/macOS projects. The project has 5 phases, but focus on Phase 1 (Rust Parser) and Phase 2 (GitHub Action) first.

## Current Project Structure
```
/
├── .github/workflows/     # Existing workflows
├── cli/                   # Empty - ignore this
├── parser/               # Rust CLI parser - IMPLEMENT THIS FIRST
├── instructions/         # Documentation files
├── action.yml           # GitHub Action definition
├── Dockerfile           # Docker container for action
├── entrypoint.sh        # Action entry point script
└── README.md
```

## Phase 1: Rust Parser Implementation

### Step 1: Initialize Parser Project
```bash
cd parser
# Project should parse xcodebuild JSON output for Swift concurrency warnings
```

### Step 2: Create Cargo.toml
Add these dependencies:
- clap (with derive feature) for CLI
- serde, serde_json for JSON parsing
- regex for pattern matching
- colored for terminal output
- thiserror for error handling

### Step 3: Implement Core Features
1. **CLI Interface** (`src/cli.rs`):
   - Input: stdin or file path
   - Flags: --format (json/markdown/slack), --threshold N, --baseline FILE
   - Output: warnings in requested format

2. **Warning Detection** (`src/parser/patterns.rs`):
   - Actor isolation: "actor-isolated.*can not be referenced"
   - Sendable: "does not conform to.*Sendable"
   - Data races: "data race|race condition"
   - Tag each with severity (Critical/High/Medium/Low)

3. **JSON Parser** (`src/parser/xcodebuild.rs`):
   - Parse xcodebuild JSON output
   - Extract file path, line number, message
   - Get 3 lines of context around each warning

4. **Output Formatters** (`src/formatters/`):
   - JSON: Full structured output
   - Markdown: Human-readable with code blocks
   - Slack: Formatted for Slack messages

### Step 4: Add Tests
Create `tests/fixtures/` with sample xcodebuild output:
- `actor_warnings.json` - Sample with actor isolation warnings
- `clean_build.json` - No warnings
- `mixed_warnings.json` - Various warning types

### Step 5: Implement Main Logic
The parser should:
1. Read xcodebuild JSON from stdin or file
2. Find all Swift concurrency warnings using regex
3. Extract context (3 lines before/after)
4. Format output based on --format flag
5. Exit with code 0 (success) or 1 (threshold exceeded)

## Phase 2: GitHub Action Implementation

### Step 1: Update Dockerfile
- Use multi-stage build
- Build Rust parser in first stage
- Use Swift base image for runtime
- Copy parser binary to /usr/local/bin/swiftconcur

### Step 2: Implement entrypoint.sh
The script should:
1. Run xcodebuild with user's parameters
2. Pipe output to the Rust parser
3. Post results as PR comment (if in PR context)
4. Set GitHub commit status
5. Output results for other actions to consume

### Step 3: Create action.yml
Define inputs:
- scheme (required)
- workspace-path or project-path
- threshold (default: 0)
- configuration (default: Debug)

Define outputs:
- warning-count
- summary-markdown
- json-report

### Step 4: Add Example Workflows
Create `.github/workflows/examples/basic-usage.yml` showing:
```yaml
- uses: swiftconcur/swiftconcur-ci@v1
  with:
    scheme: 'MyApp'
    workspace-path: 'MyApp.xcworkspace'
```

## Key Implementation Notes

### For the Rust Parser:
1. Start with a simple regex-based approach
2. Focus on accurate warning detection first
3. Make it fast - should handle 100MB files
4. Use streaming to avoid loading entire file in memory
5. Exit codes: 0 (ok), 1 (threshold exceeded), 2 (error)

### For the GitHub Action:
1. The action runs in Docker for consistency
2. Must work with both .xcworkspace and .xcodeproj
3. Post PR comments using GitHub's API
4. Make comment updates (don't spam with new comments)
5. Include emoji for better readability (✅ ❌ ⚠️)

### Sample Warning Patterns to Detect:
```
MyViewController.swift:42:8: warning: actor-isolated property 'name' can not be referenced from a non-isolated context
LoginService.swift:18:6: warning: type 'UserSession' does not conform to the 'Sendable' protocol
DataManager.swift:95:4: warning: data race detected in async context
```

## Testing Your Implementation

### Test the Parser:
```bash
cd parser
cargo test
echo '{"warnings": [...]}' | cargo run -- --format json
```

### Test the Action:
```bash
docker build -t swiftconcur-test .
docker run swiftconcur-test
```

## Success Criteria
1. Parser correctly identifies all Swift concurrency warnings
2. Action integrates smoothly with GitHub PRs
3. PR comments are clear and actionable
4. Performance is good (< 5 seconds for typical project)
5. Error messages are helpful

## Common Pitfalls to Avoid
1. Don't parse xcodebuild's human-readable output - use JSON
2. Don't load entire files into memory - stream when possible
3. Don't create new PR comments on every run - update existing
4. Don't fail silently - provide clear error messages
5. Don't hardcode paths - make everything configurable

Start with Phase 1 (parser) and get it working locally before moving to Phase 2 (action).