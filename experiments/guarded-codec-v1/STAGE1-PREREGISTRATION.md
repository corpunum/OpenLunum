# Guarded codec v1, stage 1: pre-registered bars

**Written 2026-10-28, before any model call, and committed before the runner and the results.** Self-reviewed.
Owner direction (2026-10-28): advance stage 1 locally and cheaply (a local compressor, Haiku for model calls,
Luna-low for the runner).

## Question

Does a learned token pruner, guarded and verified by Lunum, shrink real OpenUnum prompts well beyond discourse
compaction **without** losing answerability, without breaking any invariant, and with exact expansion?

## Deviation from PLAN.md (recorded before any model call)

PLAN.md said stage 1 would reuse the frozen 42-question harness of compacted-context-graded-qa-v1. That run's
session list was not recorded and its `questions.json` lived in a temporary directory that no longer exists. Stage 1
therefore uses a **fresh, held-out selection** (below) and generates its own questions once, frozen before any
answer call. Sessions created before 2026-10-09 (the v1 export period) are excluded, so none of them overlap the
development data of earlier experiments.

## Data (private; only aggregates leave the rig)

- **Sessions:** OpenUnum `messages` rows (read-only export, `sqlite3 -readonly`), sessions with a first message on or
  after 2026-10-09 and at least 200 messages; the **15 largest by message count**, ties broken by session id.
- **Points:** the compaction points of `scripts/lunum-discourse-measure.mjs --dump-points` (OpenUnum) on that export;
  **12 points** drawn uniformly with seed `20261028` among points whose verbatim prompt is <= 150k estimated tokens.
- **Items:** up to **8** fact-recall items per point (seeded), with the v1 rule that dropped fragment items (a literal
  that is a substring of a larger token: UUID parts, directory fragments, path tails) — applied before generation.
- **Questions:** `claude -p --model haiku`, no tools, empty working directory, one question per item whose answer is
  the literal, without seeing it; questions containing the literal are rejected mechanically. Generated once, frozen in
  `questions.json` (mode 600, private), then used for every condition.

## Conditions (same points, same questions)

1. **verbatim**: the live default prompt (`off` view of the harness).
2. **discourse**: discourse compaction (`on` view).
3. **pruned**: LLMLingua-2 (`microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank`, CPU, rate **0.5**,
   force tokens: none) applied to every message of the verbatim prompt except the last 4 messages, unguarded.
4. **guarded**: the same pruner, with Lunum's guards (negators and modality markers are never removed) and
   `verifyCompaction` per unit; failing units are shown verbatim (fallback); omitted units carry a SHA-256 pointer.
5. **discourse + guarded**: condition 4 applied to the discourse view.

The pruner, rate and kept-tail are fixed here and not tuned on these points.

## Measures

- **Tokens:** the answering model's own `usage.input_tokens` for each (point, condition) call (primary), and the
  harness estimator (secondary).
- **Accuracy:** deterministic grading as in v1 — correct iff the answer contains the gold literal (case-insensitive for
  hex/identifiers, word-boundary for numbers); `unknown` is wrong; no model judge.
- **Invariant violations:** `verifyCompaction` on the output of each condition (counted for 3, 4, 5).
- **Expansion:** for 4 and 5, `expandCompaction` must reproduce every omitted or shortened unit byte-for-byte.

## Bars (all must hold for "pass")

1. **Savings:** the better of conditions 4 and 5 uses **at least 20% fewer input tokens than condition 2** (summed over
   the 12 points).
2. **Non-inferiority:** that condition's accuracy ≥ verbatim accuracy − **2 points** (over all items).
3. **Invariants:** **0** violations in the outputs of conditions 4 and 5.
4. **Expansion:** **100%** exact.

Reported regardless: all five conditions' tokens and accuracy, condition 3's violation count (how often the unguarded
pruner breaks meaning), accuracy split by literal-in-prompt, per-point table, cost.

If it passes, stage 2 (the Rust `lunum-codec` crate) starts. If bar 1 fails, the codec is not worth a Rust engine at
this compressor strength; if bar 2 or 3 fails, the guards or the unit granularity need work before anything else.

## Budget and models

Haiku (`claude-haiku-5-5`) for questions and answers; cap **$10** total. The compressor runs locally on the CPU. The
shared :8080 Halogen slot is not used. Runner implementation by a Luna-low worker, reviewed before the run.

## Limits

One answering model, one sample, agent-generated questions, deterministic containment grading (a correct paraphrase can
be marked wrong; it applies to every condition), self-reviewed.

## Amendment 1 (2026-10-29, before any model call)

1. **Points.** The dump has 85 points but only 19 carry fact-recall items; a uniform draw over all points would leave
   most without questions. Points are therefore drawn by OpenUnum's `lunum-graded-qa.mjs --stage questions` sampler
   unchanged: among points with at least one item and both prompts <= 150k estimated tokens, its own seed `20261008`
   (not `20261028`), 12 points, up to 8 items each, its fragment filter and its mechanical question check.
2. **Runner.** `stage1/run.mjs` and `stage1/prune.py` (rewritten after review; the first worker draft did not call
   `verifyCompaction`/`expandCompaction` and re-decoded subwords). Answer prompt and grading are copied unchanged from
   `lunum-graded-qa.mjs`; the answer stage records `usage` input tokens (input + cache creation + cache read).
3. **Compression details** (fixed now, not tuned): units are `segmentDiscourse` units; `sentence`, `list_item`,
   `heading` and `table_row` units are compressible, everything else (code, tool output blocks) stays verbatim, as do
   the last 4 messages. LLMLingua-2 keeps the top 50% of a unit's words by mean token "preserve" probability; the view
   joins the kept original words with single spaces. An empty view is an omission: the text shows `[omitted <ref>]`
   and the unit carries a SHA-256 pointer. Language per unit: Greek if it contains Greek letters, else English.
   Condition 3 is verified only for counting (no fallback); conditions 4 and 5 fall back to the verbatim unit on any
   violation.
