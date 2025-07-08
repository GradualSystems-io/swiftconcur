Create a GitHub Action for SwiftConcur CI that:

1. Creates action.yml with:
   - Inputs: swift-version, workspace-path, scheme, configuration
   - Outputs: warning-count, summary-markdown, json-report
   - Runs using Docker container

2. Build Dockerfile that:
   - Uses rust:slim as base
   - Installs the parser binary
   - Sets up entrypoint script

3. Create entrypoint.sh that:
   - Runs xcodebuild with JSON output
   - Pipes to the Rust parser
   - Posts results as PR comment using GitHub API
   - Sets check status (pass/fail based on threshold)
   - Uploads artifacts (full report)

4. Add workflow examples for common scenarios
5. Include README with setup instructions