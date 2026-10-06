# Source-only dispositions v3: agent contract 0.15 binding

This additive review artifact supersedes v2 only for runtime binding to agent
contract 0.15 ([ADR 0019](../../decisions/0019-month-name-date-retention.md)).
It carries the same 14 review items, source/target bindings, review metadata
and author provenance as v1 and v2. Only `contract.agent` is advanced.
`supersedes.previousReviewSha256` identifies the v2 bytes and
`supersedes.originalReviewSha256` the original v1 bytes. This migration adds
no review and changes no source, gold, outcome, or interpretation.

Protocol 0.4, frames 0.5, and identity 2.1 remain unchanged. The two
representation options remain pending native review; they are not certified
gold, protected evaluation, or qualification evidence. No new provider calls
were made. No qualification claim is made.

```sh
node scripts/research/validate-source-dispositions.mjs \
  experiments/meaning-source-review-v3/review.json
```

Validation binds the same historical targets and checks current runtime gates.
It does not mechanically establish natural-language completeness or replace
human/native-speaker adjudication.
