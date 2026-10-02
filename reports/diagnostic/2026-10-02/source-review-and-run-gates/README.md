# Source review and runner gates — diagnostic only

Baseline `dfb1b004f0a012bdc5e28307b274a743ac0e9d66`, `main`.
No external repository, runtime or model configuration was changed.

Two source-only Luna workers reviewed the 14 outstanding visible diagnostic
sources. The parent independently checked their proposals against the current
contract, rejecting generic time strings as canonical expiry/during operators.
The [sidecar](../../../../experiments/meaning-source-review-v1/review.json) binds
the original sources and targets; neither was edited or silently relabelled.

- 10 unsupported bounded representations: e06/e09/e10/e11/e13/e14/e15/g02/g07/g08.
- 2 ambiguous modalities: e19/g01.
- 2 plausible source-relative options pending native review: g04/g05.
- Both options pass current wire, structure, protocol, frames, identity and
  digit-retention gates, but remain unpromoted with evidence confidence zero.
- **All 14 remain unresolved for historical meaning scoring.** No overall
  meaning accuracy or protected/native/human certification is claimed.

The third read-only Luna worker audited the runner and its subsequent changes.
Parent review distinguishes paired semantic validation errors (observed parser
failures/retries) from corrupt or unverifiable event/source provenance.
The runner now requires source/package/model/budget/timeout choices for live
mode, serial budget reservations, complete artifact/dependency binding and an
actual MCP receipt before launch. It records partial progress durably and
rejects missing model/cost/contract data, malformed/contradictory events,
source/language drift, timeout and interrupted processes. Historical replays
are diagnostic-only and cannot overwrite previous evidence.

`mcp-preflight.json` preserves the earlier development preflight;
`mcp-preflight-final.json` preserves the final development preflight. Each
records 13 matching artifact checks plus the AJV/lockfile check and the actual
matching MCP contract response, with **zero extraction-provider calls**. Both
truthfully record the baseline commit and dirty development tree; they are
not qualified live-model evidence or an exact-commit extraction run. Their
runner/gate hashes distinguish the revisions. The public receipts contain no
model response and no private reasoning. `source-dispositions.json` is generated
by the source-bound validator.

Verification commands:

```sh
node --test scripts/research/source-only-run-gates.test.mjs scripts/research/validate-source-dispositions.test.mjs
node scripts/research/validate-source-dispositions.mjs experiments/meaning-source-review-v1/review.json
node scripts/research/run-claude-code-source-only.mjs .git/new-preflight --preflight-only
pnpm verify
git diff --check
```

The 15 new regression tests deliberately mutate dependencies, contract fields,
source/hash/language bindings, event pairing/order, model/cost/exit/timeout,
source review metadata and representation options. Local fake subprocesses
test durable capture, interruption, explicit reasoning removal and split UTF-8
Greek output; none is evidence of actual provider behavior. Exact-commit full
verification and publication status are recorded in the commit handoff/CI.

**NOT READY.** Still missing independent/native source adjudication and fresh
frozen protocol-conforming gold, followed by live extraction and raw-text
retrieval under an agreed model and budget. The latest core transport contract
has not been live-qualified. The review cannot clear that gate by changing
labels, broadening aliases, dropping restrictions or calling tests accuracy.
