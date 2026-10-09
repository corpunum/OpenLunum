# Source-only dispositions v5: agent contract 0.17 binding

This additive review artifact supersedes v4 only for runtime binding to agent
contract 0.17, protocol 0.5 and frames 0.6
([ADR 0022](../../decisions/0022-inclusive-bound-predicates.md)). It carries the
same 14 review items, source/target bindings, review metadata and author
provenance as v1–v4. Only `contract.agent`, `contract.protocol` and
`contract.frames` are advanced. `supersedes.previousReviewSha256` identifies
the v4 bytes and `supersedes.originalReviewSha256` the original v1 bytes. This
migration adds no review and changes no source, gold, outcome, or
interpretation. Identity 2.1 is unchanged. No new provider calls were made.

```sh
node scripts/research/validate-source-dispositions.mjs \
  experiments/meaning-source-review-v5/review.json
```
