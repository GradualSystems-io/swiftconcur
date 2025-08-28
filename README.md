# SwiftConcur CI GitHub Action

[![CI](https://github.com/GradualSystems-io/swiftconcur/actions/workflows/ci.yml/badge.svg)](https://github.com/GradualSystems-io/swiftconcur/actions/workflows/ci.yml)

Automatically detect and track Swift concurrency warnings in your iOS/macOS projects.

## Features

- 🔍 Detects actor isolation violations, Sendable conformance issues, and data races
- 📊 Posts detailed PR comments with warning summaries
- 📈 Tracks warning trends with baseline comparison
- 🚦 Configurable thresholds and failure conditions
- 🎯 Integrates seamlessly with GitHub workflows

## Quick Start (typical PR build)

```yaml
# .github/workflows/swiftconcur.yml
name: SwiftConcur

on: [push, pull_request]

jobs:
  build:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4

      # 1️⃣ Build once in “warnings-only” mode
      - name: Xcode build → xcresult
        run: |
          xcodebuild \
            -scheme ${{ env.SCHEME }} \
            -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
            SWIFT_VERSION=5.10 \
            SWIFT_STRICT_CONCURRENCY=targeted \
            OTHER_SWIFT_FLAGS="-Xfrontend -warn-concurrency" \
            -resultBundlePath build.xcresult

      # 2️⃣ Extract warnings (Xcode 15+ stores them under buildResult → warningSummaries)
      - name: Extract concurrency warnings
        run: |
          xcrun xcresulttool get object --path build.xcresult --format json --legacy |
          jq '.actions._values[0].buildResult.issues.warningSummaries' > warnings.json

      # 3️⃣ Run the CLI
      - name: SwiftConcur scan
        run: |
          curl -Ls https://github.com/GradualSystems-io/swiftconcur/releases/latest/download/swiftconcur-cli-macos-x86_64.tar.gz | tar xz
          ./swiftconcur-cli -f warnings.json



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


## Standalone CLI Usage

You can also use the SwiftConcur CLI directly without GitHub Actions:

### 1. Configure Your iOS Project Build

Add these build settings to enable concurrency warnings:

```bash
# Build your iOS project with concurrency warnings enabled
xcodebuild \
  -scheme YourScheme \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  SWIFT_VERSION=5.10 \
  SWIFT_STRICT_CONCURRENCY=targeted \
  OTHER_SWIFT_FLAGS="-Xfrontend -warn-concurrency" \
  -resultBundlePath build.xcresult
```

### 2. Extract Warnings to JSON

```bash
# Extract concurrency warnings from the build results
xcrun xcresulttool get object --path build.xcresult --format json --legacy |
jq '.actions._values[0].buildResult.issues.warningSummaries' > warnings.json
```

### 3. Run SwiftConcur CLI

```bash
# Download and run the CLI
curl -Ls https://github.com/GradualSystems-io/swiftconcur/releases/latest/download/swiftconcur-cli-macos-x86_64.tar.gz | tar xz
./swiftconcur-cli -f warnings.json --format markdown
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --file` | JSON file with warnings | `warnings.json` |
| `--format` | Output format (json, markdown, slack) | `json` |
| `--baseline` | Baseline file for comparison | - |
| `--threshold` | Maximum warnings allowed | `0` |

## Baseline Comparison

Use a baseline to highlight only new warnings and compute build-time deltas.

Approach A — repo-tracked file (simple)

```yaml
# pull_request: compare to baseline committed on main
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  - name: Download baseline from main
    run: |
      git fetch origin main
      git checkout origin/main -- .swiftconcur/baseline.json || echo "No baseline found"
  - uses: swiftconcur/swiftconcur-ci@v1
    with:
      scheme: 'MyApp'
      workspace-path: 'MyApp.xcworkspace'
      baseline-path: '.swiftconcur/baseline.json'
  # On main: update baseline
  - name: Update baseline (main only)
    if: github.ref == 'refs/heads/main'
    run: |
      mkdir -p .swiftconcur
      cp ${{ steps.swiftconcur.outputs.json-report }} .swiftconcur/baseline.json
      git config user.name "github-actions[bot]"
      git config user.email "github-actions[bot]@users.noreply.github.com"
      git add .swiftconcur/baseline.json
      git commit -m "Update SwiftConcur baseline" || echo "No changes"
      git push
```

Approach B — artifacts (no commits on main)

```yaml
permissions:
  actions: read
  contents: read

steps:
  - uses: actions/checkout@v4
  - name: Download baseline artifact from main
    uses: dawidd6/action-download-artifact@v3
    with:
      workflow: ci.yml           # name or filename of workflow on main
      branch: main
      name: swiftconcur-baseline # artifact name
      path: .swiftconcur
      if_no_artifact_found: warn
  - uses: swiftconcur/swiftconcur-ci@v1
    id: swiftconcur
    with:
      scheme: 'MyApp'
      workspace-path: 'MyApp.xcworkspace'
      baseline-path: '.swiftconcur/baseline.json'
  - name: Upload baseline artifact (update)
    if: always()
    uses: actions/upload-artifact@v4
    with:
      name: swiftconcur-baseline
      path: ${{ steps.swiftconcur.outputs.json-report }}
      if-no-files-found: ignore
```

Notes
- Baseline JSON schema is the tool’s `json-report` output, which includes `warnings[]` (with stable IDs) and `build_time_seconds`.
- If no baseline is present, the action computes metrics with empty new/fixed sets and omits build delta.
| `--context-lines` | Lines of code context | `3` |

### Integration with PR Comments

To automatically add each warning/error to your PR:

1. **Run the build and extract warnings** (steps 1-2 above)
2. **Generate markdown output**:
   ```bash
   ./swiftconcur-cli -f warnings.json --format markdown > warnings.md
   ```
3. **Post to PR** using GitHub CLI or API:
   ```bash
   # Using GitHub CLI
   gh pr comment $PR_NUMBER --body-file warnings.md
   
   # Or append to existing PR body
   gh pr edit $PR_NUMBER --body "$(gh pr view $PR_NUMBER --json body -q .body)\n\n$(cat warnings.md)"
   ```

## Examples

See the [examples directory](.github/workflows/examples/) for common use cases.

## License

MIT
