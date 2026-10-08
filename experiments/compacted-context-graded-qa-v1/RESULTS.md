# Model-graded QA of compacted vs live prompts v1: results

- **Bar:** [PREREGISTRATION.md](PREREGISTRATION.md), committed in `5c9b62d` before any model call.
- **Run:** 2026-10-08/09 on the owner's rig. The harness is OpenUnum `scripts/lunum-discourse-measure.mjs --dump-points` and `scripts/lunum-graded-qa.mjs`, on branch `feat/lunum-l1-recall`.
- **Data:** the same 15-session export (3,955 messages) and the same 52 compaction points.
- **Models:** questions and answers both came from `claude-haiku-5-5`, via `claude -p --model haiku` with no tools and no MCP servers, in an empty temporary working directory. The shared :8080 slot was not used.
- **Cost:** $0.11 for answers and $0.0125 for questions (plus $0.0137 for a discarded first question set, see the deviation below).
- **Review:** aggregates only, because the sessions are private. Self-reviewed.

## Deviation (recorded before any answer call)

The first question set used the harness QA items as drawn. Many of those items are fragments of larger tokens: "416" inside a UUID, "desk-20" inside a directory name, "/consume/restart" inside a path. The generated questions asked for substring trivia, such as "the 4-character section of the UUID".

That set was discarded before answering. Items are now kept only where the literal's first statement has it as a whole token. The seed, the point draw, the items per point and the bar are unchanged.

## Data actually used

| | Count |
| --- | --- |
| Points with QA items | 46 |
| Points excluded for a prompt over 150k tokens | 1 |
| Points drawn | 12 |
| Points with at least one whole-token item | 11 |
| Questions generated | 61 |
| Questions rejected by the mechanical check | 0 |
| Answer calls with missing answers | 0 |

## Results

| | off (live default) | on (discourse view) |
| --- | --- | --- |
| Mean prompt tokens at these points | 17,111 | 6,183 |
| Accuracy over all 61 items | **11 / 61 = 18.0%** | **11 / 61 = 18.0%** |
| Literal present in the prompt | 27 items | 35 items |
| Accuracy when the literal is present | 10 / 27 = 37.0% | 11 / 35 = 31.4% |
| Accuracy when the literal is absent | 1 / 34 = 2.9% | 0 / 26 = 0% |

On 4 points the discourse view answered fewer questions correctly, and on 2 points it answered more.

## Against the bar

The bar was accuracy(on) ≥ accuracy(off) − 3 points. The result is 18.0% against 18.0%, so it **passes**. The live `discourseContext.enabled=true` setting stands.

## What it shows beyond the bar

- **Exact-match presence overstates answerability.** The discourse view puts 8 more of these literals in front of the model (35 against 27) but yields one more correct answer. A literal that survives only in an "omitted units mention …" list, or after a clipped unit, mostly cannot be tied back to its question. This matches the caveat in OpenUnum's decision record.
- **Absolute accuracy is low in both conditions.** Many harness literals are line numbers, byte counts and job-id suffixes from tool output, and a reader without the full session cannot place them. This is a property of the item set, not of either view.

## Limits

- The sample is small: 61 items from 11 points. A 3-point difference is inside the noise.
- One model was used, and the questions are agent-generated.
- Grading is by literal containment.
