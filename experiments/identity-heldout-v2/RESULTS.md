# Identity-projection held-out gate v2: results

## Status 2026-10-17: PAUSED (usage limit); NON-VERDICT partial

Both Sonnet runs stopped on a provider error (usage limit) before finishing: run A completed 104 of 120 items (16 not run), run B 111 (9 not run). Commit, tree and served artifacts were unchanged. Per the [pre-registration](PREREGISTRATION.md), the remaining items are resumed with Sonnet after the reset; models are never mixed. **No verdict before 120/120 in both runs.**

Partial, not a verdict ([`score.mjs`](score.mjs)): 17 non-copy pairs covered in both runs, under the 20 needed. Stability is 14/17 (82%) for candidate v2, 12/17 for v1 and 6/17 for `lfp:2.1`. Sentence copies: 19 (A), 20 (B). Merges of distinct sentences: 0. Notional cost so far: $10.39 + $10.74.
