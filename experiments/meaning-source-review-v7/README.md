# Source-only dispositions v7: agent contract 0.19 binding

This additive review artifact supersedes v6, and only for runtime binding to
agent contract 0.19, protocol 0.6 and frames 0.8
([ADR 0024](../../decisions/0024-general-source-bound-frames.md)).

It carries the same items as v1-v6: the 14 review items, the source and
target bindings, the review metadata and the author provenance. Only
`contract.agent`, `contract.protocol` and `contract.frames` advance.

`supersedes.previousReviewSha256` identifies the v6 bytes, and
`supersedes.originalReviewSha256` the original v1 bytes.

This migration adds no review and changes no source, gold, outcome or
interpretation. Identity 2.1 is unchanged, and no new provider calls were
made.

```sh
node scripts/research/validate-source-dispositions.mjs \
  experiments/meaning-source-review-v7/review.json
```
