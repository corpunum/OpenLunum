# Recorded meaning diagnostics v6: agent contract 0.17 binding

This additive manifest supersedes v5 only for offline validity replay under
agent contract 0.17, protocol 0.5 and frames 0.6
([ADR 0022](../../decisions/0022-inclusive-bound-predicates.md)). It preserves
v5's (and v4's, v3's and v2's) package, probes, requests, candidate and run
ledgers, summary, targets, all artifact hashes, and review metadata exactly.
Protocol 0.5 and frames 0.6 only add `at_most`/`at_least`; no recorded
candidate uses them. Identity 2.1 and schema bytes are unchanged. No source,
gold, outcome, model output, or interpretation changed.

This is runtime-binding migration only: it adds no review, no new provider
calls, and no protected-evaluation qualification.

```sh
node scripts/research/score-recorded-meaning.mjs \
  experiments/meaning-scoring-recorded-v6/input-manifest.json \
  /tmp/new-meaning-report.json
```
