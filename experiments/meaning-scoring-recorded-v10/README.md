# Recorded meaning diagnostics v10: agent contract 0.22 binding

This additive manifest supersedes v9. Its only purpose is offline validity replay under agent contract 0.22 ([decisions/0031](../../decisions/0031-mood-renderer-and-imperative-frames.md)). Protocol 0.7, frames 0.9, identity 2.1 and the schema bytes are unchanged.

Everything else is kept from v9, and so from v8 down to v2: the package, probes and requests; the candidate and run ledgers, and the summary; the targets and every artifact hash; the review metadata.

Contract 0.22 changes the contract text for imperatives (kind `instruction`, no subject, the imperative verb alone in `action`, what it governs whole in `object`) and the wording of one refusal message. Core's checks and the builder are unchanged, so no recorded identity can move.

This is a runtime-binding migration only. It adds no review, makes no new provider calls and gives no protected-evaluation qualification.

```sh
node scripts/research/score-recorded-meaning.mjs \
  experiments/meaning-scoring-recorded-v10/input-manifest.json \
  /tmp/new-meaning-report.json
```
