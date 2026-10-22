# Recorded meaning diagnostics v9: agent contract 0.21 binding

This additive manifest supersedes v8. Its only purpose is offline validity replay under agent contract 0.21, protocol 0.7 and frames 0.9 ([A3, experiments/coverage-a3-v1](../coverage-a3-v1/PREREGISTRATION.md)).

Everything else is kept from v8, and so from v7 down to v2:
- the package, probes and requests;
- the candidate and run ledgers, and the summary;
- the targets and every artifact hash;
- the review metadata.

Protocol 0.7 adds one kind, `question`. Frames 0.9 change only the description of `topic`. Contract 0.21 changes three things:
- the builder writes a bare string on `assert.action` as a text term;
- a whole question can no longer be filed as a `topic`;
- `I`, `you` and `we` are valid fillers of a general frame.

A replay of every recorded Sem leaves every identity unchanged. Identity 2.1 and the schema bytes are unchanged.

This is a runtime-binding migration only. It adds no review, makes no new provider calls and gives no protected-evaluation qualification.

```sh
node scripts/research/score-recorded-meaning.mjs \
  experiments/meaning-scoring-recorded-v9/input-manifest.json \
  /tmp/new-meaning-report.json
```
