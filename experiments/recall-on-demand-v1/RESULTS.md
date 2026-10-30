# Recall on demand v1: results

**Run 2026-10-30. Self-reviewed.** As pre-registered in [PREREGISTRATION.md](PREREGISTRATION.md) at commit `a1443864`, with no amendment.
- Runner: [`run.mjs`](run.mjs); recall tool: [`recall-mcp.mjs`](recall-mcp.mjs).
- Aggregates are in [`results.json`](results.json). The transcript, questions and answers stay private (frozen transcript SHA-256 prefix `092628136d922c54`).
- Model: `claude-haiku-5-5` for questions and all answers. Total cost **$0.13** against an $8 cap.

## Verdict: FAIL (bar 2 missed by one question)

| # | Bar | Result | Verdict |
|---|---|---|---|
| 1 | Accuracy B ≥ accuracy A + 30 points | B **23 / 40 = 57.5%**; A **0 / 40 = 0%**; difference **+57.5 points** | **PASS** |
| 2 | Accuracy B ≥ 60% | **57.5%** (24 / 40 would have passed) | **FAIL** |

**Run details:**
- 10 points, 40 items, 40 questions generated, 0 rejected.
- 0 unparsed answer calls in any condition.

## All conditions

| Condition | Correct | Input tokens per call (mean, usage incl. cache) | Turns per call | Answer cost |
|---|---|---|---|---|
| A: budget view only | 0 / 40 (39 answered "unknown") | 16,357 | 1 | $0.030 |
| **B: budget view + `recall`** | **23 / 40 = 57.5%** | **77,485** (4.7× A) | 7 (1 to 13) | $0.059 (1.9× A) |
| C: oracle, source excerpts appended (reported only) | 23 / 40 = 57.5% | 17,229 | 1 | $0.031 |

A's 0% was predicted before the run: the literal was absent from its view by construction.

## Readings

1. **Recall worked as well as the oracle on this set.** B (the model searching for itself) and C (handed the right excerpt) both got 23 of 40.
   - They do not get the same items right: 19 are right in both, 4 only in B, 4 only in C, and 13 in neither.
   - So within this item set, the limit is not mainly retrieval. It is the items and questions, which neither condition can answer more than 58% of the time (see 3).
2. **Recall is not free.**
   - B used 4.7× the input tokens of A per call, mostly because every tool round trip resends the context. The worst point needed 13 turns and 173,508 input tokens.
   - In money it cost 1.9× A, because most of it was cache reads.
   - A budget view that is 30,000 characters smaller, but needs 5× the tokens when a fact is missing, is only cheaper if facts are rarely missing.
3. **Item quality caps both B and C.** This analysis is descriptive, done after scoring, and changes no verdict.
   - Core `literalSpellings` sometimes extracts a fragment rather than a whole fact: a relative prefix (`../…`, `.../…`), a partial file name, or a token such as `pre-1`. A correct full answer then fails the containment rule. In 2 of the 17 B misses, B gave the full path that the fragment came from. In 2 more, B gave the file name without the fragment's prefix.
   - Other misses are near-numbers (`0.9705` against `0.9735`), the wrong one of several similar manifests or package versions, and plain "unknown" (B 7, C 6).
   - **The oracle also invented a 64-character hash** instead of copying the one in its excerpt. Haiku can confabulate with the answer in front of it.
4. **What this does not show:**
   - That recall beats a larger budget.
   - That the deterministic term search is good enough on its own: B ties C here, but a production locator ([source-locator-v1](../source-locator-v1/RESULTS.md)) was not tested.
   - Anything about another model, another session or human-written questions.

## Limits

These are as pre-registered:
- one session, unusual in length and topic;
- synthetic questions from Haiku;
- one answering model;
- a simple term search;
- a stylised budget view.

Added after the run:
- **Small sample:** 40 items, so one question decides bar 2.
- **The grader** is the literal-containment rule, and the fragment literals described above count against both B and C.

## Next

The question for OpenUnum is not "can recall bring facts back" (it can, here at oracle level) but **when to pay for it**.

A follow-up should be pre-registered before it runs, with the grader fixed first: whole facts as items, not fragments. It should measure, on the same points:
- (a) a larger budget without recall against the 30,000-character budget with recall, at equal tokens;
- (b) the production locator in place of the term search.
