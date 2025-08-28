# SwiftConcur CI - Master Implementation Guide

## Environment & Ops Constraints
- Sandbox: workspace-write
- Network: restricted
- Approvals: on-request
- Shell: zsh
- Package manager: npm (package-lock present)
- Rust toolchain: stable (via `actions-rust-lang/setup-rust-toolchain@v1`)

## Project Overview
SwiftConcur CI is a comprehensive CI/CD solution for Swift projects that detects and tracks Swift concurrency issues (actor isolation violations, Sendable conformance, data races) through the development lifecycle.

## Architecture Components

### 1. Rust CLI Parser (`/parser`)
**Purpose**: Parse xcodebuild JSON output and extract Swift concurrency warnings

**Key Features**:
- Parse JSON output from xcodebuild
- Categorize warnings by type
- Extract file paths, line numbers, and code context
- Support multiple output formats (JSON, Markdown, Slack)
- Handle large log files (100MB+) efficiently

**Implementation Priority**: HIGH - This is the foundation

### 2. GitHub Action (root `action.yml`)
**Purpose**: Integrate the parser into GitHub workflows

**Key Features**:
- Docker-based action (see `Dockerfile` and `entrypoint.sh` at repo root)
- Run xcodebuild and pipe to parser
- Post results as PR comments (see `scripts/post-comment.js`)
- Set check status based on thresholds

**Implementation Priority**: HIGH - Critical for CI integration

### 3. Cloudflare Workers API (`/api`)
**Purpose**: Backend for processing and storing results

**Key Features**:
- Webhook endpoint for GitHub Action results
- Supabase integration for data persistence
- AI summarization via OpenAI
- Notification dispatch (Slack/Teams)

**Implementation Priority**: MEDIUM - Can be implemented after core functionality

### 4. Next.js Dashboard (`/dashboard`)
**Purpose**: Visualization and analytics

**Key Features**:
- Repository overview
- Warning trends over time
- Branch comparisons
- Export capabilities

**Implementation Priority**: LOW - Nice to have after API

### 5. GitHub Marketplace Integration (`/billing`)
**Purpose**: Monetization and plan management

Note: This component is planned and the `/billing` directory may not yet exist in the repo.

**Implementation Priority**: LOW - After MVP validation

## Implementation Order

### Phase 1: Core Parser (Week 1)
1. Set up Rust project structure in `/parser`
2. Implement xcodebuild JSON parsing
3. Create warning categorization logic
4. Add CLI interface with clap
5. Implement output formatters
6. Add comprehensive tests

### Phase 2: GitHub Action (Week 1-2)
1. Create Dockerfile with Rust parser
2. Build action.yml configuration
3. Implement entrypoint.sh script
4. Add GitHub API integration for comments
5. Create example workflows

### Phase 3: API & Storage (Week 2-3)
1. Set up Cloudflare Workers project
2. Implement webhook handler
3. Configure Supabase schema
4. Add OpenAI integration
5. Build notification system

### Phase 4: Dashboard (Week 3-4)
1. Create Next.js app structure
2. Implement authentication
3. Build data visualization components
4. Add export functionality

### Phase 5: Marketplace (Week 4+)
1. Implement billing webhooks
2. Add plan enforcement
3. Create usage tracking

## Technical Specifications

### Rust Parser Structure
```
parser/
├── src/
│   ├── main.rs           # CLI entry point
│   ├── parser/
│   │   ├── mod.rs        # Parser module
│   │   ├── xcodebuild.rs # xcodebuild JSON parsing
│   │   └── warnings.rs   # Warning categorization
│   ├── formatters/
│   │   ├── mod.rs        # Formatter trait
│   │   ├── json.rs       # JSON output
│   │   ├── markdown.rs   # Markdown output
│   │   └── slack.rs      # Slack format
│   └── lib.rs            # Library interface
├── tests/
│   └── fixtures/         # Test JSON files
└── Cargo.toml
```

### Warning Categories
1. **Actor Isolation Violations**
   - Pattern: `Actor-isolated.*can not be referenced`
   - Severity: High

2. **Sendable Conformance**
   - Pattern: `Type.*does not conform to.*Sendable`
   - Severity: High

3. **Data Race Warnings**
   - Pattern: `data race|race condition`
   - Severity: Critical

4. **Performance Warnings**
   - Pattern: `performance.*concurrency`
   - Severity: Medium

### CLI Interface
```bash
swiftconcur parse [OPTIONS] <INPUT>

OPTIONS:
    -f, --format <FORMAT>      Output format [default: json] [possible values: json, markdown, slack]
    -b, --baseline <FILE>      Compare against baseline file
    -t, --threshold <N>        Fail if warnings exceed N
    -F, --filter <TYPE>        Filter by warning type
    -c, --context <LINES>      Lines of context [default: 3]
    -v, --verbose             Enable verbose logging
```

### GitHub Action Interface
```yaml
- uses: swiftconcur/swiftconcur-ci@v1
  with:
    swift-version: '5.9'
    workspace-path: './MyApp.xcworkspace'
    scheme: 'MyApp'
    configuration: 'Debug'
    threshold: 10
```

### Supabase Schema
```sql
-- Organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    github_id INTEGER UNIQUE,
    name TEXT NOT NULL,
    plan TEXT DEFAULT 'free'
);

-- Repositories
CREATE TABLE repositories (
    id UUID PRIMARY KEY,
    org_id UUID REFERENCES organizations(id),
    github_id INTEGER UNIQUE,
    name TEXT NOT NULL,
    is_private BOOLEAN DEFAULT false
);

-- Warning Runs
CREATE TABLE warning_runs (
    id UUID PRIMARY KEY,
    repo_id UUID REFERENCES repositories(id),
    commit_sha TEXT NOT NULL,
    branch TEXT NOT NULL,
    pull_request INTEGER,
    total_warnings INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Warnings
CREATE TABLE warnings (
    id UUID PRIMARY KEY,
    run_id UUID REFERENCES warning_runs(id),
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    file_path TEXT NOT NULL,
    line_number INTEGER,
    column_number INTEGER,
    message TEXT NOT NULL,
    code_context TEXT
);
```

## Development Guidelines

### Rust Best Practices
- Use `thiserror` for error handling
- Use `serde` for JSON parsing/serialization
- Use `rayon` for parallel processing of large files
- Implement streaming for memory efficiency
- Add comprehensive logging with `tracing`

### Testing Strategy
- Unit tests for each parser component
- Integration tests with real xcodebuild output
- Performance benchmarks for large files
- Fixture-based testing with various warning types

### CI/CD Setup
```yaml
# Example workflow (stored at `.github/workflows/ci.yml`)
name: CI
on: [push, pull_request]
jobs:
  parser:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions-rust-lang/setup-rust-toolchain@v1
      - run: cd parser && cargo test
      - run: cd parser && cargo clippy -- -D warnings
      - run: cd parser && cargo fmt -- --check
```

### Error Handling
- Parse errors should not crash the parser
- Gracefully handle malformed JSON
- Provide helpful error messages
- Exit codes: 0 (success), 1 (warnings exceed threshold), 2 (parse error)

## MVP Deliverables

### Week 1
- [ ] Working Rust parser with JSON output
- [ ] Basic GitHub Action that runs parser
- [ ] Example workflow files
- [ ] README with setup instructions

### Week 2
- [ ] Markdown and Slack formatters
- [ ] PR comment integration
- [ ] Baseline comparison feature
- [ ] Performance optimizations

### Week 3
- [ ] Cloudflare Workers API
- [ ] Supabase integration
- [ ] Basic AI summarization

### Week 4
- [ ] Next.js dashboard skeleton
- [ ] Basic visualization charts
- [ ] Authentication flow

## Testing Fixtures

Create realistic test fixtures in `parser/tests/fixtures/`:
- `simple_warnings.json` - Basic actor isolation warnings
- `complex_project.json` - Large project with mixed warnings
- `no_warnings.json` - Clean build output
- `malformed.json` - Invalid JSON for error testing
- `performance_regression.json` - Performance-related warnings

## Success Metrics
- Parser processes 100MB files in <5 seconds
- Zero false positives in warning detection
- 95%+ test coverage
- <500ms API response time
- Dashboard loads in <2 seconds

## Open Questions for Implementation
1. Should we support xcpretty format in addition to raw JSON?
2. Do we need to handle incremental builds differently?
3. Should warnings be deduplicated across runs?
4. What's the retention policy for historical data?
5. Should we support custom warning patterns via config?

## Repo Map (Quick Orientation)
- `parser/`: Rust CLI parser for xcodebuild JSON output
- `action.yml`: GitHub Action definition (Docker-based)
- `Dockerfile`, `entrypoint.sh`: Action runtime
- `scripts/`: Helper scripts (e.g., `post-comment.js`)
- `.github/workflows/`: CI workflows (e.g., `ci.yml`, `test-action.yml`)
- `api/`: Cloudflare Workers API (planned/initial)
- `dashboard/`: Next.js dashboard (planned/initial)
- `docs/assistant/`: Assistant configuration and prompts
- `LAUNCH/`: Launch docs and iterations

## Local Dev Commands
- Parser:
  - `cd parser && cargo test`
  - `cd parser && cargo clippy -- -D warnings`
  - `cd parser && cargo fmt -- --check`
- Action image (optional):
  - `docker build -t swiftconcur-action .`
  - `docker run --rm swiftconcur-action --help`
- Dashboard (if present):
  - `cd dashboard && npm install && npm run dev`
- API (if using Wrangler):
  - `cd api && npm install && npx wrangler dev`
