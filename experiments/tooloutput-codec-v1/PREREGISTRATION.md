# Tool-output codec v1 — pre-registration

**Status: preregistration only. No codec runner, model call, or experiment run is authorized by this document.** Written 2026-10-29 before any model call. The only execution so far is the deterministic, aggregate-only measurement script alongside this file.

## Question

Can a deterministic, lossless-by-pointer tool-output codec reduce input token use by at least 20% beyond discourse compaction, while preserving answer accuracy, all Lunum invariants, and exact expandability?

## Data and freeze

Reuse exactly the 12 stage-1 points selected by `experiments/guarded-codec-v1/stage1/run.mjs` and their frozen discourse views `~/lunum-runs/codec-s1/private/stage1/views/*-discourse.json`. The matching stage-1 questions and literals remain in the private run directory and are not copied into this repository. No new selection from these points and no tuning on their evaluation answers. Any tuning or threshold choice uses a separate, held-out development set, not these evaluation points.

Stage 1 found only about 14 of 44 questions answerable in the discourse view (answer literal present); its accuracy result therefore has weak power. Before answering any condition in this experiment, generate one fresh set of questions targeted specifically at facts present in tool outputs, using Haiku once, without exposing the gold fact in the question. Freeze questions and golds privately; mechanically reject questions that contain the gold literal. Report answerable denominators and accuracy on all items and on answerable items. The new set is evaluated in every condition, unchanged. It must be generated only after owner/Claude review and approval of this preregistration; no generation is part of this measurement/pre-registration task.

## Measurement-only baseline (already run)

`node experiments/tooloutput-codec-v1/measure.mjs` reads the same private stage-1 discourse-view path and outputs aggregates only. It inspected **12 views**, classifying **495 signature-matched lines**. By character share of classified lines: code 70.80%, shell output 15.62%, JSON 13.06%, other 0.52%; log, stack trace, file listing and diff were 0%. By deterministic Unicode word/punctuation token estimate: code 69.46%, shell output 18.99%, JSON 11.17%, other 0.38%; other types 0%. This is a signature-based measurement: unmatched lines and prose are excluded, so these shares describe the classified subset, not the entire prompt. Token estimates are not Haiku tokenizer counts. Stage 1 separately reported 181.5k discourse-view characters, of which 73% were code/tool output; the measurement's strict signatures undercount many outputs and are not ground-truth labels. Keep all private content under `~/lunum-runs`; only these aggregate results may leave that directory.

## Fixed transforms (deterministic; no learned/model-based compression)

The following transform list and parameters are frozen for the confirmatory run. Apply only when the complete source unit is stored under a SHA-256 reference and can be expanded byte-for-byte. Never rewrite source literals or silently discard bytes. Unit boundaries and type recognition must be deterministic and documented in the runner. Ineligible or ambiguous units remain verbatim.

1. **Repeated log lines:** within one contiguous log block, replace repeated identical lines with a marker containing the exact line and repetition count; preserve order and all non-repeated lines.
2. **Stack traces:** for traces of at least 6 frames, show first 2 and last 2 frames plus exact omitted-frame count and pointer. Shorter traces remain verbatim.
3. **JSON:** for objects/arrays over 1,000 UTF-8 bytes, render a deterministic schema/type summary plus fields mechanically referenced later in the same conversation; retain the complete original behind pointer. If reference extraction is ambiguous, keep verbatim. No model-based field selection.
4. **Repeated file listings:** collapse exact duplicate path lines in a contiguous listing to one path plus count; preserve first-occurrence order and pointer.
5. **Diffs:** collapse exact repeated hunks only; preserve first occurrence and hunk count/pointer. Do not summarize or synthesize a changed hunk.
6. **Long shell output:** for blocks over 2,000 UTF-8 bytes, show first 1,000 and last 1,000 bytes, plus omitted byte count and SHA-256 pointer. Boundaries must be valid UTF-8 without altering retained bytes; otherwise leave verbatim.
7. **Code and other:** no lossy transform. Exact duplicate whole blocks may be deduplicated only within the same message, with an explicit pointer/count; otherwise verbatim.

Every transformed unit must pass the same deterministic `verifyCompaction` literal/negation/modality checks as stage 1; any violation causes verbatim fallback and is counted. All transformed output must expand byte-exactly from the local pointer store. No pointer may require network access.

## Conditions

Use the same points and frozen question set for all conditions:

1. **Discourse:** stage-1 discourse view, no new transform.
2. **Discourse + tool-output codec:** fixed transforms above, with guards/fallback and exact-expansion pointer store.
3. **Discourse + tool-output codec + stage-1 prose guards:** condition 2 plus the stage-1 guarded prose pruner at its fixed 0.5 rate, only on the same prose unit classes and with the same fallback rules. No parameter tuning on evaluation points.

## Measures

- Primary token measure: answering model reported Haiku `usage.input_tokens` (including cache creation/read tokens, consistent with stage 1), summed over points and questions per condition.
- Accuracy: deterministic stage-1 literal-containment grader; `unknown` is incorrect. Report all questions, answerable questions, and the fresh tool-output-targeted set separately.
- Invariants: count `verifyCompaction` violations; report pre-fallback and final counts.
- Expansion: compare every transformed unit after `expandCompaction` to original bytes; report exactness and failures.
- Also report fallbacks, transformed units by type, estimator token counts, cost and question/answer counts. Private per-item content and outputs remain outside the repository.

## Pass bars (all required)

1. At least **20% fewer input tokens than discourse** (condition 2 or 3, whichever is better, aggregated over points).
2. Accuracy no more than **2 percentage points below discourse** on the frozen question set, and report the tool-output-targeted subset separately.
3. **Zero** final invariant violations.
4. **100% exact expansion** of transformed units.

## Budget, limits, stopping rule

Total Haiku spend capped at **$5** for question generation and all answer calls. Stop before exceeding the cap; incomplete results are reported as incomplete, never extrapolated. One model, one sample, synthetic agent-generated questions, and deterministic containment grading may undercount correct paraphrases. The new target set improves coverage but does not establish broad real-world accuracy. The measurement classifier is heuristic and initial baseline subtype counts are not validated labels. The codec has no model-based transformations, no external pointers, and no claim of deployment readiness. No runner is included in this pre-registration; implement it only after owner/Claude review.

## Amendment 1 (2026-10-29, before any model call) — review by Claude

The measurement above shows the non-prose share is dominated by **code (~70%)**, mostly file contents read by tools;
shell output (~16–19%) and JSON (~11–13%) are minor and logs/stack traces/diffs/listings are 0%. With transforms 1–6
alone, even a perfect result on shell+JSON cannot reach bar 1 (~10% at most), so the run as written would fail by
construction. Changes, all still exact-by-pointer and deterministic:

1. **Transform 8 — cross-message code dedupe:** an identical code block (byte-exact, >= 400 bytes) that already
   appeared earlier in the conversation is replaced by a pointer to its first occurrence plus its line count.
2. **Transform 9 — superseded file reads:** when the same file path is read again later in the conversation, every
   earlier read of that path older than the last 4 messages is replaced by a pointer ("superseded by the read at
   message N"); the latest read stays verbatim.
3. **Dry estimate gate (no model calls):** before question generation, a deterministic script applies all transforms
   to the 12 frozen discourse views and reports the estimated input-token savings vs discourse (same estimator as
   stage 1). **The Haiku run happens only if the estimate is >= 25%** (a margin over the 20% bar for estimator error);
   otherwise the result is reported as "fails bar 1 by estimate" and the experiment stops at $0.

The pass bars, budget and everything else are unchanged.
