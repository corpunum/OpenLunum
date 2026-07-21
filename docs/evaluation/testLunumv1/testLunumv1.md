# testLunumv1 — Lunum Capability and Multilingual Evaluation Protocol

**Protocol version:** 1.0.0  
**Status:** Living execution specification  
**Canonical path:** `docs/evaluation/testLunumv1/testLunumv1.md`  
**Results root:** `reports/evaluations/testLunumv1/`  
**Repository:** `corpunum/OpenLunum`

> Live `origin/main`, current GitHub issues, and the repository operating model override historical examples in this document.

## 1. Repository policy

The protocol and its results are deliberately separated:

```text
docs/evaluation/testLunumv1/
├── testLunumv1.md   # living protocol
└── CHANGELOG.md     # version and decision history

reports/evaluations/testLunumv1/
├── README.md        # run index and immutability rules
└── <RUN_ID>/        # immutable evidence bundle
```

Rules:

- Change this protocol only through an issue-linked pull request.
- Update the semantic version and `CHANGELOG.md` whenever measurement behavior changes.
- Never rewrite a completed `<RUN_ID>/` result bundle.
- Corrections are additive: create a new run or add `CORRECTION.md` that preserves and links to the original evidence.
- Results produced under different code SHAs, protocol versions, datasets, prompts, schemas, scorers, or model profiles are not directly comparable unless explicitly normalized and labelled.
- Copies in prompts, handovers, or local notes are non-authoritative. The orchestrator must read this file directly.

## 2. Objective

The audit must answer, analytically and reproducibly:

1. What does Lunum perform correctly today?
2. What is semantically correct but non-canonical?
3. Which failures come from the target model, Lunum code, scorer, dataset, Pi worker, or infrastructure?
4. How do English, Greek, Spanish, and Indonesian compare?
5. What do successful and failed results cost in latency and tokens?
6. How compact is the Lunum Sem representation relative to source text?
7. How stable are results across repeated runs?
8. Which three engineering priorities offer the highest expected improvement?

The audit is diagnostic. It does not authorize production-readiness, safety, language-support, model-support, or threshold-calibration claims.

Issue `#253` remains the strategic evidence milestone until its full acceptance contract is satisfied. Threshold calibration is prohibited before that point.

## 3. Non-goals and hard prohibitions

Do not:

- select work autonomously;
- run persistent Pi or model loops;
- invoke a model while no explicit assignment exists;
- push directly to `main`;
- change protected datasets to improve scores;
- silently retry, omit, cap, replace, or cherry-pick items;
- replace the official run with a better repeat;
- combine results from different frozen inputs without labelling the comparison invalid;
- treat green CI or a merged report as proof that an evaluation is complete;
- use the surface-only `lunum pipeline` path as semantic-classification evidence;
- call a capped smoke run a complete multilingual baseline;
- calibrate gates or thresholds as part of this protocol.

## 4. Roles

### 4.1 Local orchestrator

The orchestrator:

- reconciles repository, GitHub, machine, service, endpoint, and worktree state;
- creates explicit issues and bounded assignments;
- writes one uncommitted assignment at a time;
- dispatches Pi once through `scripts/pi-dispatch-once.sh`;
- verifies branch, evidence, counts, hashes, and results;
- does not perform idle model work;
- does not approve its own evidence as an independent evaluator.

### 4.2 Pi local worker agent

Pi is the execution agent, not automatically the target model under test.

The one-shot dispatcher must remain the only worker entrypoint:

```bash
scripts/pi-dispatch-once.sh /home/corpunum/OpenLunum
```

It consumes:

```text
reports/orchestrator/WORKER_ASSIGNMENT.md
```

No assignment must produce exactly the idle path and no model calls or writes.

Every worker report records:

- assignment ID;
- issue;
- worker name;
- branch;
- tier;
- actual `PI_MODEL` and provider;
- Pi session ID;
- timeout;
- model-call budget;
- start/end UTC;
- exit code;
- archived assignment path;
- dispatch log path;
- final status: `candidate`, `blocked`, or `no-improvement`.

### 4.3 Target model under test

A target model is the local OpenAI-compatible endpoint whose Lunum parse or realization behavior is measured.

Historical profiles must be rediscovered and verified before use. Examples include:

| Profile | Model | Historical endpoint | Temp | Seed | Max tokens | noThink |
|---|---|---|---:|---:|---:|---|
| `qwen36-35b-live` | `openai/qwen3.6-35b-a3b` | `127.0.0.1:8080/v1` | 0 | 42 | 4096 | true |
| `qwen3-coder-30b-live` | `openai/qwen3-coder-30b-a3b` | `127.0.0.1:48127/v1` | 0 | 42 | 512 | omitted |

The live run must verify `/models`, profile hash, server version, model identity, launch configuration, timeout, token limit, template, quantization, and hardware.

### 4.4 Independent evaluator

The evaluator must:

- be separate from the implementation/measurement worker;
- bind its verdict to the exact evidence commit SHA;
- recompute summaries from raw records;
- verify counts, hashes, formulas, exclusions, and claims;
- avoid modifying the candidate;
- use another local worker model when practical and disclose when unavailable;
- commit an accessible verdict, never only a machine-local `file:///` link.

## 5. Assignment, branch, and dispatch constraints

Workers run sequentially because the dispatcher uses a global lock. Do not bypass it.

Each evidence-producing task uses:

```text
work/<worker>/<issue-number>-<short-name>
```

Requirements:

- one issue per branch;
- one assignment per dispatch;
- one coherent draft PR per issue;
- no worker self-merge;
- no force-push after exact-SHA evaluation;
- squash merge only after acceptance;
- delete and prune the branch after merge;
- warn above six non-main remote branches;
- stop dispatch above eight.

Recommended bounded issue sequence:

1. instrumentation prerequisite, only when required metrics are absent;
2. dataset and manifest audit;
3. target model A run;
4. target model B run;
5. mutation/robustness/cross-lingual run;
6. aggregate analysis;
7. independent exact-SHA evaluation.

## 6. Freeze and preflight

Before any model call:

```bash
cd /home/corpunum/OpenLunum
git fetch --prune origin
git checkout main
git reset --hard origin/main
git rev-parse HEAD
git status --porcelain=v1
git worktree list --porcelain
git for-each-ref --format='%(refname:short)' refs/remotes/origin/ | sort
```

Create a clean detached evaluation worktree at the frozen SHA. Do not use pre-existing generated or untracked primary-worktree reports as evidence.

Freeze and record:

- evaluated code SHA;
- protocol version and file SHA-256;
- dataset paths, IDs, counts, and SHA-256;
- prompt and schema hashes;
- scorer code/version;
- immutable model profiles and hashes;
- endpoint/model identity;
- temperature, seed, max tokens, timeout, `noThink`;
- server/runtime version and launch settings;
- hardware and quantization;
- run ID and timestamp;
- clean-worktree proof.

All models in a comparison must use the same frozen code, data, prompt, schema, scorer, and declared item set.

If `origin/main` moves after freezing, either complete the run as a clearly labelled historical audit or cancel and restart. Never blend SHAs.

## 7. Mandatory preflight output

Before dispatch, the orchestrator prints:

```markdown
# testLunumv1 preflight

- Live origin/main:
- Proposed evaluated SHA:
- Protocol version/hash:
- Clean worktree path and status:
- Open PRs:
- Relevant issues:
- Non-main remote branches:
- Active Pi/model processes:
- Active services/timers:
- Target model profiles/hashes:
- Endpoint doctor and probe status:
- Dataset paths/hashes:
- Item counts by language and semantic kind:
- Prompt/schema/scorer hashes:
- Known instrumentation gaps:
- Planned child issues:
- Planned Pi workers:
- Planned model-call budget:
- Expected result paths:
- Dispatch blocked:
- First safe action:
```

Unknown freeze-critical values block dispatch.

## 8. Measurement prerequisites

Verify these capabilities before the official audit:

1. **Token metadata** — preserve API usage, finish reason, and timing. If unavailable, report `N/A`; never invent it. Add bounded instrumentation before requiring token-based acceptance.
2. **Coverage controls** — prove expected item IDs equal executed IDs. Detect missing/duplicate items and ensure `maxItems` and `maxModelCalls` cannot truncate the run.
3. **Real retention CLI** — retention must be manifest-driven and invoked through a committed CLI path, not an in-process convenience script.
4. **Raw retention evidence** — preserve raw realization and parse-back outputs, usages, prompts/hashes, parsed Sem, and all errors.
5. **Latency statistics** — preserve per-item latency so p50/p90/p95/p99 can be recomputed.
6. **Error separation** — transport, HTTP, timeout, malformed output, schema invalidity, semantic failure, literal failure, and scorer failure remain distinct.

A missing prerequisite creates a bounded implementation issue and blocks the affected official suite.

## 9. Test phases

### Phase A — deterministic repository verification

Run from the clean worktree:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm --filter @corpunum/lunum-eval build
```

Verify schemas, generated-type drift, migrations, canonicalization, serialization, exact/near separation, protected literals, malformed input, CLI exit codes, report validation, surface-only warnings, dispatcher negative tests, and zero model calls without assignment.

### Phase B — endpoint verification

For every model:

```bash
node packages/eval/dist/src/cli.js doctor --profile <profile.json>
```

Capture five individually reported health probes, `/models`, server identity, profile hash, model identity, warm/cold state, and launch configuration.

### Phase C — complete multilingual parse matrix

Languages:

- `en` English;
- `el` Greek;
- `es` Spanish;
- `id` Indonesian.

Minimum: two named local models.

Execute the real built CLI:

```bash
node packages/eval/dist/src/cli.js parse-experiment <manifest.json>
```

For every item preserve raw output, parsed Sem, gold reference, exact comparison, near-only comparison, missing/extra features, protected literals, latency, token usage, finish reason, and error class.

### Phase D — complete parse-plus-retention matrix

For every item × target language × model:

1. begin from gold Sem;
2. realize into the target language;
3. parse the realized text back;
4. compare to gold;
5. retain both raw calls and all component scores.

Required fields include realization and parse prompts/hashes, raw outputs, cleaned text, parsed-back Sem, exact, near-only, feature precision/recall/F1, predicate match, role match, literal preservation, pass/fail, usages, finish reasons, and per-stage latency.

### Phase E — held-out mutation suite

Cover at least:

- negation;
- modality;
- added/removed/reversed conditions;
- extra clauses;
- role swaps;
- literal changes;
- scope changes;
- temporal changes;
- permission polarity;
- `and`/`or` changes.

Report false-equivalence, false-non-equivalence, family accuracy, and a concrete failure gallery. Mutation cases must not copy prompt examples or protected evaluation records.

### Phase F — cross-lingual consistency

Use aligned EN/EL/ES/ID intents. Score each against gold and compare every language pair for predicate, role, clause, literal, and semantic agreement. Do not translate outputs before primary scoring.

### Phase G — robustness

Bounded cases include fenced JSON, preamble/trailing text, reasoning tags, truncation, malformed/empty output, HTTP errors, timeout, endpoint loss, long and multi-clause inputs, ambiguity, conflicting instructions, mixed-language input, Unicode normalization, repeated literals, concurrency 1/2/3, and cold/warm starts.

### Phase H — reproducibility

Keep one official pass and two separately labelled repeat passes. Do not select the best run. Measure status agreement, fingerprint agreement, score variance, token variance, latency variance, and failure-mode variance.

## 10. Item statuses

Use:

- `PASS_EXACT` — valid and exact fingerprint match;
- `PASS_NEAR_ONLY` — valid, non-exact, declared near-semantic pass;
- `FAIL_SEMANTIC` — valid but semantically wrong;
- `ERROR` — execution, transport, output, schema, or scorer error;
- `SKIP_DECLARED` — declared before execution with reason;
- `BLOCKED` — prerequisite prevented execution.

Skips and blocks are never passes.

## 11. Required metrics

Per item, model, language, semantic kind, and suite:

- total, pass, fail, error, skip, blocked;
- valid-output rate;
- exact rate;
- near-only rate;
- feature precision, recall, and F1;
- predicate match;
- role-key and role-value match where available;
- clause-count delta;
- missing and hallucinated features/clauses;
- protected-literal precision/recall/preservation;
- retention rate;
- mutation-family accuracy;
- cross-language agreement;
- run-to-run agreement;
- mean, p50, p90, p95, p99, min, max, and standard-deviation latency;
- prompt, completion, total, cached, and reasoning tokens when exposed;
- finish reason;
- throughput and tokens/second when exposed;
- worker model calls and wall time;
- GPU memory/utilization, CPU, power, and energy when reliably measurable.

Every percentage includes numerator and denominator. Tiny samples must be labelled; use confidence intervals where meaningful.

## 12. Diagnostic scores

Feature F1:

```text
F1 = 0 when precision + recall = 0
F1 = 2 × precision × recall / (precision + recall) otherwise
```

Diagnostic item semantic score, not an acceptance gate:

```text
semantic_score_0_100 =
  35 × feature_F1
+ 25 × predicate_match
+ 20 × role_match
+ 20 × protected_literal_preservation
```

Diagnostic Capability Score components:

| Dimension | Weight |
|---|---:|
| Canonical exactness | 25 |
| Semantic fidelity | 25 |
| Round-trip retention | 20 |
| Mutation safety | 15 |
| Cross-language consistency | 5 |
| Reproducibility | 5 |
| Efficiency | 5 |

Always display components. Never publish only the weighted total.

## 13. Token and compaction metrics

Token source priority:

1. API usage;
2. exact model tokenizer;
3. clearly labelled approximation;
4. `N/A`.

Required calculations:

```text
semantic_compaction_pct =
  100 × (1 - serialized_sem_tokens / source_text_tokens)

character_compaction_pct =
  100 × (1 - sem_characters / source_characters)

byte_compaction_pct =
  100 × (1 - sem_bytes / source_bytes)

payload_efficiency_pct =
  100 × required_payload_tokens / completion_tokens

prompt_overhead_pct =
  100 × reusable_system_and_example_tokens / total_prompt_tokens

failed_token_waste_pct =
  100 × tokens_used_by_fail_or_error_items / all_item_tokens

realization_delta_pct =
  100 × (realized_text_tokens - source_text_tokens) / source_text_tokens
```

Also report tokens/item, tokens/exact pass, tokens/semantic pass, tokens/retained item, and completion tokens/item.

Pi worker context compaction, only when the provider exposes actual before/after values:

```text
worker_context_compaction_pct =
  100 × (1 - post_compaction_tokens / pre_compaction_tokens)
```

Otherwise record `N/A`.

## 14. Error taxonomy

Use one primary class:

- `TRANSPORT_CONNECT`;
- `HTTP_CLIENT`;
- `HTTP_SERVER`;
- `TIMEOUT`;
- `EMPTY_OUTPUT`;
- `TRUNCATED_OUTPUT`;
- `NO_JSON_OBJECT`;
- `MALFORMED_JSON`;
- `SCHEMA_INVALID`;
- `SEMANTIC_INCORRECT`;
- `PROTECTED_LITERAL_FAILURE`;
- `SCORER_FAILURE`;
- `DATASET_FAILURE`;
- `PROFILE_FAILURE`;
- `INFRASTRUCTURE_OTHER`;
- `UNKNOWN`.

Secondary tags are allowed, but the primary class must remain stable.

## 15. Model-call budget

Compute before dispatch:

```text
parse_calls = item_count × model_count × pass_count
retention_calls = item_count × language_count × model_count × 2 × pass_count
mutation_calls = mutation_count × model_count × pass_count
robustness_calls = robustness_count × model_count × pass_count
probe_calls = 5 × model_count
```

The assignment budget must be bounded to the declared run, not an arbitrary large value.

## 16. Required result bundle

Each run writes:

```text
reports/evaluations/testLunumv1/<RUN_ID>/
├── README.md
├── run-manifest.json
├── environment.md
├── repository-state.md
├── dataset-inventory.json
├── dataset-hashes.txt
├── prompt-schema-hashes.txt
├── endpoint-probes/<model-id>.jsonl
├── raw/parse/<model-id>/<language>.jsonl
├── raw/retention/<model-id>/<language>.jsonl
├── raw/mutation/<model-id>/<language>.jsonl
├── raw/robustness/<model-id>.jsonl
├── raw/reproducibility/<model-id>/<repeat>.jsonl
├── models/<model-id>.md
├── workers/<pi-worker-id>.md
├── model-worker-matrix/<pi-worker-id>__<model-id>.md
├── languages/en.md
├── languages/el.md
├── languages/es.md
├── languages/id.md
├── suites/deterministic.md
├── suites/parse.md
├── suites/retention.md
├── suites/mutation.md
├── suites/cross-lingual.md
├── suites/robustness.md
├── suites/reproducibility.md
├── suites/efficiency.md
├── tables/overall.csv
├── tables/by-model.csv
├── tables/by-worker.csv
├── tables/by-model-worker.csv
├── tables/by-language.csv
├── tables/by-semantic-kind.csv
├── tables/by-mutation-family.csv
├── tables/latency.csv
├── tables/tokens.csv
├── tables/errors.csv
├── failure-gallery/index.md
├── overall-scorecard.md
├── focus-recommendations.md
└── independent-evaluator-verdict.md
```

Every file references run ID, evaluated SHA, evidence SHA, dataset hash, profile hash, protocol version, assignment ID, and timestamp.

## 17. Per-model report table

Each `models/<model-id>.md` includes identity/settings and:

| Suite | Items | Exact | Near | Fail | Error | Score /100 | p50 ms | p95 ms | Prompt tokens | Completion tokens | Tokens/pass | Compaction % | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Deterministic | | | | | | | | | | | | | |
| Parse | | | | | | | | | | | | | |
| Retention | | | | | | | | | | | | | |
| Mutation | | | | | | | | | | | | | |
| Robustness | | | | | | | | | | | | | |
| Reproducibility | | | | | | | | | | | | | |

Language table:

| Language | Items | Exact % | Near % | F1 | Predicate | Role | Literal | Retention % | Mutation % | p95 ms | Tokens | Compaction % | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| English | | | | | | | | | | | | | |
| Greek | | | | | | | | | | | | | |
| Spanish | | | | | | | | | | | | | |
| Indonesian | | | | | | | | | | | | | |

The report also lists semantic-kind breakdown, efficiency, error classes, representative failures, strongest capability, largest weakness, language gap, reliability concern, next experiment, and unsupported claims.

## 18. Per-Pi-worker report

Each `workers/<pi-worker-id>.md` includes:

- assignment/issue/branch/tier;
- Pi provider/model/session;
- budgets and timeout;
- dispatch log/archive;
- wall time and exit code;
- Pi token usage and compaction when available;
- shell commands and files changed;
- tests run/pass/fail;
- required artifact production/validation table;
- exact branch head and draft PR;
- blockers and unplanned actions;
- explicit `Autonomous task selection: NO`.

## 19. Model × worker report

Each `model-worker-matrix/<worker>__<model>.md` includes per-language pass/fail/error, semantic score, retention, tokens, tokens/pass, compaction, and p95 latency.

It must also attribute findings across:

| Observation | Target model | Lunum/scorer | Pi worker | Infrastructure | Dataset | Confidence |
|---|---|---|---|---|---|---|

This prevents worker performance from being confused with Lunum capability.

## 20. Raw JSONL minimum fields

Each interaction record includes:

```text
runId, protocolVersion, evaluatedSha, evidenceSha,
assignmentId, piWorkerId, piWorkerModel,
suite, itemId, semanticKind, sourceLanguage, targetLanguage,
targetModelProfileId, targetModelProfileSha256,
datasetPath, datasetSha256, attempt, plannedRepeat,
systemPromptSha256, userPrompt, rawOutput, extractedPayload,
parsedSem, goldSem, status, exact, nearSemanticOnly,
nearSemanticScore, featurePrecision, featureRecall, featureF1,
predicateMatch, roleMatch, literalPreservation, clauseCountDelta,
missingFeatures, extraFeatures, latencyMs, timeToFirstTokenMs,
usage source and token fields, compaction fields, finishReason,
errorClass, errorMessage, startedAt, completedAt
```

Raw failed records are never removed.

## 21. Dataset quality and leakage controls

Before testing:

- hash datasets;
- list every ID;
- count by language and semantic kind;
- detect duplicates and near-duplicates;
- compare prompt examples with evaluation items;
- compare mutation cases with prompt examples and canonical gold;
- record provenance and licensing;
- separate development, validation, and held-out test data;
- never tune against the final mutation holdout.

Prompt-example overlap blocks generalization claims.

## 22. Independent evaluation

The evaluator verifies:

- hashes and exact SHAs;
- exact item inventory;
- two models and four languages;
- every table recomputed from raw JSONL;
- exact/near/error separation;
- token-count source and compaction formulas;
- latency percentiles;
- mutation-family coverage;
- retries and exclusions;
- representative successes and failures;
- exact-head hosted checks.

Verdict values:

- `PASS`;
- `FAIL`;
- `INCOMPLETE`;
- `BLOCKED`.

Every unmet item must be listed.

## 23. Focus ranking

Rank recommendations with values from 1–5:

```text
priority_score =
  user_impact
× failure_frequency
× confidence_in_diagnosis
× cross_model_scope
÷ estimated_effort
```

Publish exactly three headline priorities. For each, include evidence, affected models/languages/kinds, likely root cause, bounded proposed issue, expected measurable improvement, and proof-of-improvement test.

Typical interpretations:

- low valid-output rate → output protocol, extraction, token budget, or endpoint;
- high semantic fidelity but low exactness → canonicalization/vocabulary;
- low role score → roles or role-aware scoring;
- mutation false positives → tighten semantic comparison;
- literal failures → protected-literal work;
- language-specific gap → normalization/examples;
- parse strong but retention weak → realization/round-trip;
- high infrastructure errors → repair infrastructure first;
- high repeat variance → stabilize inference;
- low payload efficiency → reduce non-payload completion;
- negative compaction → inspect representation verbosity.

## 24. Execution order

1. reconcile live state;
2. create/confirm the parent audit issue;
3. inspect instrumentation gaps;
4. complete any prerequisite instrumentation through its own PR;
5. freeze evaluated SHA;
6. audit data/manifests;
7. run deterministic verification;
8. run model A parse;
9. run model B parse;
10. run complete retention;
11. run mutation/robustness/cross-lingual suites;
12. run two labelled reproducibility repeats;
13. generate all model/worker/language files and CSVs;
14. aggregate failure gallery and scorecard;
15. independently evaluate exact evidence SHA;
16. run one hosted acceptance cycle;
17. merge only if issue acceptance is complete;
18. publish exactly three focus recommendations.

No code, prompt, dataset, scorer, or profile tuning is allowed between official model runs. A defect stops the audit and becomes a separate issue.

## 25. Stop conditions

Report `BLOCKED` rather than improvising when:

- issue or assignment is missing;
- branch budget is violated;
- another dispatch is active;
- frozen SHA or input hash changed;
- worktree is dirty;
- items are missing/duplicated;
- endpoint/model/profile identity is uncertain;
- a target model is unavailable;
- required token instrumentation is absent;
- retention CLI/raw evidence is missing;
- prompt leakage or scorer failure is found;
- protected data would need modification;
- a retry would be unplanned;
- an independent evaluator is unavailable;
- exact-SHA hosted checks are missing or stale.

A blocked audit is more useful than an invalid complete-looking report.

## 26. Acceptance checklist

### Governance

- [ ] Parent issue exists.
- [ ] Every worker had one explicit assignment.
- [ ] No idle/persistent model loop ran.
- [ ] No autonomous task selection.
- [ ] Branch budget respected.
- [ ] No direct push to main.
- [ ] Logs and archived assignments exist.

### Identity and coverage

- [ ] Evaluated SHA and clean worktree proven.
- [ ] Protocol/data/prompt/schema/scorer/profile hashes recorded.
- [ ] Endpoint/server/hardware identity recorded.
- [ ] At least two models.
- [ ] EN, EL, ES, ID.
- [ ] Full parse matrix.
- [ ] Full retention matrix.
- [ ] No hidden cap.
- [ ] Required mutation and robustness coverage.
- [ ] Official pass plus two labelled repeats.

### Evidence

- [ ] Every item accounted for.
- [ ] Raw outputs and parsed results preserved.
- [ ] Gold references preserved.
- [ ] Exact, near-only, invalid, and errors separated.
- [ ] Usage source, finish reason, latency, and compaction recorded.
- [ ] No silent retry/exclusion.

### Reports

- [ ] One file per target model.
- [ ] One file per Pi worker.
- [ ] One file per model × worker.
- [ ] One file per language.
- [ ] CSV tables and failure gallery.
- [ ] Overall scorecard and three focus recommendations.
- [ ] Independent verdict.

### Claims

- [ ] No unsupported production/language/model/safety claim.
- [ ] No threshold calibration.
- [ ] Smoke runs labelled.
- [ ] Every aggregate includes numerator and denominator.
- [ ] Every comparison uses compatible frozen inputs or is labelled invalid.

## 27. Definition of success

`testLunumv1` succeeds only when it provides an independently verified, reproducible account of:

- exact capabilities;
- semantically close but non-canonical behavior;
- failure concentration by semantic kind and language;
- round-trip and mutation weaknesses;
- attribution across model, code, scorer, dataset, worker, and infrastructure;
- latency and token cost of success and failure;
- semantic compaction by language;
- reproducibility;
- the three highest-value next engineering actions.

Zero exit codes alone are not success.
