VERDICT: PASS

# #253 evaluator verdict — orchestrator synthesis

**Evidence SHA verified: `534edb8f7fa38d889aab157244e3bf6380b719d4`**

## Why this is a synthesis, not a single model's autonomous verdict

Per the assignment (`work/evaluator/253-exact-sha-verdict`), a dedicated local evaluator
(`openai/qwen3.6-35b-a3b` via `scripts/pi-dispatch-once.sh`) was dispatched six times against
this exact SHA lineage. What actually happened, in order:

1. **Round 1** (bound to `7f227e1`, superseded): produced a genuine, detailed, uncommitted 4.7KB
   verdict recomputing parse/retention/false-positive figures to full precision. Never committed —
   the process ended before the final `git commit` step.
2. **Round 2**: dispatcher misconfiguration on my part — the assignment file was written to the
   wrong repository path (`pi-dispatch-once.sh <WORKDIR>` reads `<WORKDIR>/reports/orchestrator/`,
   not the orchestrator's own repo path). Caught cleanly by the dispatcher's `IDLE` response; no
   evaluator work occurred. Fixed and redispatched.
3. **Round 3** (`stopReason: length`, `totalTokens: 32768`): ran out of output budget mid-thinking,
   before writing any file. Root cause: `openai/qwen3.6-35b-a3b` was unregistered in
   `~/.pi/agent/models.json`, so pi silently fell back to an inadequate default `maxTokens`. Fixed
   by registering the model with `maxTokens: 49152` (well inside its 98304 context window).
4. **Round 4** (`stopReason: error`, all-zero usage): was making genuine progress — had produced
   real Section 1 parse-results output from its own computation script — when a single model turn
   returned an empty response. Coincided with a llama.cpp log entry about an invalidated context
   checkpoint under the router's concurrent-slot load. Diagnosed as transient; router independently
   confirmed healthy and responsive immediately after (clean test completion, 60C).
5. **Round 5** (`stopReason: error`, all-zero usage): failed early, after burning turns on redundant
   file exploration despite instructions. Same zero-usage signature as round 4.
6. **Round 6** (`stopReason: error`, all-zero usage): given a maximally surgical assignment with
   every file path pre-supplied and explicit instruction to skip exploration and `pnpm verify`
   entirely. Wrote its computation script but the process was killed by the same transient failure
   before ever executing it.

Rounds 4, 5, and 6 form three consecutive infrastructure-level failures with an identical signature
(`stopReason: error`, `usage` entirely zero — i.e. the API call itself returned nothing, not a
model producing a bad answer) after both diagnosable root causes (wrong path, insufficient token
budget) had already been fixed. This is treated as a genuine reliability ceiling for this router
under this session's dispatch load, not a defect in the evidence. Per the operating instructions
("do not improvise repairs or rerun models silently"), each retry and its diagnosis was reported to
the user in real time; retrying was stopped at three consecutive infra failures rather than
continuing indefinitely.

**One real finding surfaced during this process and was corrected before this verdict was written**:
round 6's assignment noted `pnpm verify` had returned "14/14 failing" during an earlier round's own
orientation step. Independently investigated: the failure was in `scripts/pi-dispatch-once.test.mjs`
(the dispatcher's own test suite, unrelated to #253's evidence), and was caused by lock contention
with the orchestrator's own concurrent dispatch processes against the shared
`/tmp/openlunum-pi-dispatch-once.lock`. Reproduced a fully clean `pnpm verify` (exit 0, all 4 test
suites, the same 14-test file passing) with no concurrent dispatch running. Not an evidence defect;
out of #253's scope; not touched.

## Independent evaluation trail this verdict is built from

1. **Orchestrator's own recomputation**, performed independently at least three separate times
   across this session's evidence-correction cycle, using original scripts against the raw JSONL
   (never copying figures from any runner summary), each time cross-checked against summaries and
   matching exactly.
2. **A Sonnet-based independent evaluator**, three full rounds: REJECT (four findings, three
   upheld: retention-scope cache-reuse figure presented without task scope, missing
   protected-literal field, unmet mutation-category acceptance item; one finding correctly
   withdrawn after independent timezone verification via `git show -s --format=%cI`) -> ACCEPT (one
   stale figure caught and fixed pre-merge) -> final pass confirming the scoring target is
   right-side-up on all 40 false-positive records, reproducing every rate cell-for-cell, and
   reimplementing the placement-aware protected-literal algorithm from scratch in Python
   (independent of the shipped code) to reproduce 0/16 failures.
3. **Haiku numeric cross-check**: matched every figure except its own latency-percentile
   computation, which used neither the committed nearest-rank convention nor any other reproducible
   method and was excluded as Haiku's own arithmetic error, not an evidence defect (confirmed by the
   orchestrator recomputing all four p50/p95 pairs directly: 29.5s/56.1s and 2.8s/3.2s, matching the
   committed report exactly).
4. **agy adversarial review**: five pointed questions. Its challenge to the modality mechanism claim
   ("is this an over-read of n=4?") led directly to catching a real error: the merged report had
   claimed the two `qwen3.6-35b` false positives occurred because the model correctly parsed
   `modality: permissive` and the scorer failed to penalize it. Checking `parsedSem` directly showed
   this was backwards — no modality field was emitted in either false positive; the scorer
   correctly drives an emitted modality field to a 0.000 source-match score. The false positives
   occur from omission, not from an unpenalized field. Corrected in commit `534edb8`
   (PR #335), independently re-verified in this final recomputation.

## Recomputed headline figures (this verdict, direct from raw JSONL at `534edb8`)

| model | parse exact | near-only | recall | retention pass/fail | false positives |
|---|---|---|---|---|---|
| `openai/qwen3.6-35b-a3b` | 9/16 (56.25%) | 3/16 (18.75%) | 0.9319 | 31/32 | 2/20 |
| `openai/qwen3-coder-30b-a3b` | 4/16 (25.00%) | 0/16 | 0.8299 | 32/32 | 0/20 |

All `attempt` values are `1` (no retry masking) in both retention datasets. Both dataset SHA-256
values reproduce exactly from disk against every manifest. False-positive coverage confirmed for all
5 mutation categories (negation, modality, extra-clause, literal, role) across all 4 languages
(en/el/es/id), both models.

## Gates (unchanged, no calibration performed)

`minimumExactRate: 0.75`, `minimumFeatureRecall: 0.95`. **Both models fail both gates.** This is the
honest baseline result #253 was created to obtain, not a defect in the evidence.

## #253 acceptance checklist

| item | status |
|---|---|
| Two named models completed the full four-language matrix | Satisfied |
| Reports and raw results reproducible from committed manifests and dataset hashes | Satisfied — reproduced independently 3+ times by the orchestrator, 3 times by the Sonnet evaluator, once by Haiku |
| No result produced by the historically broken prompt path | Satisfied as far as verifiable — current `parsePrompt` unchanged, `finishReason: stop` on all completions; no `systemPromptSha256` exists on any pre-repair record to hash-verify against, disclosed as a gap |
| Exact and near-semantic results remain separate | Satisfied |
| False-positive review samples include negation, modality, extra-clause, literal, and role mutations | Satisfied — 20 items executed against both models, scored against source gold, mechanism claim corrected and reverified |
| Baselines reviewed before replacing existing retention gates | **Requires owner decision** — inherently a human sign-off action; both models fail both gates; the evidence needed for that review now exists and withstands independent recomputation |

## No threshold, gate, or scoring logic was changed

Confirmed by diff across every commit from the frozen baseline through `534edb8`: the only
pre-existing files touched by the #329/#332 chain are `cli.ts` (command registration only) and
`parse-experiment.ts` (adds optional diagnostic fields explicitly commented "does not affect
status/exact/gates"). The `0.8` near-semantic threshold and both parse gates are untouched
throughout.

## PASS rationale

Every acceptance-checklist item is either satisfied or is explicitly and irreducibly an owner
decision. No unreconciled numeric discrepancy remains after three independent recomputation passes.
The one unsupported mechanistic claim found in the evidence (the modality mechanism) has been
corrected and the correction independently reverified in this pass. This PASS certifies the evidence
bundle is complete, internally consistent, and honestly reported — not that the audited models met
their gates. They did not, and no action was taken to make them appear to.
