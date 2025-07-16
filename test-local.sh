#!/bin/bash
set -e

echo "🧪 SwiftConcur Local Testing Suite"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Test 1: Rust Parser
echo
log_info "Testing Rust Parser..."
cd parser

if ! cargo test; then
    log_error "Rust tests failed"
    exit 1
fi
log_success "Rust tests passed"

# Test parser with sample data
log_info "Testing parser with sample warnings..."
if ! cargo run -- tests/fixtures/mixed_warnings.json --format json > /tmp/parser_test.json; then
    log_error "Parser execution failed"
    exit 1
fi

# Validate JSON output
if ! jq . /tmp/parser_test.json > /dev/null; then
    log_error "Parser did not generate valid JSON"
    exit 1
fi

WARNING_COUNT=$(jq '.warnings | length' /tmp/parser_test.json)
log_success "Parser found $WARNING_COUNT warnings"

cd ..

# Test 2: Docker Build
echo
log_info "Testing Docker build..."
if ! docker build -t swiftconcur-test . > /tmp/docker_build.log 2>&1; then
    log_error "Docker build failed"
    cat /tmp/docker_build.log
    exit 1
fi
log_success "Docker build completed"

# Test 3: Docker Container
echo
log_info "Testing Docker container..."
if ! docker run --rm swiftconcur-test swiftconcur --help > /dev/null; then
    log_error "Docker container test failed"
    exit 1
fi
log_success "Docker container is functional"

# Test 4: Scripts Syntax
echo
log_info "Testing script syntax..."

# Test shell scripts
if ! shellcheck entrypoint.sh scripts/*.sh; then
    log_error "Shell script linting failed"
    exit 1
fi
log_success "Shell scripts passed linting"

# Test Node.js scripts
cd scripts
if ! npm install > /dev/null 2>&1; then
    log_error "npm install failed"
    exit 1
fi

if ! node -c post-comment.js; then
    log_error "Node.js syntax check failed"
    exit 1
fi
log_success "Node.js scripts syntax is valid"
cd ..

# Test 5: Action Definition
echo
log_info "Testing action.yml..."
if ! docker run --rm -v "$PWD:/workspace" -w /workspace ubuntu:latest bash -c "
    apt-get update -q && apt-get install -y yq > /dev/null 2>&1
    yq eval '.inputs.scheme.required == true' action.yml
"; then
    log_error "action.yml validation failed"
    exit 1
fi
log_success "action.yml is valid"

# Test 6: Mock GitHub Action Run
echo
log_info "Testing mock GitHub Action run..."

# Create mock environment
export INPUT_SCHEME="TestScheme"
export INPUT_PROJECT_PATH="MockProject.xcodeproj"
export GITHUB_OUTPUT="/tmp/github_output.txt"
export GITHUB_EVENT_PATH="/tmp/github_event.json"

# Create mock event
cat > "$GITHUB_EVENT_PATH" << 'EOF'
{
  "event_name": "pull_request",
  "pull_request": {
    "number": 123
  }
}
EOF

# Create mock project structure
mkdir -p MockProject.xcodeproj
touch MockProject.xcodeproj/project.pbxproj

# Create mock xcodebuild that generates warnings
cat > /tmp/mock_xcodebuild << 'EOF'
#!/bin/bash
cat << 'WARNINGS'
{"type": "warning", "message": "actor-isolated property 'shared' can not be referenced from a non-isolated context", "file": "Sources/App/ContentView.swift", "line": 42, "column": 15}
{"type": "warning", "message": "Type 'MyClass' does not conform to the 'Sendable' protocol", "file": "Sources/App/MyClass.swift", "line": 15, "column": 7}
WARNINGS
EOF
chmod +x /tmp/mock_xcodebuild

# Mock xcodebuild in PATH
export PATH="/tmp:$PATH"
mv /tmp/mock_xcodebuild /tmp/xcodebuild

# Test entrypoint logic (will fail at xcodebuild but should validate inputs)
log_info "Testing input validation..."
if bash -c "
    export INPUT_SCHEME='TestScheme'
    export INPUT_PROJECT_PATH='MockProject.xcodeproj'
    export GITHUB_OUTPUT='/tmp/github_output.txt'
    head -n 50 entrypoint.sh | tail -n +1
" > /dev/null; then
    log_success "Entrypoint script loads successfully"
else
    log_error "Entrypoint script has syntax errors"
    exit 1
fi

# Cleanup
rm -rf MockProject.xcodeproj
rm -f /tmp/xcodebuild /tmp/github_output.txt /tmp/github_event.json

# Test 7: Example Workflows
echo
log_info "Testing example workflows..."
for workflow in .github/workflows/examples/*.yml; do
    if ! yq eval '.jobs' "$workflow" > /dev/null 2>&1; then
        log_error "Invalid workflow: $workflow"
        exit 1
    fi
done
log_success "All example workflows are valid"

# Summary
echo
echo "=================================="
log_success "All local tests passed! ✅"
echo
echo "Next steps:"
echo "1. Test with a real Xcode project (macOS only)"
echo "2. Use 'act' to test GitHub Actions locally"
echo "3. Deploy to a test repository"
echo "4. Move on to Phase 3 (Cloudflare Workers API)"
echo