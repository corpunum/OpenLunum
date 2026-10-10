# general-frames-v1: replay of recorded candidates

Status: self-reviewed by the Claude Code agent (model `claude-opus-5-5`); not
pre-registered. This is a regression check for
[ADR 0024](../../decisions/0024-general-source-bound-frames.md), not a yield
claim.

Method: every candidate Sem recorded in a `*.jsonl` ledger under `experiments/`
and `reports/` whose source text can be recovered (from the requests, or from
probe files) is submitted through `submitCandidate` built from `origin/main`
(contract 0.18) and from this change (contract 0.19). Distinct
(source, candidate) pairs only.

```sh
node experiments/general-frames-v1/replay-recorded-candidates.mjs \
  packages/core/dist <path to origin/main packages/core/dist>
```

| Quantity | Value |
| --- | --- |
| Distinct recorded candidates | 393 |
| Replayed (source recovered) | 391 |
| No source recoverable | 2 |
| Identities, contract 0.18 | 302 |
| Identities, contract 0.19 | 302 |
| Withdrawn | 0 |
| Gained | 0 |
| Changed | 0 |

No recorded candidate uses a general predicate, so the source-bound check is
never reached by this corpus. The check that existing frames are unaffected is
therefore the point of this table; the unit tests in
`packages/core/test/general-frames.test.ts` cover the new frames and the gate.

Yield of the new frames on real text (a proposing model, then this core) is
measured in the downstream site integration and is not claimed here.
