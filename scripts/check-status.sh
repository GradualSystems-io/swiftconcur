#!/bin/bash

WARNING_COUNT=$1
WARN_THRESHOLD=$2
FAIL_THRESHOLD=$3

# Determine status and description
STATUS="success"
DESCRIPTION="No Swift concurrency warnings found"

if [ "$WARNING_COUNT" -gt 0 ]; then
    if [ -n "$FAIL_THRESHOLD" ] && [ "$WARNING_COUNT" -gt "$FAIL_THRESHOLD" ]; then
        STATUS="failure"
        DESCRIPTION="❌ $WARNING_COUNT warnings found (fail threshold: $FAIL_THRESHOLD)"
    elif [ -n "$WARN_THRESHOLD" ] && [ "$WARNING_COUNT" -gt "$WARN_THRESHOLD" ]; then
        # GitHub commit statuses don't support a 'warning' state; use success with warning text
        STATUS="success"
        DESCRIPTION="⚠️ $WARNING_COUNT Swift concurrency warnings exceed warn threshold ($WARN_THRESHOLD)"
    else
        STATUS="success"
        DESCRIPTION="⚠️ $WARNING_COUNT Swift concurrency warnings found"
    fi
fi

# Set status using GitHub CLI if available, else fallback to curl
if command -v gh &> /dev/null; then
    gh api \
        --method POST \
        -H "Accept: application/vnd.github+json" \
        /repos/$GITHUB_REPOSITORY/statuses/$GITHUB_SHA \
        -f state="$STATUS" \
        -f description="$DESCRIPTION" \
        -f context="swiftconcur/warnings"
else
    if [ -z "$GITHUB_TOKEN" ]; then
        echo "GITHUB_TOKEN not available, skipping status update"
        exit 0
    fi
    curl -sS -X POST \
        -H "Accept: application/vnd.github+json" \
        -H "Authorization: Bearer $GITHUB_TOKEN" \
        "https://api.github.com/repos/$GITHUB_REPOSITORY/statuses/$GITHUB_SHA" \
        -d "{\"state\":\"$STATUS\",\"description\":\"$DESCRIPTION\",\"context\":\"swiftconcur/warnings\"}"
fi
