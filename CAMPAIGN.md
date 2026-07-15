# OpenLunum autonomous research campaign

This document is the operating instruction for a long-running, local-model-assisted campaign to develop Lunum across every declared work area. It is written for coding agents, research agents, evaluator agents, orchestrators, and maintainers.

The campaign is not one giant rewrite. It is a sequence of bounded experiments, independent evaluations, reviewable pull requests, and explicit decisions.

## Mission

Advance Lunum toward a language-agnostic semantic interlingua that:

- preserves meaning across supported human languages;
- stores language-neutral `Lunum-Sem` plus original source and provenance;
- creates deterministic semantic fingerprints;
- renders model/tokenizer-specific compact `Lunum-Code` profiles;
- realizes stored semantics into supported natural languages;
- safely compiles natural, compact, or mixed context;
- improves retrieval and agent interoperability;
- earns every support claim through reproducible evidence.

A work item is complete only when it is:

1. merged by an authorized maintainer with accepted evidence;
2. rejected with preserved evidence and a documented reason; or
3. blocked by a concrete dependency, missing protected data, unavailable hardware, missing credentials, or required human semantic judgment.

A model claiming that its own output is correct is not evidence.

---

## 1. Resolve the correct campaign base

Clone and inspect the repository:

```bash
git clone https://github.com/corpunum/OpenLunum.git
cd OpenLunum
git fetch --all --prune
```

The TypeScript research foundation may still be awaiting merge. Select the base as follows:

```bash
if git show origin/main:START_HERE.md >/dev/null 2>&1; then
  git checkout main
  git pull --ff-only origin main
  CAMPAIGN_BASE="main"
else
  git checkout -B foundation origin/agent/typescript-agent-research-loop
  CAMPAIGN_BASE="agent/typescript-agent-research-loop"
fi

git rev-parse HEAD
```

When working from the unmerged foundation branch:

- do not start from the old JavaScript `main`;
- target dependent PRs at `agent/typescript-agent-research-loop`;
- label them as dependent on PR #1;
- do not merge PR #1 or dependent PRs autonomously;
- rebase onto `main` only after the foundation is merged.

---

## 2. Required reading

Read these files before selecting work:

1. `README.md`
2. `START_HERE.md`
3. `AGENTS.md`
4. `VISION.md`
5. `STATUS.md`
6. `ROADMAP.md`
7. `WORK_QUEUE.md`
8. `docs/ARCHITECTURE.md`
9. `docs/MULTILINGUAL_MODEL.md`
10. `docs/AGENT_OPERATING_MODEL.md`
11. `docs/EXPERIMENT_PROTOCOL.md`
12. `docs/EVALUATION_PROTOCOL.md`
13. `docs/DATASET_POLICY.md`
14. `docs/LOCAL_MODEL_WORKERS.md`
15. `docs/METRICS.md`
16. `docs/RELEASE_AND_EVIDENCE.md`
17. relevant ADRs and integration documents.

Also inspect:

- reachable commits and active branches;
- open pull requests and their CI status;
- existing experiment claims;
- existing reports, failures, and rejected experiments;
- dataset manifests and hashes;
- current work-queue state.

Do not duplicate active work or erase negative evidence.

---

## 3. Bootstrap and baseline

Run:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm agent:status
```

Do not start an experiment while the baseline is failing.

For every campaign environment, record:

- repository commit;
- Node and pnpm versions;
- operating system;
- CPU, GPU, RAM, and available resources;
- local model server and exact build;
- model identifier and quantization;
- context size and prompt/chat template;
- tokenizer identity;
- temperature, seed, timeout, and generation settings.

Use local OpenAI-compatible endpoints. Do not use paid APIs unless the maintainer explicitly changes this rule.

Configure a local model profile:

```bash
cp profiles/models/local-openai-compatible.example.json \
   profiles/models/<worker-model>.json

pnpm model:doctor -- \
  --profile profiles/models/<worker-model>.json
```

Never commit credentials.

---

## 4. Roles and authority

### Campaign coordinator

The coordinator audits the queue, assigns one atomic task at a time, tracks dependencies, prevents duplicate work, and maintains campaign status. It does not approve its own candidates or merge semantic changes.

### Worker agent

A worker:

- claims one work item;
- establishes the unchanged baseline;
- states one falsifiable hypothesis;
- modifies one main variable at a time;
- runs development evaluations;
- retains raw outputs and failures;
- pushes an `agent/...` branch;
- opens a draft PR;
- never merges its own semantic or safety-sensitive work.

### Evaluator agent

An evaluator:

- starts from a fresh context;
- pins the exact candidate SHA;
- does not change candidate implementation;
- verifies dataset and profile hashes;
- reproduces the documented commands;
- uses a different model or configuration when possible;
- runs holdout, adversarial, or product evaluation not used for optimization;
- publishes an independent report.

### Red-team evaluator

The red-team evaluator targets:

- nested and double negation;
- conditions, exceptions, and conjunctions;
- entity and reference confusion;
- quantities, units, dates, and time;
- modality, uncertainty, and ambiguity;
- prompt injection and role confusion;
- commands, paths, URLs, code, and exact quotations;
- fingerprint collisions and false equivalence;
- unsafe compaction and fallback failures.

### Reproducer

The reproducer uses a clean checkout, frozen installation, exact candidate SHA, and documented commands. It verifies that aggregate metrics can be recomputed from item results.

### Orchestrator

The orchestrator is a stronger model or human that compares worker, evaluator, red-team, and reproducer evidence. It may recommend merge, revision, rejection, or more evaluation. It must detect benchmark gaming and hidden regressions.

### Maintainer

The maintainer controls:

- `main`;
- protected datasets;
- schema and fingerprint releases;
- signing credentials;
- language/model support declarations;
- production rollout;
- final merges.

When only one physical model is available, use separate fresh sessions for roles and label the result:

```text
same-model role-separated evaluation; not fully independent
```

---

## 5. Campaign ledger and concurrency

Check for a machine-readable campaign ledger. When absent, create a small infrastructure PR adding:

```text
reports/campaigns/<campaign-id>/
├── campaign.json
├── status.md
├── decisions.jsonl
└── blockers.jsonl
```

Track:

- work-queue item and priority;
- area and dependency;
- worker and evaluator;
- branch and candidate SHA;
- experiment IDs;
- dataset hashes;
- model profiles;
- PR and CI status;
- outcome, blockers, and next action.

Concurrency limits:

- maximum three active implementation PRs;
- maximum one active implementation PR per area;
- maximum one active experiment per identical hypothesis.

A checkbox is complete only after the accepted change reaches the campaign base.

---

## 6. Phase zero: finish the campaign machinery

The initial runner executes parse and realization work. Before claiming full-area evaluation, complete these gaps through separate reviewable PRs.

### 6.1 Experiment task coverage

Add explicit, tested task support for:

- conformance;
- parse;
- realize;
- render;
- context;
- retrieval;
- integration;
- infrastructure.

Do not disguise unrelated experiments as parse or context work. Deterministic tasks must be allowed to run without a model profile.

### 6.2 Render and context runners

Implement executable evaluation for:

```text
Lunum-Sem -> Lunum-Code
natural context vs Lunum context vs mixed context
```

Measure exact target-tokenizer counts where possible. Clearly label rough estimates.

### 6.3 Schema and TypeScript drift

Add generated or checked types, CI drift detection, positive/negative conformance fixtures, and migration documentation so schemas and TypeScript cannot silently diverge.

### 6.4 Protected evaluator interface

Support protected evaluation through versioned manifests, hashes, licenses, evaluator instructions, and local paths or environment variables. Do not expose protected examples to worker loops.

A worker may not create its own visible dataset and call it protected.

### 6.5 Report validation

Validate that:

- baseline and candidate commits exist;
- dataset hashes match;
- model profiles are complete;
- item counts and failures are consistent;
- aggregate metrics are recomputable;
- generated reports were not manually altered.

---

## 7. Work areas and required evaluations

Proceed in dependency order, but continue with another unblocked area while a PR awaits review.

### A. Repository reliability

Complete:

- schema-to-TypeScript drift checking;
- clean-checkout reproducibility;
- report validation;
- campaign ledger;
- release provenance and checksums;
- signed-artifact preparation.

When signing keys are unavailable, mark the task maintainer-blocked rather than fabricating a signed release.

### B. Semantic contract

Develop and evaluate:

- semantic identity projection;
- annotation and provenance fingerprint rules;
- typed time;
- quantities and units;
- uncertainty and confidence;
- references and coreference;
- modality;
- conditions and consequences;
- canonical conformance vectors;
- property tests;
- fingerprint migration;
- collision and false-equivalence tests.

Required deterministic properties include canonicalization idempotence, object-key order independence, stable fingerprints for equivalent semantics, distinct fingerprints for protected semantic differences, renderer non-mutation, malformed-input rejection, and source/provenance retention.

### C. Multilingual parsing

Evaluate separately:

```text
English -> Lunum-Sem
Greek -> Lunum-Sem
Spanish -> Lunum-Sem
Indonesian -> Lunum-Sem
```

Start with English and Greek.

Report per language and semantic category:

- schema-valid rate;
- exact fingerprint rate;
- structural precision and recall;
- predicate and role preservation;
- entity and reference preservation;
- negation;
- conditions;
- quantities and units;
- time and modality;
- uncertainty;
- ambiguity detection;
- abstention or clarification behavior;
- latency and errors.

Never hide language-specific failures inside a global mean.

### D. Natural-language realization

Evaluate separately:

```text
Lunum-Sem -> English
Lunum-Sem -> Greek
Lunum-Sem -> Spanish
Lunum-Sem -> Indonesian
```

Start with English and Greek.

Measure protected literals, entities, numbers, units, dates, negation, conditions, target-language compliance, independent semantic equivalence, malformed outputs, and latency.

Round-trip evaluation is secondary only:

```text
Sem -> language -> Sem
```

### E. Renderers and tokenizers

Evaluate the initial English-pivot renderer and future safe, short, and tight profiles. For every model/tokenizer combination record exact model identity, quantization, tokenizer, prompt template, renderer version, natural/Lunum/mixed tokens, full-prompt tokens, downstream quality, latency, and failures.

No renderer is universally optimal.

### F. Context compilation

Compare:

1. natural context;
2. eligible Lunum context;
3. policy-gated mixed context;
4. no-context or unrelated-context controls where useful.

Measure task quality, instruction following, safety, fallback, exact token counts, latency, risk/category strata, and reversibility.

Safety constraints, commands, code, paths, quotations, ambiguous content, and unsupported semantics stay natural unless specifically proven safe.

### G. Retrieval and fingerprints

Measure exact retrieval precision/recall, multilingual paraphrase retrieval, false equivalence, false separation, collisions, entity/reference confusion, and near-semantic retrieval.

Keep near-semantic fingerprints separate from exact semantic identity.

### H. Product adoption

Complete and evaluate:

- packaged OpenUnum adapter;
- OpenUnum shadow mode;
- source preservation;
- migration and rollback;
- MCP/local service reference implementation;
- hook/plugin/CLI conformance reports;
- multiple independent adoption paths.

Integrations may not bypass product safety or natural fallback.

### I. Release readiness

Produce:

- compatibility matrix;
- language-direction matrix;
- model/tokenizer renderer matrix;
- integration conformance matrix;
- known-failure catalogue;
- migration guidance;
- evidence ledger;
- reproducible release report;
- checksums and unsupported-area statement.

Remain pre-1.0 while the semantic contract and compatibility guarantees are unstable.

---

## 8. Atomic experiment loop

Repeat this process for every work item.

### Step 1: synchronize

```bash
git fetch --all --prune
git status --short
```

Resolve unexplained local changes before continuing.

### Step 2: claim one item

Create `experiments/<experiment-id>/CLAIM.md` containing worker, role, area, exact queue item, branch, date, dataset, dependencies, and completion condition.

### Step 3: branch

```bash
git checkout -b agent/<worker>/<area>/<experiment-id> <campaign-base>
```

### Step 4: create the experiment

For supported tasks:

```bash
pnpm experiment:create -- \
  --id <experiment-id> \
  --area <area> \
  --task <task>
```

The manifest must contain one falsifiable hypothesis, baseline commit, dataset and hash, exact model profile where needed, target metrics, hard gates, budgets, output location, and stopping conditions.

### Step 5: unchanged baseline

```bash
pnpm verify
pnpm experiment:run -- \
  --manifest experiments/<experiment-id>/experiment.json
```

Preserve the baseline report.

### Step 6: one controlled candidate change

Prefer one major independent variable. Do not simultaneously change implementation, prompt, dataset, scoring, and gates.

### Step 7: candidate evaluation

Use the same dataset, hash, model settings, tokenizer, environment, and gates. Preserve failed and regressive runs.

### Step 8: deterministic validation

```bash
pnpm verify
```

Recompute aggregate metrics from item-level results.

### Step 9: evaluator pass

Use a fresh evaluator role and pin the candidate SHA. The evaluator does not edit implementation.

### Step 10: adversarial pass

Required for semantics, parsing, realization, rendering, context, retrieval, and integration work that could affect meaning or safety.

### Step 11: reproduction pass

Use a clean clone and frozen installation.

### Step 12: classify

Workers may assign only:

```text
NEEDS_WORK
REJECTED_WITH_EVIDENCE
BLOCKED
READY_FOR_EXTERNAL_REVIEW
```

Workers may not assign `APPROVED`, `SUPPORTED`, `PRODUCTION_READY`, or `MERGED`.

### Step 13: commit and push

Use small intent-based commits, for example:

```text
test(parse): add Greek negation baseline
feat(parse): preserve nested negation
eval(parse): publish qwen candidate results
docs(parse): record limitations
```

Do not force-push after an evaluator pins a commit.

### Step 14: draft PR

Every PR must identify:

- area and queue item;
- hypothesis;
- experiment ID;
- baseline commit and candidate SHA;
- dataset ID, count, and hash;
- model and tokenizer profile;
- environment and settings;
- baseline and candidate metrics;
- hard gates;
- raw outputs and failures;
- evaluator, red-team, and reproduction reports;
- exact commands;
- limitations;
- what the evidence does not prove.

---

## 9. Hard gates

A candidate fails promotion when it loses required source/provenance, entity identity, references, negation, conditions, exceptions, quantities, units, time, modality, uncertainty, safety constraints, exact-content fallback, fingerprint stability, or affected integration contracts.

Average gains cannot override one catastrophic protected failure.

Character count is not token count.

Normal chat-language ability does not prove support for parsing into Lunum-Sem or realizing from Lunum-Sem.

A model cannot be the only judge of its own output.

---

## 10. Budgets and stopping rules

Every experiment has explicit item, attempt, call, timeout, and optional wall-clock limits.

Stop and escalate when:

- the declared budget is exhausted;
- hard gates repeatedly fail;
- results oscillate without a clear non-dominated improvement;
- the candidate wins only by changing the benchmark;
- model, tokenizer, or environment metadata is missing;
- protected data is unavailable;
- credentials or signing keys are required;
- schema or fingerprint migration requires approval;
- semantic judgment cannot be decided mechanically;
- a conflicting PR changes the same contract;
- the baseline is red.

Do not evade a budget by opening a new experiment with the same hypothesis.

---

## 11. Campaign completion

Continue until every current work-queue item is merged, rejected with evidence, or explicitly blocked with a named dependency and owner.

Also require:

- green clean-checkout CI;
- no stale experiment claims;
- no hidden negative results supporting active claims;
- reproducible accepted reports;
- versioned model/tokenizer claims;
- language directions reported separately;
- evidence-linked support claims;
- current `STATUS.md`, `CHANGELOG.md`, and `WORK_QUEUE.md`;
- a final campaign report listing remaining research questions.

Do not claim Lunum is permanently finished. The valid completion target is the current declared milestone and work queue.

---

## 12. Status report after every cycle

Output:

```text
Campaign:
Base branch and commit:
Role performed:
Work area:
Work-queue item:
Experiment:
Branch:
Candidate SHA:
Worker model:
Evaluator model:
Dataset and hash:
Budget used:
Baseline metrics:
Candidate metrics:
Hard gates:
Failures:
Reproduction:
PR:
Status:
Blockers:
Next eligible task:
```

Then continue with the highest-priority unblocked task that does not conflict with active work.

Never autonomously merge semantic, fingerprint, protected-data, safety-policy, support-declaration, release, or production-serving changes.
