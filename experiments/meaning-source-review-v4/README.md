# Source-only dispositions v4: agent contract 0.16 binding

This additive review artifact supersedes v3 only for runtime binding to agent
contract 0.16 ([ADR 0020](../../decisions/0020-number-words-and-relative-times.md)).
It carries the same 14 review items, source/target bindings, review metadata
and author provenance as v1, v2 and v3. Only `contract.agent` is advanced.
`supersedes.previousReviewSha256` identifies the v3 bytes and
`supersedes.originalReviewSha256` the original v1 bytes. This migration adds
no review and changes no source, gold, outcome, or interpretation.

Protocol 0.4, frames 0.5, and identity 2.1 remain unchanged. The two
representation options remain pending native review; they are not certified
gold, protected evaluation, or qualification evidence. No new provider calls
were made. No qualification claim is made.

```sh
node scripts/research/validate-source-dispositions.mjs \
  experiments/meaning-source-review-v4/review.json
```

Validation binds the same historical targets and checks current runtime gates.
It does not mechanically establish natural-language completeness or replace
human/native-speaker adjudication.
