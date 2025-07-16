#!/bin/bash

WARNING_COUNT=$1
THRESHOLD=$2

# Use GitHub API to set commit status
STATUS="success"
DESCRIPTION="No Swift concurrency warnings found"

if [ "$WARNING_COUNT" -gt 0 ]; then
    if [ -n "$THRESHOLD" ] && [ "$WARNING_COUNT" -gt "$THRESHOLD" ]; then
        STATUS="failure"
        DESCRIPTION="❌ $WARNING_COUNT warnings found (threshold: $THRESHOLD)"
    else
        STATUS="warning"
        DESCRIPTION="⚠️ $WARNING_COUNT Swift concurrency warnings found"
    fi
fi

# Set status using GitHub CLI if available
if command -v gh &> /dev/null; then
    gh api \
        --method POST \
        -H "Accept: application/vnd.github+json" \
        /repos/$GITHUB_REPOSITORY/statuses/$GITHUB_SHA \
        -f state="$STATUS" \
        -f description="$DESCRIPTION" \
        -f context="swiftconcur/warnings"
else
    echo "GitHub CLI not available, skipping status update"
fi