# Ambient discourse view v1: results

- **Bar:** [PREREGISTRATION.md](PREREGISTRATION.md), committed in `0207d63`
  before the candidate was measured.
- **Run:** 2026-10-09. OpenUnum `origin/main` `bab64319`, with the measure
  script's ambient mode ([measure-ambient.patch](measure-ambient.patch);
  measurement only, not merged into OpenUnum). Context limit 65,536.
- **Data:** a read-only export, kept private on the rig. Aggregates only are
  in [aggregates.json](aggregates.json).
  - Held out: 66 sessions not among the 15 dev sessions, with user turns
    after 2026-10-08T05:20; 271 messages.
  - 32 points qualified (history of at least 4,000 tokens, at most 4 per
    session); the bar needed 30.
- **Review:** self-reviewed by the authoring agent (Claude).

## Against the bar (held out)

| Bar | Live (discourse under pressure) | Ambient view | Pass |
| --- | --- | --- | --- |
| 1. Prompt tokens at least 20% lower | 6,696 mean | 4,245 mean (**−36.6%**) | yes |
| 2. QA literal recall ≥ baseline | 95/95 (100%) | **94/95 (98.9%)** | **no** |
| 3. Graded QA correct ≥ baseline (`claude-haiku-5-5`, 42 frozen questions at 13 points) | 24/42 | 27/42 | yes |
| 4. p95 view time < 50 ms | 0.1 ms | 25.6 ms | yes |

**Result: fail on bar 2.** As pre-registered, the candidate is not
implemented in OpenUnum and no flag is added.

On bar 3, the graded QA cost $0.07. One answer call returned a missing
answer, which counts as wrong. The 13 graded points had smaller prompts
(4,881 vs 4,375 tokens) than the full point set.

### What failed

The one lost item was a two-segment path (`/word/word`) in a long assistant
message: 19.5k characters, the newest message before the current turn. The
view clipped it to 7.8k characters (107 units: 52 duplicates, 4 clipped). The
view keeps the last 4 messages verbatim only while each is under
`recentMaxChars` (8,000), so this message was compacted anyway.

The literal was lost because core's discourse literal extractor did not treat
that path as a literal, while the QA definition does. Bar 2 exists to catch
exactly this mismatch, which a model-graded bar cannot see.

## Reported, not gated

| Diagnostic (held out) | Live | Ambient |
| --- | --- | --- |
| Points where the view changed something | 0/32 | 18/32 |
| Reusable prompt prefix at the next user turn | **100%** | **33%** |
| Unit dispositions | – | 1,615 kept, 2,268 duplicate, 36 clipped, 43 omitted, 8 superseded |

**Prompt cache.** Moving the compaction boundary on every turn rewrites older
messages. Only 33% of a point's prompt survives unchanged into the next turn,
against 100% for the live path. On the batch-1 local server, that means
re-prefilling about two thirds of the history on every turn. The token saving
does not by itself establish a latency or compute saving.

## Development sessions (separate, not part of the bar)

The 15 dev sessions have 56 points; 30 of them are already under pressure, so
the live view acts at those.

| | Live | Ambient |
| --- | --- | --- |
| Mean prompt tokens | 10,872 | 9,340 (−14.1%) |
| QA literal recall | 61.9% | 61.3% |
| Reusable prefix | 45% | 37% |

## What this means for the directive

- Real traffic rarely reaches the 70% trigger: 85 of 11,349 iterations. The
  live discourse view therefore almost never acts, and turning it on at
  ordinary turns is where the tokens are (−37% held out).
- The two things blocking it are measured, not guessed:
  1. Literal coverage in the clip of an over-long recent message. Core's
     discourse literal extractor misses two-segment paths that the recall
     definition counts.
  2. Prompt-cache churn. A next iteration should move the compaction boundary
     in steps, not every turn. For example: compact only once at least N new
     messages have aged out of the verbatim window, and keep the
     already-compacted prefix byte-stable.
- Both are pre-registrable follow-ups. Neither was tried here, because the bar
  is fixed.
