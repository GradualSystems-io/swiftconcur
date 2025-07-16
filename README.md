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