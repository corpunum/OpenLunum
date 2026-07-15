# Roadmap

## Milestone 0 — repository foundation (current)

- Preserve complete research handover and provenance.
- Establish Lunum-I naming, architecture, draft schemas, and evidence ledger.
- Provide a dependency-oriented OpenUnum adoption profile.
- Ship a conservative reference core and CLI with tests.

## Milestone 1 — semantic contract

- Finalize clause, role, reference, modality, condition, time, provenance, and uncertainty structures.
- Publish JSON Schema conformance fixtures and canonical serialization rules.
- Specify forward/backward compatibility and fingerprint migration.
- Separate semantic validation from product policy.

## Milestone 2 — multilingual canonicalization

- Build evaluated parsers/adapters for at least English and Greek, then Spanish and Indonesian.
- Create paraphrase-equivalence and collision datasets.
- Measure exact-match, structural-match, and human-reviewed semantic retention.
- Refuse unsupported or low-confidence mappings rather than fabricate certainty.

## Milestone 3 — renderer profiles

- Implement safe, short, and tight renderers.
- Build tokenizer adapters and a Token Atlas pipeline.
- Record model/tokenizer/version, prompt scaffold, context counts, quality, and failures.
- Add profile negotiation and natural fallback.

## Milestone 4 — adoption SDK

- Stabilize `@corpunum/lunum` APIs.
- Add MCP server and generic lifecycle-hook adapters.
- Add backfill/migration utilities and conformance reports.
- Validate the OpenUnum dependency integration in shadow mode.

## Milestone 5 — guarded product deployment

- Run real-session shadow comparisons.
- Gate mixed context by quality, safety, latency, and cost.
- Enable selected low-risk categories.
- Build rollback and schema migration tooling.

## Milestone 6 — cross-product verification

- Verify at least three independent adoption paths: library, hooks/plugin, MCP/sidecar.
- Promote product guides from Design to Prototype or Verified only with reproducible tests.
- Publish a compatibility matrix tied to product and Lunum versions.

## Research horizon

- Near-semantic fingerprints and graph retrieval.
- Inter-agent plan and evidence transport.
- Binary/storage representations that remain separate from model-facing text.
- Lunum-native fine-tuning after the language stabilizes.
- Adaptive renderers selected by measured model behavior.
