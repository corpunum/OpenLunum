# Source-only dispositions v8: agent contract 0.21 binding

This additive review artifact supersedes v7. Its only purpose is runtime binding to agent contract 0.21, protocol 0.7 and frames 0.9 ([A3, experiments/coverage-a3-v1](../coverage-a3-v1/PREREGISTRATION.md)).

It carries the same items as v1–v7:
- the 14 review items;
- the source and target bindings;
- the review metadata and the author provenance.

Only `contract.agent`, `contract.protocol` and `contract.frames` change. `supersedes.previousReviewSha256` identifies the v7 bytes, and `supersedes.originalReviewSha256` identifies the original v1 bytes.

The migration adds no review and changes no source, gold, outcome or interpretation. Identity 2.1 is unchanged. No provider calls were made.

```sh
node scripts/research/validate-source-dispositions.mjs \
  experiments/meaning-source-review-v8/review.json
```
