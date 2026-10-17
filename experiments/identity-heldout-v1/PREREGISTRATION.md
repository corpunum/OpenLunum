# Identity-projection held-out gate (ADR 0027): pre-registration (binding with amendment 1)

**Drafted 2026-10-16. No model has seen these sentences. Self-reviewed.**

**Status: binding since amendment 1 (below), which replaces the paid extractor with a free one.** Originally: it would become binding when the owner approves the budget and answers the open items, and an amendment commit records them. Nothing is run before that commit. Frozen versions stay frozen ([ADR 0025](../../decisions/0025-contract-freeze-pending-held-out-evidence.md)); this run changes none of them.

## Question

[ADR 0027](../../decisions/0027-identity-projection-candidate.md) proposes a canonical identity projection (`lfp:2.2`). In-sample it raises same-sentence stability from 4/12 to 8/12 and from 7/12 to 11/12. **Does that hold on sentences nobody tuned on?**

**Level (c), exact identity** (same sentence, two runs). It says nothing about cross-language meaning.

## Data

- [`select.mjs`](select.mjs) (deterministic, seed `idgate-heldout-v1:2026-10-16`) takes **160** English Tatoeba sentences of 4 to 20 words from the repository's CC-BY export, ranked by `sha256(seed:sentence)`.
- A sentence is **skipped** if its text appears anywhere in the tracked repository (probes v1–v4, rounds 1–2, V8, clc-v1, tests, docs, reports). 3 of the first 163 were skipped. Total of 8,491 eligible sentences.
- Output: [`requests.jsonl`](requests.jsonl) (source-only requests bound to package v23, contract hash `b6fdda4c…3ab6`) and [`selection.json`](selection.json). Sentences are Tatoeba CC-BY text; the export is already in the repository.

## Procedure

1. A one-sentence runner pilot first (the runner's own rule), then a 5-sentence pilot to confirm the pipeline. Pilot items are **dropped from the sample** and their cost published; they are not rerun.
2. **Two runs** of all 160 sentences, each in its own clone at the same commit, one fresh process per sentence, package v23, exact model ID recorded, no commit while a run is in progress. Run A and run B are never given each other's output.
3. Offline scoring with [`score.mjs`](score.mjs). Its projection is copied unchanged from [`identity-projection-candidate-v1/measure.mjs`](../identity-projection-candidate-v1/measure.mjs) and **validated**: on the clc-v1 recordings it reproduces 12 pairs, 4 equal under `lfp:2.1` and 8 equal under the candidate (the figures in the ADR).
4. Invalid items (including `CONTRACT_UNBOUND`) count as not covered and stay in the denominator.

## Bars (from ADR 0027, unchanged)

All three must hold for the gate to pass.

| # | Bar |
|---|---|
| 1 | **Candidate stability at least 90%**, over sentences covered in both runs, with **at least 20** such sentences. Below 20 the verdict is "not evaluable (coverage)", not a pass. |
| 2 | **0 merges in the adversarial, collision and contrast suites**: rerun `identity-projection-candidate-v1/measure.mjs` at the run commit; any collapse touching those files fails. |
| 3 | **Every candidate merge on the held-out set is judged the same meaning by the owner.** A merge = two or more distinct sentences with distinct `lfp:2.1` and the same candidate identity (the same sentence under two labels is the stability fix itself, not a merge). `score.mjs` lists them for review. |

`lfp:2.1` stability is reported next to the candidate's. If the gate passes, `lfp:2.2` is implemented with golden vectors, migration notes and a replay; if it fails or is not evaluable, nothing changes and the result is published.

## Sample size and the evaluability risk

clc-v1 English coverage was 11/40 to 13/40 per run, and in S1 (80 sentences, 40 of them Greek with 2 to 3 covered) 12 sentences were covered in both runs, so roughly 10 of 40 English. At that rate **160 sentences give roughly 25 to 40 covered in both runs**, which clears 20 but not by a wide margin. There is a real chance (my judgement, not a computed figure: about one in four) of landing under 20. If so, the run is "not evaluable"; the sample is **not extended after seeing coverage**. A second set needs a new seed and its own pre-registration. 160 is a sizing decision made before running; going larger costs proportionally more.

## Cost and budget

clc-v1 S1 cost $10.85 and $9.98 for 80 items per run, so about **$0.13 per item** on short sentences. Two runs of 160: **about $42**; with the pilots, about $45.

The runner reserves every item's ceiling against the approved total before launch, and an overrun invalidates the run. With the $0.80 per-item ceiling the handoff recommends, **each run needs a $128 reservation** (160 × $0.80). Expected actual spend is about $21 per run. The reservation is not the spend.

## Prediction (written before running)

- Candidate stability on the held-out set will be **below the in-sample 8/12 to 11/12**, as selection effects wear off. I expect 65% to 85%, so **bar 1 (90%) is more likely to fail than pass**. The in-sample figures were used to design the candidate.
- Bar 2 is a repeat of an offline scan and should hold. Bar 3 will probably involve few or no merges.

## Open items for the owner

1. **Budget:** approve two runs of 160 with a $128 reservation each (expected spend about $45 in total), or choose a different size.
2. **ADR 0027 says "English sentences that need no general frame".** Recorded Sem carries no general-frame marker, so this cannot be applied mechanically before the run. I propose the unfiltered sample (all English sentences of 4 to 20 words) and that results are reported with that caveat. Say if you want a different filter.
3. **Merge review:** if bar 3 has merges, you judge them (a short list of sentence groups).

## Amendment 1 (2026-10-16, committed before any model call on these sentences): free local extractor

**This amendment makes the pre-registration binding.**

- **Extractor:** `openai/qwen3.8-flash-next-uncensored-lean` (local Qwen 3.8 Flash on Halogen), temperature 0, through [`run-openai-compatible-source-only.mjs`](../../scripts/research/run-openai-compatible-source-only.mjs) (the Claude runner's prompt verbatim, package v23, item timeout 900 s). Cost $0. The pilots in "Procedure" are replaced by the harness pilot already done ([local-extractor-pilot-v1](../local-extractor-pilot-v1/RESULTS.md), on clc-v1 items, so no held-out item is spent).
- **Size:** the **first 120** requests of `requests.jsonl` (fixed now), not 160. Reason: about 5 minutes per item on the shared server, so two runs take about 20 hours instead of 27. The evaluability risk rises; it is accepted and stated here.
- **Runs:** run A, then run B, one after the other (the server is batch-1), each from a clean clone at the same commit.
- **Sentence copies:** bar 1 is computed on sentences covered in both runs **where neither parse is a sentence copy** (at least 90% of the source in one filler; [`sentence-copy.mjs`](../../scripts/research/sentence-copy.mjs)). Such a filler is stable by construction and would pass the bar for free. Stability over all pairs and the copy counts are reported as well. The at-least-20 requirement applies to the non-copy pairs. [`score.mjs`](score.mjs) implements this; on the clc-v1 recordings it gives 7/11 non-copy (8/12 over all pairs).
- **Scope of a pass:** it qualifies the projection **for this extractor**. ADR 0027 was designed on Claude outputs; a Claude run would still be needed before claiming it in general, and needs a budget.
- **Open item 2 (general-frame filter):** not answered yet. The sample is used unfiltered, as proposed, and results carry that caveat.
- **Prediction unchanged:** bar 1 more likely to fail than pass. New risk: Qwen produces many sentence copies (2 of 3 in the pilot), so "not evaluable" is now the most likely single outcome.

## Amendment 2 (2026-10-16, before any call on these sentences): SuperGemma, conditional on coverage

Supersedes amendment 1's extractor. The owner withdrew Halogen/Qwen and asked for Luna (low) and SuperGemma on the ROG Ally; Luna's quota rules out 240 extractions.

- **Extractor:** `supergemma4-Q5_K_M` on the Ally (temporary 64k server, temperature 0) through [`run-openai-compatible-source-only.mjs`](../../scripts/research/run-openai-compatible-source-only.mjs); the first 120 requests, two runs, as in amendment 1.
- **Feasibility rule, new, fixed now:** the two runs (about 8 to 20 hours of the Ally) start **only if** SuperGemma covers **at least 5 of the 16 English sentences** of parallel-document Stage 0 (non-copy, with an identity). That is a different, already pre-registered set; this gate's sentences stay unseen. Below that rate, 120 sentences cannot give 20 non-copy pairs covered twice, and the gate is recorded as **"not run: extractor coverage too low"**, which is published.
- Everything else in amendment 1 stands (bars, copy exclusion, scope: a pass qualifies the projection for this extractor only).

## Amendment 3 (2026-10-17, before any call on these sentences): run the gate with Sol

**Owner decision (2026-10-17, about 10:00 local, relayed by the orchestrating session corpunum-6b):** the gate is approved, run with Sol 6.1 at medium effort (Luna medium if quota bites). Amendment 2's feasibility rule was written for SuperGemma; on parallel-document Stage 0, Sol covered 11 of 16 English sentences, above that rule's threshold of 5.

- **Extractor:** `gpt-6.1-sol`, reasoning effort medium, through [`run-codex-source-only.mjs`](../../scripts/research/run-codex-source-only.mjs) (shell, web search and other MCP servers off; only the four Lunum tools; package v23).
- **Items:** the first 120 requests of `requests.jsonl`, as in amendment 1. **Run A and run B** in two clean clones at the same commit, at the same time; neither sees the other's output.
- **One model per gate.** If Sol's quota stops a run, the remaining items are resumed with Sol after the quota resets (a "rest" directory, as clc-v1 did). The gate never mixes extractors; switching to Luna means starting both runs over with Luna and reporting the Sol attempt as stopped.
- **Bars unchanged:** candidate stability ≥ 90% on at least 20 sentences covered in both runs where neither parse is a sentence copy; 0 merges in the adversarial, collision and contrast suites (rerun `identity-projection-candidate-v1/measure.mjs`); every candidate merge of distinct sentences judged the same meaning by the owner. The owner has delegated judgements of this kind to models (2026-10-17); if merges occur, they are listed for him and the delegated judgement is labelled as such.
- **Scope of a pass:** qualifies the projection for Sol as extractor; ADR 0027 was designed on Claude outputs, so this is a held-out test on a different extractor, which is stronger evidence against overfitting, not weaker.
- **Cost:** ChatGPT quota, about 100k input tokens per item, about 24M for 240 items.
- **Prediction (unchanged):** bar 1 more likely to fail than pass.
