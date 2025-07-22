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


## Examples

See the [examples directory](.github/workflows/examples/) for common use cases.

## License

MIT
