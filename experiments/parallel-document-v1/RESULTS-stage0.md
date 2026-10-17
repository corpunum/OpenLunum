# Parallel documents v1, Stage 0: results

**Run 2026-10-16, against [PREREGISTRATION-paid.md](PREREGISTRATION-paid.md) amendments 2 and 3 (commits `9cbe06a`, `f41d61f`). Cost $0 in money; ChatGPT quota for Luna and Sol. Self-reviewed.**

**Levels:** none reached. Levels (a), (b) and (c) needed an evaluable set; no extractor produced one.

| | |
|---|---|
| Items | the first 32 requests: passages 1 and 2 of the seeded Europarl selection, 8 EN + 8 EL sentences each |
| Per-item outcomes | [stage0-ledgers.json](stage0-ledgers.json) (no source text); scores in [stage0-structure.json](stage0-structure.json) |
| Raw outputs | kept outside the repository (they contain Europarl text) |

## Results

| Extractor | Role | EN covered | EL covered | Parse / abstain / invalid | Time | Quota |
|---|---|---|---|---|---|---|
| `supergemma4-Q5_K_M`, Ally, 64k | main (decides go/no-go) | **1 / 16** | **0 / 16** | 21 / 1 / 10 | 5.6 min/item (3 h) | — |
| `gpt-6-luna`, low | comparison | 4 / 16 | 1 / 16 | 7 / 25 / 0 | about 10 s/item | 3.08M input tokens |
| `gpt-6.1-sol`, medium | comparison (amendment 3) | **11 / 16** | **0 / 16** | 11 / 21 / 0 | about 18 s/item | 3.30M input tokens |

Covered = a valid parse with an `lfp:2.1` identity that is not a sentence copy. No extractor produced a sentence copy here.

## Decisions taken by the pre-registered rules

- **Stage 1: not run.** The rule was at least 4 of 16 Greek sentences covered by the main extractor; SuperGemma covered 0.
- **Level (b) judging: not run.** Nothing is evaluable, so there is nothing for the judge to compare.
- **ADR 0027 gate: not run** ([identity-heldout-v1 results](../identity-heldout-v1/RESULTS.md)): SuperGemma covered 1 of 16 English sentences, under the pre-registered 5.

## What failed, by extractor

- **SuperGemma:** 21 "parses", but only 1 received an identity; the rest were structurally invalid Sem (core accepts the tool call and reports `transportValid: false`). 10 items invalid: 3 timeouts, 2 HTTP errors from the Ally server, 5 submissions of a different source text than the sentence given (`SUBMITTED_SOURCE_MISMATCH`). A small model cannot follow this contract.
- **Luna (low):** every item valid; it mostly abstained ("unsupported", "unresolved").
- **Sol (medium):** every item valid. **11 of 16 English sentences covered, and all 16 Greek sentences abstained as "unsupported".**

## Reading

1. **The Greek limit is the contract, not the model.** The strongest extractor tried covers most English parliamentary sentences and no Greek one, and says why: unsupported. The general frames that reach ordinary sentences are English-only by design ([ADR 0024](../../decisions/0024-general-source-bound-frames.md)). Better or more expensive models cannot fix this; only a contract change (Greek frames, or language-neutral frames as in [ADR 0028](../../decisions/0028-language-neutral-concept-layer.md)) can, and that needs its own pre-registered held-out test (ADR 0025).
2. **English coverage depends strongly on the model:** 1, 4 and 11 of 16. Evidence from one extractor does not describe Lunum; it describes Lunum with that extractor.
3. **The owner's meaning-not-words test cannot be run on Lunum records yet**: with no Greek records there is nothing to compare. The meaning-preservation work that can proceed now is outside the contract: [pivot-paraphrase-v1](../pivot-paraphrase-v1/EXPLORATION.md).

## Stopped and earlier attempts (published as required)

- A Qwen/Halogen Stage 0 run (amendment 1) was stopped on the owner's instruction before its first item finished: no ledger row, nothing scored.
- Harness pilots, including two harness bugs found and fixed before Stage 0: [local-extractor-pilot-v1](../local-extractor-pilot-v1/RESULTS.md).
