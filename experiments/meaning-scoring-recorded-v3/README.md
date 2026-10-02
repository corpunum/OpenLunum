# Recorded meaning diagnostics v3: agent contract 0.14 binding

This additive manifest supersedes v2 only for offline validity replay under
agent contract 0.14. It preserves v2's package, probes, requests, candidate and
run ledgers, summary, targets, all artifact hashes, and review metadata exactly.
The protocol remains 0.4, frames 0.5, identity 2.1, and schema bytes are
unchanged. No source, gold, outcome, model output, or interpretation changed.

This is runtime-binding migration only: it adds no review, no new provider
calls, and no protected-evaluation qualification. Historical streams remain
historical evidence under their recorded contract; current checks do not
replay or qualify the extractor.

Run the existing offline scorer after the parent-owned 0.14 build:

```sh
node scripts/research/score-recorded-meaning.mjs \
  experiments/meaning-scoring-recorded-v3/input-manifest.json \
  /tmp/new-meaning-report.json
```

The report is diagnostic and self-reviewed, with unresolved targets retained.
