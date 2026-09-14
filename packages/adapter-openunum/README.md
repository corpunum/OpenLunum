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
import {
  ShadowModeAdapter,
  deriveLunumSidecar,
  compileLunumShadowContext
} from '@corpunum/lunum-adapter-openunum';

const sidecar = deriveLunumSidecar(record);
const context = compileLunumShadowContext([record], { profile: 'safe' });
const shadow = new ShadowModeAdapter({ enabled: true, compareWithProduction: true });
const comparison = shadow.process(record, candidateSem);
```

## Contract

- Contract tests verify the sidecar return shape expected by the current compatibility contract.
- Shadow mode compares a candidate against an existing OpenLunum record using core canonical fingerprints and comparison.
- The adapter is versioned independently; breaking changes follow semantic versioning.

## Limitations

- This package does not import or run OpenUnum code and has no live OpenUnum integration.
- It matches the **present** sidecar contract; adoption still requires product-side work when OpenUnum changes its format.
- Not all OpenUnum features are covered; unimplemented features fall back to natural text.

## Status

**Typed reference contract.** Matches present sidecar shape. Live product adoption in OpenUnum requires coordination with the OpenUnum team.
