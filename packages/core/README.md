# Lunum Core

The core package contains the fundamental building blocks for Lunum semantics and related utilities.

## Features

### Release Provenance

This package includes functionality for tracking release artifacts and creating signed manifests to verify the integrity and origin of released packages.

The release-provenance module provides:

- `createReleaseManifest()` - Creates a manifest of release artifacts
- `signReleaseManifest()` - Signs a release manifest with a private key
- `verifyReleaseManifest()` - Verifies a signed release manifest with a public key
- `getCurrentCommit()` - Gets the current git commit hash
- `getCurrentVersion()` - Gets the current package version

### Usage Example

```typescript
import { 
  createReleaseManifest,
  signReleaseManifest,
  verifyReleaseManifest 
} from '@corpunum/lunum';

// Create a release manifest
const manifest = createReleaseManifest(
  '1.0.0', 
  'abc123def456', 
  ['dist/index.js', 'dist/types.d.ts']
);

// Sign the manifest
const signedManifest = signReleaseManifest(manifest, privateKey);

// Verify the signature
const isValid = verifyReleaseManifest(signedManifest, publicKey);
```

### API Reference

#### `createReleaseManifest(version, commit, files)`

Creates a release manifest for a given version, commit, and list of files.

- `version` (string): The release version
- `commit` (string): The git commit hash
- `files` (string[]): List of files included in this release

Returns: `ReleaseManifest`

#### `signReleaseManifest(manifest, privateKey)`

Signs a release manifest with a private key.

- `manifest` (ReleaseManifest): The manifest to sign
- `privateKey` (string): The private key to sign with

Returns: `ReleaseManifest` with signature

#### `verifyReleaseManifest(manifest, publicKey)`

Verifies a signed release manifest with a public key.

- `manifest` (ReleaseManifest): The signed manifest to verify
- `publicKey` (string): The public key to verify with

Returns: `boolean` indicating if the signature is valid

#### `getCurrentCommit()`

Gets the current git commit hash.

Returns: `string`

#### `getCurrentVersion()`

Gets the current package version.

Returns: `string`