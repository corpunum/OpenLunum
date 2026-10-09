# Recorded meaning diagnostics v7: agent contract 0.18 binding

This additive manifest supersedes v6, and only for offline validity replay
under agent contract 0.18 and frames 0.7, with protocol 0.5 unchanged
([ADR 0023](../../decisions/0023-imperative-frames.md)).

It keeps everything from v6 (and so from v5, v4, v3 and v2) exactly as it
was:
- the package, probes and requests;
- the candidate and run ledgers and the summary;
- the targets and every artifact hash;
- the review metadata.

Frames 0.7 only relax required roles or add optional ones:
- `deploy` and `rotate` no longer require an agent;
- `deploy` gains an optional theme;
- `restart` gains an optional count.

A replay of every recorded candidate changes no identity. Identity 2.1 and
the schema bytes are unchanged. No source, gold, outcome, model output or
interpretation changed.

This is a runtime-binding migration only. It adds no review, makes no new
provider calls and gives no protected-evaluation qualification.

```sh
node scripts/research/score-recorded-meaning.mjs \
  experiments/meaning-scoring-recorded-v7/input-manifest.json \
  /tmp/new-meaning-report.json
```
