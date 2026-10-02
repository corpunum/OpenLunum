# Source-only Claude Code runner

This is an evaluation client, not a provider in the semantic core. It preserves
the existing public prompt/conventions. It does not qualify Claude Code,
Sonnet, any language, or the parser by deterministic tests alone.

Run an actual local MCP handshake without provider calls:

```sh
node scripts/research/run-claude-code-source-only.mjs .git/my-new-preflight --preflight-only
```

Live mode requires a frozen clean checkout and explicit source-only requests,
an exact resolved model ID, an owner-approved total budget, a requested item
ceiling, and a timeout. First run a one-item pilot. Example placeholders below
are not authorization to launch a provider:

```sh
node scripts/research/run-claude-code-source-only.mjs .git/my-new-run \
  --requests path/to/frozen-source-only.jsonl --package path/to/frozen-package.json \
  --model EXACT_REPORTED_CLAUDE_MODEL_ID \
  --total-budget-usd APPROVED_TOTAL --item-budget-usd ITEM_CEILING \
  --timeout-ms 300000 --limit 1
```

Concurrency is one. Item ceilings for all selected requests are reserved before
launch and must sum to at most the total. `--max-budget-usd` is a **requested CLI
ceiling**, not a provider-side financial guarantee. Unknown cost or reported
overrun stops remaining launches and invalidates the run. Do not promise a
hard dollar cap the provider does not enforce. All selected rows, including
not-run rows, remain in the denominator/run ledger.

Preflight defaults to v16 and its declared iteration6 profile; live requires an
explicit package. Resolved IDs use the `claude-*` form and must exactly match
both reported usage IDs and the init event; this is not a model-weight hash or
a claim that the provider exposes immutable weights. All frozen
served artifacts, task/scorer/profile, AJV version and lockfile are checked
before and after execution. V16 binds contract0.14's date/evidence retention
gate and the same closed inventory of every
repository-owned JavaScript file under the served core/MCP trees. An added,
missing, changed or symlinked artifact invalidates that binding. V14's selected
files are legacy/partial; v15's complete older runtime binding is also historical
and cannot certify the changed contract0.14 runtime. Neither passes the current
live gate. This is not
operating-system or dependency supply-chain attestation; installed AJV version
and the dependency lockfile remain separate checks. The actual MCP contract receipt is checked before
provider launch; each provider session must also return a matching contract.
Missing identity, nonzero exit, interrupted/timeout processes, mismatched
sources, malformed/conflicting tool events, and missing costs fail evidence
gates. Canonical parser errors are observations, not independent trust evidence.

Outputs use an exclusively new directory. The exact source, prompt/hash,
requested model, client version, requested budget and timeout are written
before each launch. Complete JSON stream events are flushed during execution;
explicit provider thinking/reasoning blocks are removed and not parsed or
stored. Non-JSON/incomplete lines are represented by hash and byte count rather
than arbitrary prose. These public events are **not** advertised as a byte-exact
private-reasoning transcript. Atomic progress and per-item checkpoints survive
partial runs. An abrupt kill cannot yield a valid final summary; process-group
termination is used on handled interruption/timeouts. Stderr is a local replay
artifact and must be checked for secrets/paths before publication.

Historical rederivation is offline and explicitly non-comparable. It emits
`diagnostic-candidates.jsonl`, not a scoring candidate ledger, and references
the original raw streams rather than nonexistent copies. It cannot
overwrite the old run or certify its exit code, cost, client or invocation:

```sh
node scripts/research/run-claude-code-source-only.mjs .git/my-new-replay \
  --rederive --from path/to/old-run --requests path/to/old-requests.jsonl \
  --package path/to/old-package.json --profile path/to/old-profile.json
```

No targets, expected outcomes, semantic groups or review data may be included
in source-only request rows. The runner does not certify that a source set is
protected, independently authored, human-reviewed, or semantically complete.
Freeze and validate those artifacts separately before making quality claims.
