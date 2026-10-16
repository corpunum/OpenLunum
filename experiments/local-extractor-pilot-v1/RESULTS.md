# Local extractor harness pilot v1: results

**Run 2026-10-16, 19:13–19:35 UTC, against the [pre-registration](README.md) (commit `af0f665`). Cost $0 (local). Self-reviewed. A smoke test: no coverage, stability or meaning claim.**

| | |
|---|---|
| Extractor | `openai/qwen3.8-flash-next-uncensored-lean` on Halogen (rig), temperature 0, package v23 |
| Items | first 4 requests of clc-v1 S2 (2 EN/EL Tatoeba pairs, already published) |
| Raw outputs | [`reports/independent-evaluation/2026-10-16-qwen-pilot/`](../../reports/independent-evaluation/2026-10-16-qwen-pilot/) (reasoning text not stored) |
| Commit and served artifacts | unchanged during the run |

## What worked

Every item followed the loop the prompt asks for: contract → build → submit (one also validated) → one final JSON status line. The contract binding, model-id check and source binding all passed.

| Item | Ledger | Correct reading |
|---|---|---|
| "He's not at all afraid of snakes." | invalid, `abstain_after_accepted_submission` | **valid abstention.** Core refused identity (pronoun-only subject) and the model then abstained. The runner was stricter than the Claude runner it mirrors; fixed after the pilot, with a test. The recorded ledger is not edited. |
| «Δε φοβάται καθόλου τα φίδια.» | parse | `assert`, action «φοβάται καθόλου», object «τα φίδια», negated. A poor structure: the verb is a filler. |
| "What is your blood type?" | parse | `topic`, subject = the whole question: **sentence copy** |
| «Ποιά είναι η ομάδα αίματός σου;» | parse | `topic`, subject = the whole question: **sentence copy** |

## Speed

Each item sends a ~46k-token prompt (the frozen v23 conventions and profile) plus the ~8.5k-token contract. Prompt caching works (46,400 tokens reused after the first item). At 46–56k context the model decodes **10–20 tokens/s** and writes 3–5k tokens per item, so **about 5 minutes per item** on the shared, batch-1 server. 320 items would take about 27 hours.

## Finding: sentence-copy parses, also in the recorded Claude evidence

A parse is a **sentence copy** when one filler carries at least 90% of the folded source ([`sentence-copy.mjs`](../../scripts/research/sentence-copy.mjs), with tests). Such a filler hashes the same on every run and never matches another language. It inflates run-to-run stability while representing no structure.

| Recordings | Parses | Sentence copies |
|---|---|---|
| Qwen pilot | 3 | 2 |
| **Claude, clc-v1** (s1e, s2e, s2e-rest, s3e, r2e, r2e-rest) | 75 | **12** |

In clc-v1, 8 of the 12 are Greek questions recorded as `topic` with the question copied, 2 are English questions recorded the same way, and 2 are one English sentence (in both runs) recorded as `describe` with the rest of the sentence as the attribute. **Part of clc-v1's low Greek coverage was degenerate.** This is post-hoc and does not change clc-v1's pre-registered verdicts (they were "not evaluable" or a failure), but every later stability and coverage result should report sentence copies separately. The 70% threshold, tried first, over-flagged legitimate short fillers ("I'm a vegetarian." → `vegetarian`) and was rejected before this was written.

## Consequences

- The runner works for local models and is usable for free extraction. It is slow on this hardware.
- Pre-registrations that use it must count sentence copies separately, and must not let them carry a stability bar.
