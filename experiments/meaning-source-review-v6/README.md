# Source-only dispositions v6: agent contract 0.18 binding

This additive review artifact supersedes v5, and only for runtime binding to
agent contract 0.18 and frames 0.7, with protocol 0.5 unchanged
([ADR 0023](../../decisions/0023-imperative-frames.md)).

It carries the same items as v1–v5: the 14 review items, the source and
target bindings, the review metadata and the author provenance. Only
`contract.agent` and `contract.frames` advance.

`supersedes.previousReviewSha256` identifies the v5 bytes, and
`supersedes.originalReviewSha256` the original v1 bytes.

This migration adds no review and changes no source, gold, outcome or
interpretation. Identity 2.1 is unchanged, and no new provider calls were
made.

```sh
node scripts/research/validate-source-dispositions.mjs \
  experiments/meaning-source-review-v6/review.json
```
