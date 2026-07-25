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

The router runs `-np 3` and the client does not send `cache_prompt`, so llama.cpp prefix caching
is active and uncontrolled. Reported here rather than left invisible:

| model | cached prompt tokens | total prompt tokens | share |
|---|---|---|---|
| qwen36-35b | 1095 | 2541 | **43.1%** |
| qwen3-coder-30b | 1185 | 2525 | **46.9%** |

Roughly 43-47% of prompt tokens were served from cache. Latency figures are therefore partly
cache-hit timings, not clean cold inference. This does not affect correctness metrics (exact,
near-semantic, recall) since cached prefixes produce the same KV state as recomputation.

## 4. Latency is reported as NON-COMPARABLE across models

`OpenAICompatibleModel.complete()` is a non-streaming `fetch` and the runner measures whole-request
wall clock, so time-to-first-token and time-per-output-token are unavailable; request latency
conflates generation length with inference speed. Combined with the prefix-cache reuse above, and
with sequential execution, cross-model latency comparison is not supported by this evidence.
The p50/p95 figures are recorded because #253 requires them, not because they license a conclusion.

## 5. Execution integrity

- Every run used the built CLI entrypoint (`node packages/eval/dist/src/cli.js`), never an in-process shortcut
- Endpoint identity verified via `scripts/verify-audit-endpoints.sh` before each run: model id present in
  `/v1/models`, weights path/size/mtime recorded, `OVERALL: PASS`
- Router restarted between model runs to purge KV and allocation carry-over; endpoint re-verified after each restart
- Zero infrastructure errors across all four runs, so the invalidate-the-matrix rule never triggered
- `attempt` is `1` on every record in both retention runs: no retry masking
- No item was excluded from any run for any reason

## 6. Known gaps, stated rather than papered over

1. **TTFT/TPOT unavailable** without a streaming client change, not introduced mid-audit.
2. **Sequential execution** retains a thermal-drift bias toward whichever model runs first. Disclosed rather than corrected; this is part of why latency is labelled non-comparable.
3. **Prefix caching active** at ~45% of prompt tokens, as measured above.
4. **Preflight can fail for cold weights.** After a router restart the 35B's first probe took 27.2s against a 30s curl timeout; warm it is ~177ms. A preflight failure is therefore ambiguous between 'cold weights' and 'wrong endpoint'. Fail-closed remains correct, but the ambiguity is real.
5. **Model-file hashing not performed for this run.** `--hash-weights` exists but was not used; identity rests on the `/v1/models` assertion plus weights path, size and mtime.
6. **Probe success does not establish model identity.** A probe sent to an endpoint not serving the requested model still returned a completion — llama-server silently ignores the model field.

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
