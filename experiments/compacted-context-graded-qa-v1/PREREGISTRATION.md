# Model-graded QA of compacted vs live prompts v1: pre-registered bar

Written 2026-10-08, before any model call, and committed before the results.

## Question

OpenUnum's `discourseContext` (ADR 0021 discourse records) passed an offline
gate by **exact string presence**: QA recall 30.2% → 38.5% with −55–70% prompt
tokens. Presence is not answering: a literal listed after an omitted unit has
less context than its sentence. Does a model answer questions about earlier
facts at least as well from the discourse-compacted prompt as from the live
default prompt?

## Data

The 15-session harness of `scripts/lunum-discourse-measure.mjs` (OpenUnum),
same export and the same 52 compaction points. For each point the harness
dumps both prompt views: **off** (live default: pressure cut + compaction +
exact dedup + wiki checkpoint + hard limit) and **on** (discourse view).

- Points: **12**, seeded (`20261008`) uniform draw among points whose off and
  on prompts are both ≤ 150k tokens (estimator of the harness). Points above
  are excluded and counted.
- Items: up to **8** per point, seeded draw from the harness's fact-recall QA
  items at that point (literals stated before the point and used again within
  60 messages, not restated in the current message). Every drawn item is kept
  whether or not its literal is in either prompt.

## Questions

For each item, the sentence (±240 chars) around the literal's first statement
is taken from the source message, the literal replaced by `____`. A model
(Claude Haiku via `claude -p`, no tools) writes one question whose answer is
the blank, without seeing the literal. Questions that contain the literal are
rejected mechanically. Questions are generated once, frozen, and used for both
conditions. Questions are the agent's model output, not human-written.

## Answering and grading

- Answerer: Claude Haiku via `claude -p --model haiku`, no tools, fresh
  process, empty working directory. One call per (point, condition) with all
  of that point's questions. The prompt renders the prompt view as a
  role-labelled transcript, then the questions; answer `unknown` if the
  conversation does not state it. JSON output.
- Grading, deterministic: correct iff the answer contains the gold literal
  (case-insensitive for hex/identifiers, word-boundary for numbers). `unknown`
  is wrong. No model judge.
- The shared :8080 Halogen slot is not used.

## Bar

- **Non-inferiority:** accuracy(on) ≥ accuracy(off) − **3 points** over all
  items. If met, the live `discourseContext.enabled=true` setting stands; if
  not, the result is reported as a regression and the recommendation is to
  turn it off pending a fix.
- Reported alongside: per-condition accuracy, accuracy split by literal-in-
  prompt (yes/no) per condition, points where on < off, tokens per prompt, and
  model cost.

## Limits

One answering model, one sample, agent-generated questions, self-reviewed.
Grading by literal containment can mark a correct paraphrase wrong (e.g. a SHA
answered as a shorter prefix); that error applies to both conditions.
