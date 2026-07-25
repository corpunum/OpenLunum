# testLunumv1 honest baselines — EN/EL/ES/ID (#253)

- Code commit under test: `e97eef3817cb36b1764256051ace59936306976b`
- Worktree clean at run time: **no tracked code, manifest, profile or dataset file was modified**.
  The only diffs were `reports/pi-loop/temps.csv` and `reports/orchestrator/velocity.csv` (appended by the
  thermal watchdog on its 5-minute timer, unrelated to the audit) plus the untracked run outputs written by
  the runs themselves. Full status is reproduced at the end of this report.
- Dataset: `datasets/dev/multilingual-core-v1.jsonl`, SHA-256 `6a5dfd6eeea0c368218003a12a56221f61ad3119fc22aa431c4fd4cc99826873`, 16 items
- Generated: 2026-07-25T10:32:25.674766
- Endpoint: both models served by the same llama.cpp router at `http://127.0.0.1:8080/v1`
- Prompt/schema version: current `parsePrompt` with schema example and controlled vocabulary

Every figure below is recomputed from the raw per-item JSONL, not copied from any runner summary.

## 1. Parse baselines

| model | lang | n | exact | near-only | recall | precision | errors | mean latency |
|---|---|---|---|---|---|---|---|---|
| qwen36-35b | en | 4 | 50.0% | 25.0% | 0.944 | 0.944 | 0 | 29.8s |
| qwen36-35b | el | 4 | 50.0% | 25.0% | 0.947 | 0.947 | 0 | 38.2s |
| qwen36-35b | es | 4 | 50.0% | 25.0% | 0.919 | 0.919 | 0 | 35.2s |
| qwen36-35b | id | 4 | 75.0% | 0.0% | 0.917 | 0.917 | 0 | 33.6s |
| qwen3-coder-30b | en | 4 | 25.0% | 0.0% | 0.850 | 0.833 | 0 | 2.7s |
| qwen3-coder-30b | el | 4 | 25.0% | 0.0% | 0.822 | 0.822 | 0 | 2.6s |
| qwen3-coder-30b | es | 4 | 25.0% | 0.0% | 0.822 | 0.822 | 0 | 2.5s |
| qwen3-coder-30b | id | 4 | 25.0% | 0.0% | 0.825 | 0.808 | 0 | 2.5s |

| model | total items | exact | near-only | recall | errors | p50 | p95 |
|---|---|---|---|---|---|---|---|
| qwen36-35b | 16 | **56.25%** | 18.75% | 0.9319 | 0 | 29.5s | 56.1s |
| qwen3-coder-30b | 16 | **25.00%** | 0.00% | 0.8299 | 0 | 2.8s | 3.2s |

### Declared gates

Both manifests declare `minimumExactRate: 0.75` and `minimumFeatureRecall: 0.95`.
**Neither model meets either gate.** No threshold was adjusted. Per #253, calibration may not
begin until these baselines are independently accepted; PR #242 was closed for calibrating first.

## 2. Retention baselines (realization -> parse-back)

| model | records | passed | failed | error classes | attempts | mean latency |
|---|---|---|---|---|---|---|
| qwen36-35b | 32 | 31 | 1 | {'validation_error': 1} | [1] | 17.07s |
| qwen3-coder-30b | 32 | 32 | 0 | none | [1] | 0.68s |

| model | lang | realization passed | parse-back passed | mean latency |
|---|---|---|---|---|
| qwen36-35b | en | 4/4 | 4/4 | 15.91s |
| qwen36-35b | el | 4/4 | 4/4 | 13.02s |
| qwen36-35b | es | 4/4 | 4/4 | 18.42s |
| qwen36-35b | id | 4/4 | 3/4 | 20.93s |
| qwen3-coder-30b | en | 4/4 | 4/4 | 0.65s |
| qwen3-coder-30b | el | 4/4 | 4/4 | 0.70s |
| qwen3-coder-30b | es | 4/4 | 4/4 | 0.68s |
| qwen3-coder-30b | id | 4/4 | 4/4 | 0.67s |

### The single retention failure, recorded not excluded

`qwen3.6-35b`, item `deadline-id`, stage `parse-back`, `errorClass: validation_error`, `attempt: 1`:

```json
{"parsedText": {"deadline": "2026-09-30"}, "sourceLanguage": "id"}
```
`parsedText` was returned as an object where the contract requires a string. This is a genuine
model failure, not an infrastructure error. It was not retried and not excluded.

## 3. Prefix-cache reuse — measured, not assumed absent

The router runs with `-np 3` (a server-level parallel-slot flag, distinct from the per-model
`parallel = 1` recorded in each preset block) and the client does not send `cache_prompt`, so
llama.cpp prefix caching is active and uncontrolled. Reported per task, since the two differ sharply:

| task | model | cached prompt tokens | total prompt tokens | share |
|---|---|---|---|---|
| parse | qwen36-35b | 10864 | 11429 | **95.1%** |
| parse | qwen3-coder-30b | 9931 | 11084 | **89.6%** |
| retention | qwen36-35b | 1095 | 2541 | **43.1%** |
| retention | qwen3-coder-30b | 1185 | 2525 | **46.9%** |

On the parse runs roughly **90-95% of prompt tokens were served from cache** — nearly the entire
prompt, since all 16 items share one long system prompt and differ only in the trailing user text.
Retention is lower because its two stages use different system prompts.

Latency figures are therefore substantially cache-hit timings, not cold inference. This does not
affect correctness metrics (exact, near-semantic, recall): a cached prefix yields the same KV state
as recomputation. It does further undermine cross-model latency comparison — see Section 4.

## 3a. Protected-literal failures

Required by #253 and omitted from the first version of this report. 8 of the 16 dataset items carry
`protectedLiterals` (`battery-*`: `"20"`; `deadline-*`: `"2026-09-30"`). A failure is the literal not
surviving into the parsed semantic output.

| model | literals checked | failures | failure rate |
|---|---|---|---|
| qwen36-35b | 8 | 0 | 0.0% |
| qwen3-coder-30b | 8 | 0 | 0.0% |

Both models preserved every protected literal. Two caveats, both material:

- **Small N and not gated**: only 8 items exercise this, and the parse manifests set
  `requireProtectedLiteralCoverage: false`.
- **The matching method tests presence, not placement.** It checks whether the literal string occurs
  in the serialised parsed output. A substring test would credit a model that emitted `120` or `200`
  as having preserved `20`, or that placed the literal in the wrong semantic role. On manual inspection
  of all 16 cases the values are in fact correctly placed (`20` with `unit: percent`, `2026-09-30` in
  the `time` role), so the reported 0/8 is accurate for this data — but the metric as implemented is
  weaker than the number suggests and should be tightened before it is relied on as a gate.

## 4. Latency is reported as NON-COMPARABLE across models

`OpenAICompatibleModel.complete()` is a non-streaming `fetch` and the runner measures whole-request
wall clock, so time-to-first-token and time-per-output-token are unavailable; request latency
conflates generation length with inference speed. Combined with the prefix-cache reuse above, and
with sequential execution, cross-model latency comparison is not supported by this evidence.
The p50/p95 figures are recorded because #253 requires them, not because they license a conclusion.

## 5. Execution integrity

- Every run used the built CLI entrypoint (`node packages/eval/dist/src/cli.js`), never an in-process shortcut
- Endpoint identity verified via `scripts/verify-audit-endpoints.sh` **before** each run: model id present
  in `/v1/models`, weights path/size/mtime recorded, `OVERALL: PASS`. Timing, with both clocks normalised
  to UTC (the committed preflight reports stamp local EEST = UTC+3, and run-ID directories stamp UTC —
  an ambiguity that misread as "preflight ran after the run" on independent review):

  | preflight (local EEST) | preflight (UTC) | run started (UTC) | lead time |
  |---|---|---|---|
  | 09:05:43 | 06:05:43Z | 06:09:46Z (parse) | 4m 03s before |
  | 10:20:30 | 07:20:30Z | 07:20:44Z (retention) | 14s before |
- Router restarted between model runs to purge KV and allocation carry-over; endpoint re-verified after each restart
- Zero infrastructure errors across all four runs, so the invalidate-the-matrix rule never triggered
- `attempt` is `1` on every record in both retention runs: no retry masking
- No item was excluded from any run for any reason

## 6. Known gaps, stated rather than papered over

1. **TTFT/TPOT unavailable** without a streaming client change, not introduced mid-audit.
2. **Sequential execution** retains a thermal-drift bias toward whichever model runs first. Disclosed rather than corrected; this is part of why latency is labelled non-comparable.
3. **Prefix caching active**, and dominant on the parse runs: 95.1% / 89.6% of prompt tokens served
   from cache for parse, 43.1% / 46.9% for retention. See Section 3 for the per-task table.
4. **Preflight can fail for cold weights.** After a router restart the 35B's first probe took 27.2s against a 30s curl timeout; warm it is ~177ms. A preflight failure is therefore ambiguous between 'cold weights' and 'wrong endpoint'. Fail-closed remains correct, but the ambiguity is real.
5. **Model-file hashing not performed for this run.** `--hash-weights` exists but was not used; identity rests on the `/v1/models` assertion plus weights path, size and mtime.
6. **Probe success does not establish model identity.** A probe sent to an endpoint not serving the requested model still returned a completion — llama-server silently ignores the model field.
7. **#253 acceptance item "False-positive review samples include negation, modality, extra-clause, literal, and role mutations" is NOT satisfied and cannot be satisfied by this dataset.** `multilingual-core-v1.jsonl`'s 16 items are tagged only by category (`preference`, `delete`, `battery`, `deadline`) and language; they carry no mutation-type tags. The only mutation-tagged corpus in the repository, `datasets/adversarial/semantic-traps-v1.jsonl`, holds 2 English-only items (`nested-negation-en`, `quantity-unit-en`) tagged `negation`/`quantity` — no modality, extra-clause, or role mutations, and no non-English coverage. Closing #253 therefore requires either building that corpus or explicitly amending the acceptance criterion. This is recorded as unmet rather than quietly skipped.
8. **Run-time commit is asserted, not instrumented.** The report records HEAD as `e97eef38` at generation, but the runner writes only the manifest's `baselineCommit` (`4e52d1da`, a real ancestor 3 commits back) into `manifest.snapshot.json`. The frozen manifest and the executed snapshot are byte-identical, so there is no drift — but no artifact independently corroborates the run-time HEAD.

9. **Router `-np 3` is asserted, not evidenced in this bundle.** No router startup log or systemd unit
   file is committed here, so the distinction between the router-level slot flag and the per-model preset
   `parallel = 1` is architecturally plausible but not independently verifiable from these artifacts alone.

## 7. Provenance of the run matrix

Manifests frozen in `experiments/audit-321-freeze/` (2 parse + 2 retention, one per model), validated
by `packages/eval/test/audit-321-freeze-matrix.test.ts` against the real unmodified validators.
Two defects were found and fixed before these numbers were produced:

- **#321 review**: 8 per-language parse manifests would each have processed all 16 items (128 calls for evidence 32 produces), because `parse-experiment.ts` groups by `sourceLanguage` natively. Collapsed to 2.
- **#325**: 8 per-language retention manifests could not execute at all — `planRetentionExecution` requires `expectedItemIds` to match the loaded dataset exactly. The guarding test pre-filtered the dataset, validating a call shape the CLI never makes, so it passed on unrunnable artifacts. Collapsed to 2 and the test now plans against the full dataset as the CLI does.

## Worktree state at generation
```
M reports/orchestrator/velocity.csv
 M reports/pi-loop/temps.csv
?? .claude/
?? reports/experiments/audit-321/
```
