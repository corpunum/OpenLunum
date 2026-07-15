# Instructions for coding agents

OpenLunum is the source of truth for Lunum. Treat evidence, compatibility, and semantic safety as product requirements.

## Architecture boundaries

- `packages/core` must not import anything from `integrations/`.
- Product-specific field names and persistence assumptions belong in adapters.
- Never claim a surface-text heuristic is language-independent semantics.
- Never remove natural source text or exact evidence from fixtures or examples.
- Fingerprint changes require a schema/canonicalization version change and migration note.
- Renderer changes require tokenizer and comprehension measurements.

## Change procedure

1. Identify whether the change affects semantics, canonicalization, fingerprinting, rendering, policy, or an integration.
2. Update the relevant schema or registry before implementation where applicable.
3. Add conformance and regression tests.
4. Record evidence and limitations honestly.
5. For integration changes, update the tested product version and status.
6. Run `pnpm test` and `pnpm eval:static`.

## OpenUnum

Read `integrations/openunum/AGENTS.md` before proposing OpenUnum changes. OpenUnum consumes Lunum; do not move OpenUnum runtime logic into the core package.
