Enhance the existing Rust CLI parser for SwiftConcur CI with the following features:

1. Parse xcodebuild JSON output to extract Swift concurrency warnings:
   - Actor-isolation violations
   - Sendable conformance issues
   - Data race warnings
   - Performance regression indicators

2. Structure the output as JSON with:
   - Warning type categorization
   - File path and line numbers
   - Code snippet context (3 lines before/after)
   - Severity levels
   - Suggested fixes where applicable

3. Add CLI flags:
   - --format (json|markdown|slack)
   - --baseline (compare against previous run)
   - --threshold (fail if warnings exceed N)
   - --filter (by warning type)

4. Include comprehensive error handling and logging
5. Add unit tests for various xcodebuild output formats
6. Optimize for performance (should handle 100MB+ log files)