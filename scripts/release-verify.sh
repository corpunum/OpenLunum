#!/bin/bash
# Release verification script for OpenLunum

set -e

echo "Starting OpenLunum release verification process..."

# Check if manifest file exists
if [ ! -f "release-manifest.json" ]; then
    echo "Error: Release manifest not found."
    exit 1
fi

echo "Verifying manifest integrity..."

# Verify signature if it exists
if [ -f "release-manifest.json.asc" ]; then
    echo "Verifying signature..."
    if gpg --verify release-manifest.json.asc release-manifest.json; then
        echo "Signature verification successful"
    else
        echo "Error: Signature verification failed"
        exit 1
    fi
else
    echo "Warning: No signature found to verify"
fi

# Validate manifest content
echo "Validating manifest content..."
if jq -e . release-manifest.json > /dev/null 2>&1; then
    echo "Manifest is valid JSON"
    VERSION=$(jq -r '.version' release-manifest.json)
    COMMIT=$(jq -r '.commit' release-manifest.json)
    TIMESTAMP=$(jq -r '.timestamp' release-manifest.json)
    echo "Version: $VERSION"
    echo "Commit: $COMMIT"
    echo "Timestamp: $TIMESTAMP"
else
    echo "Error: Manifest is not valid JSON"
    exit 1
fi

echo "Release verification completed successfully"