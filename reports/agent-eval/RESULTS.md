# Agent Model Evaluation — Results

**Date:** 2026-07-17
**Purpose:** Choose the best already-downloaded local model for the Pi autonomous worker loop, evaluated against a corpus of 280 real failures extracted from Pi session logs (`failure-corpus.json`).
**Environment:** llama.cpp router (`llama-qwen36.service`, :8080, models-max 3), 124 GB unified memory, evals run one model at a time with explicit unload between candidates; ComfyUI idle-gated; Pi loop paused for the window.

## Tier 1 — 12 single-turn tasks from real failures

Categories: TS type errors, edit precision, git state handling, protocol compliance, CLI hallucination, failure triage. Regex-scored at temperature 0.

| Model | Score | Mean latency | GTT after load |
|---|---|---|---|
| qwen3.6-40b-code (Q8, dense) | **12/12** | 62.9 s | 47.0 G |
| supergemma4-e4b (Q4_K_M) | **12/12** | 27.2 s | 18.7 G |
| qwen3.6-35b-a3b (MTP, Q6_K) | **12/12** | 20.8 s | 41.2 G |
| qwen3.5-122b-a10b (MXFP4) | **12/12** | 36.2 s | 75.8 G |
| qwen3-coder-30b-a3b (baseline) | 11/12 | **1.8 s** | 37.1 G |
| superqwen-agentworld-35b-a3b (Q8) | 11/12 | 16.0 s | 38.4 G |

Notes:
- The baseline coder-30b fails exactly one task: **verify-triage** (diagnosing stale compiled test files) — the same failure it exhibited repeatedly in production, requiring watcher interventions.
- Initial runs of the reasoning-format models (supergemma, 35b-MTP, 122b) returned empty `content` (answer stuck in `reasoning_content` / thinking budget); the runner now falls back to `reasoning_content` with max_tokens 4096. Scores above are post-fix.
- Latency for the reasoning models includes thinking tokens; coder-30b answers directly.

## Tier 2 — real agent runs (pi --print, sandboxed worktree, pushes blocked)

Task A: protocol compliance (create agent branch, add file, commit — never on base).
Task B: edit precision (change only the SECOND of two identical markers) + protocol.
Scoring 0–4 per task; corrected† for a harness quirk where the planted fixture commit made the base-untouched check unachievable — correction: a model that branched and committed on its branch gets the point.

| Model | Task A | Task B (corrected†) | Total | Wall time/task |
|---|---|---|---|---|
| qwen3.6-40b-code | 4/4 | 4/4 | **8/8** | ~4 min |
| supergemma4-e4b | 4/4 | 4/4 | **8/8** | ~1 min |
| qwen3.6-35b-a3b (MTP) | 4/4 | 4/4 | **8/8** | ~1 min |
| qwen3-coder-30b-a3b (baseline) | 4/4 | 1/4 | 5/8 | ~1 min |

The baseline's Task B failure is the production failure mode reproduced under controlled conditions: it made the correct edit but **committed directly on the base branch** instead of creating one — exactly the behavior that forced pre-commit/pre-push git hooks onto the repo.

122B skipped for Tier 2: no Tier 1 gain over 35B-class models, ~76 GB resident, slowest loads — not justified for a loop worker.

## Recommendation

**Switch the Pi loop worker to `openai/qwen3.6-35b-a3b` (MTP).**

- Perfect Tier 1 + Tier 2, including the protocol and triage tasks the current model fails in production
- MTP speculative decode keeps it fast (~1 min/Tier-2 task, same as the 30B)
- 262K context (loop prompts include AGENTS.md + WORK_QUEUE + claims; headroom matters)
- Similar memory footprint to the current model (41 vs 37 GB GTT)
- Already in the router preset and Pi catalog; the loop reads `PI_MODEL`, so the swap is one line

**Budget alternative:** `supergemma4-e4b` — identical scores at 18.7 GB GTT (frees ~20 GB for ComfyUI/brain co-residency), but 32K context is tight for long agent sessions.

**Two-stage option (not yet implemented):** 40b-code or 122b as a once-per-day planner that picks/sequences queue items, with the 35B as the implementation worker. Only worth building if the 35B still shows judgment gaps after a week in the loop.

### How to adopt

```bash
# one-off
PI_MODEL=openai/qwen3.6-35b-a3b nohup bash scripts/pi-loop.sh /home/corpunum/OpenLunum > reports/pi-loop/nohup.log 2>&1 &
# or export PI_MODEL in the service/launcher that starts the loop
```

## Reproduction

```bash
node scripts/agent-eval/extract-failures.mjs
node scripts/agent-eval/run-eval.mjs --models "<model,...>"       # Tier 1
bash scripts/agent-eval/run-tier2.sh <model> [...]                # Tier 2
```

Raw outputs: `tier1-results.json`, `tier2-results.jsonl`, `tier1-run.log`, `tier1-rerun.log`, `tier2-*.log` (this directory).

## What this does not prove

- Tier 1 is saturated at 12 tasks — it separates the baseline from the winners but not the winners from each other; Tier 2 has only 2 tasks per model.
- Single-run, temperature 0 for Tier 1; pi runs are single-sample. No variance estimates.
- Canned Tier 2 tasks are far simpler than real queue items; long-session behavior (context pressure, multi-file edits) is not measured.
- Scores say nothing about Lunum semantic quality — this evaluates the *worker harness* behavior only.
