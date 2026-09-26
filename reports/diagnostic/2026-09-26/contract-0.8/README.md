# Contract `lunum-agent/0.8`: three repeated live runs

**Diagnostic development evidence, self-reviewed.** Setup:
- Claude Code with `claude-sonnet-5`, one fresh isolated process per item.
- Package v8: frame 0.3 (a permission needs a stated permitter, decisions/0010) and protocol 0.3 (verb aliases, decisions/0011).
- All 12 runs at commit `c89e7c6`, with the tracked tree clean at start and 0 run failures. Cost: $23.71.
- Scoring: V8 against the frame-0.2 successor targets; probes v1/v2 against their frame-0.2 expectations; probes v3 against its own expectations.
- Per-repetition numbers: `repeats-summary.json` (V8, v1, v2) and `probes-v3-rep*/outcomes.json`.

**Provenance note:** during V8 repetition 1, for under a minute (≈12:01 UTC), `packages/*/dist` was rebuilt from uncommitted work. Items launched in that window loaded a `tools.js` that differed from package v8 only in the `lunum_compile_context` mode list. That tool was not in the runs' allowed tools, and the core and extraction-tool artifacts were byte-identical throughout. `dist` was restored and re-verified against the v8 hashes at 12:01:47.

| | rep 1 | rep 2 | rep 3 | frame 0.2 runs (for comparison) |
|---|---|---|---|---|
| V8 source-relative (21) | 19 | 19 | 19 | 18, 18, 18 |
| V8 exact / comparable | 16/16 | 17/17 | 17/17 | 16/16 ×3 |
| V8 abstentions (3) | 3 | 3 | 3 | 3, 2, 3 |
| Probes v1: abstain / parse | 8/8, 12/12 | 8/8, 12/12 | 8/8, 12/12 | 8/8, 10–11/12 |
| Probes v2: abstain / parse | 6/6, 12/12 | 6/6, 12/12 | 6/6, 12/12 | 6/6, 10–11/12 |
| **Probes v3 (fresh): abstain / parse** | **5/5, 11/11** | **5/5, 11/11** | **5/5, 11/11** | — |

## Findings

- **The permission fix works.** No run produced the `allow`-with-permitted-party encoding. Fresh "X is permitted to Y" / `επιτρέπεται` / "may" sentences in probes v3 parsed with identity in every repetition.
  - V8 `g2-en-b` ("Once B-22 falls under 15%, System S-22 is permitted to…") is now refused in all three repetitions: a false abstention, the safe failure direction.
- **The verb aliases work.** Verb-only `allow`/`prohibit` sentences parsed in every run of every probe set, including the fresh v3 verbs (modify, remove, execute, inspect), in English and Greek. Verbs with no alias (print, whistle, download) were refused every time.
- **Still failing:** V8 `g6-en-b` "attempts on U-31" is typed `identifier`, not the profile's role default `task`, in 2 of 3 repetitions.
- **Contamination:** V8 and probes v1/v2 are in-sample for these changes. Probes v3 were frozen before the alias table, but by the same author.
