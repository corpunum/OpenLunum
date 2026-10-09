# Ambient discourse view v2: results

- **Bar:** [PREREGISTRATION.md](PREREGISTRATION.md), committed in `6b45ad9`
  before the candidate was measured.
- **Run:** 2026-10-10. OpenUnum `origin/main` `ad49c659`, with this branch's
  core build copied over `src/memory/lunum-core/` and the candidate applied
  ([stepped-ambient.patch](stepped-ambient.patch); not merged into OpenUnum).
  Context limit 65,536.
- **Data:** read-only exports, kept private on the rig. Only aggregates are
  published, in [aggregates.json](aggregates.json).
  - Primary: the v1 held-out set (66 sessions, 271 messages), 32 points.
  - Fresh: 15 sessions with user turns after the v1 export (76 messages),
    20 points.
- **Review:** self-reviewed by the authoring agent (Claude).

## Against the bar (primary set)

| Bar | Live (discourse under pressure) | Stepped ambient view | Pass |
| --- | --- | --- | --- |
| 1. Prompt tokens at least 20% lower | 6,696 mean | 5,818 mean (**−13.1%**) | **no** |
| 2. QA literal recall ≥ live | 95/95 | 95/95 | yes |
| 3. Graded QA correct ≥ live (`claude-haiku-5-5`, the v1 frozen 42 questions at 13 points) | 24/42 | **21/42** | **no** |
| 4. p95 view time < 50 ms | 0.1 ms | 12.3 ms | yes |

**Result: fail on bars 1 and 3.** As pre-registered, the stepped view is not
added to OpenUnum, and no flag is added.

Bar 3 cost $0.06 in answers; the questions were the v1 frozen set. One answer
call returned a missing answer, which counts as wrong. The graded points had
4,881 (live) vs 4,661 (stepped) mean prompt tokens. A 3-answer gap on 42
questions is within the noise v1 already noted (bar 3 has low power), but the
bar is the bar.

## Measured, not gated: prompt-cache reuse

Reusable prompt prefix at the next user turn (primary set):

| Live | Stepped (v2) | Unstepped (v1 view, new core) |
| --- | --- | --- |
| 100% | **100%** | 33% |

The stepped boundary did what it was built for: no point lost its prefix at
the next turn. It paid for that with the tokens. The table below shows where
they went.

## Diagnostics

| Primary set | Live | Stepped (v2) | Unstepped (v1 view, new core) |
| --- | --- | --- | --- |
| Mean prompt tokens | 6,696 | 5,818 (−13.1%) | 4,252 (−36.5%) |
| QA literal recall | 95/95 | 95/95 | **95/95** |
| Points changed | 0/32 | 10/32 | 18/32 |
| Units dropped as duplicates | – | 180 | 2,268 |
| p95 view time | 0.1 ms | 12.3 ms | 8.3 ms |

- **Change 1 (path literals) works.** With the new core, v1's unstepped view
  keeps the literal it lost in v1 (95/95, was 94/95) at the same saving
  (−36.5%, was −36.6%). This set informed the fix, so that recall number is
  not independent evidence.
- **Change 2 (stepped boundary) removes most of the saving.** Most of v1's
  saving was duplicate units in older messages whose newest copy is in the
  verbatim window: 2,268 of them. The stepped prefix is planned without the
  tail, so it cannot drop those (180). The held-out sessions are short (about
  4 messages each), so for most points the boundary is still 0 and nothing
  before it is compacted.

Fresh set (underpowered: 20 points, 30 needed; reported only):

| | Live | Stepped (v2) | Unstepped (v1 view) |
| --- | --- | --- | --- |
| Mean prompt tokens | 7,321 | 7,068 (−3.5%) | 5,046 (−31.1%) |
| QA literal recall | 91/91 | 91/91 | 91/91 |
| Reusable prefix | 100% | 100% | 8% |

## What this means

- The path-literal fix is kept in core: it is independent of the ambient view
  and makes the live under-pressure view keep these spellings too.
- Cache stability and the duplicate saving pull in opposite directions when
  older messages are deduplicated against newer ones: the newest copy wins, so
  an old message's view changes whenever a newer message repeats it.
- A next candidate, not tried here because the bar is fixed: **first-shown
  wins.** Drop a unit from a newer message when an older, already-shown message
  states it (literals covered), instead of the reverse. Each message's view
  would then depend only on itself and older messages, so the whole history is
  append-only and prefix-stable without steps, and the duplicates are still
  dropped. It needs a planner option in core and a fresh pre-registration, and
  it changes what the model sees most recently (a pointer instead of the
  repeated text), which the recall bars must check.
