# Recorded meaning diagnostics v8: agent contract 0.19 binding

This additive manifest supersedes v7, and only for offline validity replay
under agent contract 0.19, protocol 0.6 and frames 0.8
([ADR 0024](../../decisions/0024-general-source-bound-frames.md)).

It keeps everything from v7 (and so from v6 down to v2) exactly as it was:
- the package, probes and requests;
- the candidate and run ledgers and the summary;
- the targets and every artifact hash;
- the review metadata.

Protocol 0.6 adds seven predicates and four roles, and frames 0.8 adds their
frames. The source-bound check applies only to a candidate that uses one of
them. A replay of every recorded candidate changes no identity. Identity 2.1
and the schema bytes are unchanged. No source, gold, outcome, model output or
interpretation changed.

This is a runtime-binding migration only. It adds no review, makes no new
provider calls and gives no protected-evaluation qualification.

```sh
node scripts/research/score-recorded-meaning.mjs \
  experiments/meaning-scoring-recorded-v8/input-manifest.json \
  /tmp/new-meaning-report.json
```
