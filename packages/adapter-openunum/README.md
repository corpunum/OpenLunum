# @corpunum/lunum-openunum

OpenUnum compatibility package.

## Purpose

Provides a typed OpenUnum-compatible adapter that preserves OpenUnum's current sidecar return shape while allowing Lunum to own its own semantics independently.

## Relationship

- **OpenUnum** owns its databases, retrieval systems, context budgets, safety controls, and user experience.
- **OpenLunum** owns the language, schemas, canonicalization, fingerprints, renderers, policies, evaluations, and conformance contracts.
- This package is an intended compatibility path, not proof that OpenUnum has deployed it. OpenLunum never imports OpenUnum runtime code.

## Inspect the contract

The workspace package name is `@corpunum/lunum-openunum`. Read [src/index.ts](src/index.ts) and the tests for the supported typed surface. This package does not run OpenUnum and is not required for the [product-neutral core demo](../../examples/structured-record-demo.mjs).

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
