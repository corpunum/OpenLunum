# @corpunum/lunum-adapter-openunum

OpenUnum compatibility package.

## Purpose

Provides a typed OpenUnum-compatible adapter that preserves OpenUnum's current sidecar return shape while allowing Lunum to own its own semantics independently.

## Relationship

- **OpenUnum** owns its databases, retrieval systems, context budgets, safety controls, and user experience.
- **OpenLunum** owns the language, schemas, canonicalization, fingerprints, renderers, policies, evaluations, and conformance contracts.
- OpenUnum adopts Lunum through this adapter; OpenLunum never imports OpenUnum runtime code.

## Usage

```typescript
import { LunumAdapter } from '@corpunum/lunum-adapter-openunum';

const adapter = new LunumAdapter({
  // adapter configuration
});

// The adapter returns the expected OpenUnum sidecar shape
const result = await adapter.process(record);
```

## Contract

- Contract tests verify the sidecar return shape matches OpenUnum's expectations.
- Shadow-mode experiments compare adapter output against native OpenUnum processing.
- The adapter is versioned independently; breaking changes follow semantic versioning.

## Limitations

- The adapter matches the **present** OpenUnum sidecar shape; live adoption still requires product-side work when OpenUnum changes its format.
- Not all OpenUnum features are covered; unimplemented features fall back to natural text.

## Status

**Typed reference contract.** Matches present sidecar shape. Live product adoption in OpenUnum requires coordination with the OpenUnum team.
