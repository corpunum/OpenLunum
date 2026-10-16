# Local extractor harness pilot v1 (pre-registration of a smoke test)

**Committed 2026-10-16, before any call. Self-reviewed. No claim is made from this pilot.**

## Why

The owner made free, non-Anthropic models available (2026-10-16): the local Qwen 3.8 Flash on Halogen, SuperGemma on the ROG Ally, and GPT-6 Luna through Codex. Paid Claude extraction needs budget approval; a local extractor does not. [`run-openai-compatible-source-only.mjs`](../../scripts/research/run-openai-compatible-source-only.mjs) is a new runner for OpenAI-compatible endpoints. It sends the Claude runner's prompt verbatim (pinned by a test), offers the same four Lunum tools, and checks the same package binding.

## What runs

- Extractor: `openai/qwen3.8-flash-next-uncensored-lean` at `http://127.0.0.1:8080/v1` (Halogen on the rig), temperature 0, package v23.
- Items: the **first 4 requests of clc-v1 S2** (`experiments/cross-language-convergence-v1/requests-s2.jsonl`), i.e. 2 English/Greek Tatoeba pairs already extracted and published by clc-v1. No held-out item is spent.
- Purpose: does the loop work (contract call, build, submit, final status), how long does an item take on the shared batch-1 server, and do the evidence gates classify the result.

## What will not be done with it

No coverage, stability or meaning claim. If the harness works, the parallel-document and held-out-gate pre-registrations are amended to name the extractor before any held-out item is run.

Cost: $0 (local).

## Pilot 2 (pre-registered 2026-10-16, before its calls): SuperGemma on the ROG Ally

The owner withdrew Halogen/Qwen for these runs (2026-10-16) and asked for **Luna (low)** and **SuperGemma on the Ally**. The Qwen Stage 0 run was stopped before its first item finished (no ledger row; outputs kept outside the repo).

- Extractor: `supergemma4-Q5_K_M` (a Gemma 4 fine-tune), llama.cpp b9222 on the ROG Ally, served by a **temporary dedicated server** (`lunum-supergemma-64k`, port 18085, `--ctx-size 65536 --jinja`) because one extraction needs about 50k tokens (the `lunum_build_candidate` input schema alone is about 35k Gemma tokens) and the Ally's shared router runs at 32k. Reached through an SSH tunnel; temperature 0; the same runner and package v23.
- Items: the same first 4 requests of clc-v1 S2.
- Purpose: does the loop work on this model, how long an item takes, and how many parses are sentence copies. No claim.
