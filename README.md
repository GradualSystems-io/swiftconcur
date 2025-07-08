# SwiftConcur CI Action

A GitHub Action for analyzing Swift concurrency warnings in Xcode builds with built-in reliability and security features.

## Features

- 🔍 **Comprehensive Analysis**: Detects actor-isolation violations, Sendable conformance issues, and data race warnings
- 🛡️ **Security-First**: Implements GitHub's security best practices with minimal permissions
- 🔄 **Reliability**: Built-in retries, fallbacks, and error handling to prevent build failures
- 📊 **Multiple Formats**: JSON, Markdown, and Slack output formats
- 🎯 **Threshold Control**: Configurable warning thresholds
- 📝 **PR Integration**: Automatic PR comments and check status updates

## Quick Start

```yaml
name: SwiftConcur Analysis

on:
  pull_request:
    branches: [main]

jobs:
  analyze:
    runs-on: macos-latest
    permissions:
      contents: read
      issues: write
      pull-requests: write
      checks: write
      
    steps:
      - uses: actions/checkout@v4
      - uses: gradual-systems/swiftconcur@v1
        with:
          scheme: 'MyApp'
          threshold: '5'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `scheme` | Xcode scheme to build | ✅ | - |
| `swift-version` | Swift version to use | ❌ | `5.9` |
| `workspace-path` | Path to workspace/project | ❌ | `.` |
| `configuration` | Build configuration | ❌ | `Debug` |
| `threshold` | Max warnings before failing | ❌ | `0` |
| `format` | Output format (json/markdown/slack) | ❌ | `markdown` |
| `fail-on-error` | Fail on tool errors | ❌ | `false` |
| `retry-count` | Number of retries | ❌ | `3` |
| `timeout` | Build timeout (minutes) | ❌ | `30` |

## Outputs

| Output | Description |
|--------|-------------|
| `warning-count` | Number of warnings found |
| `summary-markdown` | Markdown formatted summary |
| `json-report` | Full JSON report |
| `success` | Whether analysis completed successfully |

## Security Best Practices

### 1. Use Minimal Permissions

```yaml
permissions:
  contents: read          # Read repository contents
  issues: write          # Create/update issues
  pull-requests: write   # Comment on PRs
  checks: write          # Create check runs
```

### 2. Environment Variables

Use environment variables for sensitive configuration:

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  # Never hardcode tokens in workflow files
```

### 3. Secure Token Handling

The action validates GitHub tokens and uses secure API calls:

```bash
# Token format validation
if [[ ! "$GITHUB_TOKEN" =~ ^gh[pousr]_[A-Za-z0-9_]{36,255}$ ]]; then
  log_warn "GitHub token format appears invalid"
fi
```

### 4. Input Validation

All inputs are validated to prevent injection attacks:

```bash
# Scheme name validation
if [[ ! "$SCHEME" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  handle_error 1 "Invalid scheme name"
fi
```

## Reliability Features

### 1. Automatic Retries

The action implements exponential backoff for transient failures:

```yaml
with:
  retry-count: '3'  # Retry failed operations up to 3 times
```

### 2. Graceful Degradation

By default, the action won't fail your build if the tool itself fails:

```yaml
with:
  fail-on-error: 'false'  # Continue build even if analysis fails
```

### 3. Timeout Protection

Prevents hanging builds with configurable timeouts:

```yaml
with:
  timeout: '30'  # Maximum 30 minutes per build
```

### 4. Error Recovery

The action attempts multiple recovery strategies:

- Falls back to empty results if parser fails
- Retries xcodebuild with different configurations
- Gracefully handles missing dependencies

## Advanced Usage

### Multi-Scheme Analysis

```yaml
strategy:
  matrix:
    scheme: ['App', 'Tests', 'Extensions']
    
steps:
  - uses: gradual-systems/swiftconcur@v1
    with:
      scheme: ${{ matrix.scheme }}
      threshold: '10'
      format: 'json'
```

### Custom Thresholds by Branch

```yaml
- uses: gradual-systems/swiftconcur@v1
  with:
    scheme: 'MyApp'
    threshold: ${{ github.ref == 'refs/heads/main' && '0' || '5' }}
```

### Integration with Security Workflows

```yaml
- name: Security scan results
  run: |
    # Scan for sensitive data in warning messages
    if grep -i "password\|secret\|token" /tmp/warnings.json; then
      echo "::warning::Potential sensitive data detected"
    fi
```

## Output Examples

### Markdown Format

```markdown
## SwiftConcur Analysis Results

⚠️ Found 3 Swift concurrency warnings

### Warnings:
- actor-isolated property 'shared' cannot be referenced from a non-isolated context
- capture of 'self' with non-sendable type requires 'Sendable' conformance
- data race on property 'counter' in actor 'CounterActor'
```

### JSON Format

```json
{
  "warnings": [
    {
      "type": "actor-isolation",
      "message": "actor-isolated property 'shared' cannot be referenced from a non-isolated context",
      "file": "Sources/MyApp/ContentView.swift",
      "line": 42,
      "severity": "warning"
    }
  ],
  "count": 3,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Troubleshooting

### Common Issues

1. **"xcodebuild not found"**
   - Ensure running on `macos-latest`
   - Check Xcode installation

2. **"No workspace or project found"**
   - Verify `workspace-path` input
   - Check file permissions

3. **"Build timed out"**
   - Increase `timeout` value
   - Optimize build configuration

### Debug Mode

Enable verbose logging:

```yaml
env:
  ACTIONS_STEP_DEBUG: true
```

### Support

For issues and feature requests, please visit our [GitHub Issues](https://github.com/gradual-systems/swiftconcur/issues).

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all security checks pass
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Security

If you discover a security vulnerability, please send an email to security@gradual.systems. All security vulnerabilities will be promptly addressed.

---

Made with ❤️ by [Gradual Systems](https://gradual.systems)