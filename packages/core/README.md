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

### Token Atlas

The Token Atlas measures token counts for Lunum rendering profiles across multiple models, producing aggregate statistics and per-model analysis.

```typescript
import { TokenAtlas } from '@corpunum/lunum';

// Create an atlas with at least 3 named models
const atlas = new TokenAtlas([
  { name: 'llama3.1-8b', tokenizer: { model: 'llama3.1', addBos: true, addEos: true } },
  { name: 'qwen2.5-7b',  tokenizer: { model: 'qwen2.5', addBos: true, addEos: true } },
  { name: 'mistral-7b',  tokenizer: { model: 'mistral', addBos: true, addEos: true } }
]);

// Measure one or more records
const entry = atlas.measure(record);
const entries = atlas.measureBatch(records);

// Generate a report
const report = atlas.report({ title: 'Token Atlas Report' });
```

### Profile Selector

The Profile Selector recommends the best renderer profile per model based on Token Atlas measurements.

```typescript
import { ProfileSelector } from '@corpunum/lunum';

const selector = new ProfileSelector(atlas);
const profile = selector.select(model, record);
```

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

#### Token Atlas API

- `new TokenAtlas(models: ModelConfig[]): TokenAtlas` - Creates a token measurement atlas with at least 3 models
- `atlas.measure(record: LunumRecord): TokenAtlasEntry` - Measures a single record
- `atlas.measureBatch(records: LunumRecord[]): TokenAtlasEntry[]` - Measures multiple records
- `atlas.report(options: ReportOptions): AtlasReport` - Generates a measurement report
- `TokenAtlas.withCommonModels()` - Factory for pre-configured common models

#### Profile Selector API

- `new ProfileSelector(atlas: TokenAtlas): ProfileSelector` - Creates a profile selector from a token atlas
- `selector.select(model: string, record: LunumRecord): string` - Selects the best profile for a model and record

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

## New in v0.2.0

- **Token Atlas:** Cross-model, cross-profile token measurement framework with aggregate statistics.
- **Profile Selector:** Renderer profile selection driven by Token Atlas measurements.