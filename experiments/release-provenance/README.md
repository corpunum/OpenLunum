# Release Provenance and Signed Artifacts

This experiment implements release provenance tracking and signed artifacts functionality for the OpenLunum project.

## Implementation

The implementation includes:

1. **Release Manifest Creation**: Functions to create manifests that track release artifacts
2. **Signing and Verification**: Methods to sign release manifests with private keys and verify them with public keys
3. **Metadata Collection**: Functions to collect current commit and version information
4. **Core Integration**: Integration with the core package to make the functionality available

## Files Created

- `packages/core/src/release-provenance.ts` - Main implementation
- `packages/core/test/release-provenance.test.ts` - Tests for the functionality
- `packages/core/README.md` - Documentation for the module

## Features

### Release Manifest

The system creates release manifests containing:
- Version information
- Git commit hash
- Timestamp
- Artifact hash (computed from files)
- List of included files
- Signatures (when applicable)

### Signing and Verification

- Supports signing manifests with private keys
- Supports verifying signed manifests with public keys
- Uses RSA-SHA256 for cryptographic signing

## Usage

```typescript
import { 
  createReleaseManifest,
  signReleaseManifest,
  verifyReleaseManifest 
} from '@corpunum/lunum';

// Create manifest
const manifest = createReleaseManifest('1.0.0', 'abc123', ['file1.js', 'file2.js']);

// Sign manifest (requires private key)
const signedManifest = signReleaseManifest(manifest, privateKey);

// Verify signature (requires public key)
const isValid = verifyReleaseManifest(signedManifest, publicKey);
```

## Testing

The implementation includes comprehensive tests ensuring:
- Manifest creation works correctly
- Version and commit information can be retrieved
- Functions are properly exported from the core package
- The module can be imported without errors