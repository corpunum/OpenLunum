# OpenLunum Core

This package contains the core functionality for the OpenLunum project including release provenance and artifact signing.

## Release Provenance

The release provenance system ensures that all released artifacts can be traced back to their source commit, build environment, and verification status. This includes:

1. Commit hash tracking
2. Build environment metadata
3. Artifact integrity verification
4. Digital signature verification

## API

### `createReleaseManifest(version, artifactPaths)`

Creates a release manifest containing:
- Version identifier
- Git commit hash
- Build timestamp
- Artifact checksums

### `calculateFileChecksum(filePath)`

Calculates SHA-256 checksum for a file.

### `getGitCommitHash()`

Gets the current git commit hash.

### `signReleaseManifest(manifest, outputPath)`

Creates a signed release manifest (in a real implementation, this would use GPG).

### `verifyReleaseManifestSignature(manifestPath, signaturePath)`

Verifies the signature of a release manifest.