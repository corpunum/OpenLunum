#!/bin/bash
# Release signing script for OpenLunum

set -e

echo "Starting OpenLunum release signing process..."

# Check if we have a tag
if [ -z "$GITHUB_REF" ] && [ -z "$TAG_NAME" ]; then
    echo "Error: No release tag found. This script should be run during a release."
    exit 1
fi

# Get the current commit hash
COMMIT_HASH=$(git rev-parse HEAD)
echo "Current commit: $COMMIT_HASH"

# Create release manifest
MANIFEST_FILE="release-manifest.json"
echo "{
  \"version\": \"${TAG_NAME}\",
  \"commit\": \"$COMMIT_HASH\",
  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
  \"artifacts\": []
}" > "$MANIFEST_FILE"

# Calculate checksums for all packages
echo "Calculating checksums..."
for package in packages/*; do
    if [ -d "$package" ]; then
        PACKAGE_NAME=$(basename "$package")
        echo "  $PACKAGE_NAME:"
        # Create a zip of the package contents for signing
        tar -czf "${PACKAGE_NAME}.tar.gz" -C "$package" .
        CHECKSUM=$(sha256sum "${PACKAGE_NAME}.tar.gz" | cut -d' ' -f1)
        echo "    Checksum: $CHECKSUM"
        # Add to manifest
        sed -i "s/\"artifacts\": \[\]/\"artifacts\": [ { \"name\": \"$PACKAGE_NAME\", \"checksum\": \"$CHECKSUM\", \"path\": \"${PACKAGE_NAME}.tar.gz\" } ]/" "$MANIFEST_FILE"
    fi
done

# Sign the manifest (this would require proper GPG setup in CI)
echo "Signing manifest..."
if command -v gpg &> /dev/null; then
    gpg --detach-sign --armor "$MANIFEST_FILE"
    echo "Manifest signed successfully"
else
    echo "Warning: GPG not available, skipping signature"
fi

echo "Release signing process completed"