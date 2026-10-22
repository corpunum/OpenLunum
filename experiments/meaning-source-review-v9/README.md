# Source-only dispositions v9: agent contract 0.22 binding

This additive review artifact supersedes v8. Its only purpose is runtime binding to agent contract 0.22 ([decisions/0031](../../decisions/0031-mood-renderer-and-imperative-frames.md)). Protocol 0.7, frames 0.9 and identity 2.1 are unchanged.

It carries the same items as v1–v8:
- the 14 review items;
- the source and target bindings;
- the review metadata and the author provenance.

Only `contract.agent` changes. `supersedes.previousReviewSha256` identifies the v8 bytes, and `supersedes.originalReviewSha256` identifies the original v1 bytes.

The migration adds no review and changes no source, gold, outcome or interpretation. No provider calls were made.

```sh
node scripts/research/validate-source-dispositions.mjs \
  experiments/meaning-source-review-v9/review.json
```
