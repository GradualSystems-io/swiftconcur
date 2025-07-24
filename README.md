# SwiftConcur CI GitHub Action

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
