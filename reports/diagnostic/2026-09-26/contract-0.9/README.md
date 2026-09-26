# Contract `lunum-agent/0.9`: one live check

**Diagnostic development evidence, self-reviewed. A single repetition**: the account was near its weekly limit, so three repetitions were not run. Earlier repetitions moved by about one item, so read these as indicative.
- Claude Code with `claude-sonnet-5`, one fresh isolated process per item.
- Package v10 at `7657cab`, tracked tree clean, 0 run failures. Cost: $6.15.

| | contract 0.8 (3 reps) | **contract 0.9 (1 rep)** |
|---|---|---|
| V8 source-relative (21) | 19, 19, 19 | **20** |
| V8 exact / comparable | 16/16, 17/17, 17/17 | **18/18** |
| V8 false abstentions | 1, 1, 1 | **0** |
| V8 abstentions (3) | 3, 3, 3 | 3 |
| Probes v3 (16) | 16, 16, 16 | 16 |
| **Probes v4 (14, frozen before 0.9)** | — | **13** (parse 9/9, abstain 4/5) |

## Findings

- **The fix works.** The V8 "…is permitted to **activate** F-22" row now parses. Every unlisted synonym in probes v4 (switch on, shut off, purge, alter, kick off, Greek "θέτει σε λειτουργία") was mapped to the right predicate through the contract's general rule, not a table lookup. The unmappable controls (juggle, paint) were refused.
- **The one v4 miss is a flaw in the probe, not the model.** "Controller C-8 switches on." was expected to abstain (nothing to switch on). The model read it as intransitive, the controller turning itself on, and produced `enable(theme: C-8)` with that stated reasoning. That reading is valid English. The frozen expectation is left unchanged and the item is reported as a miss attributable to probe design.
- **Remaining V8 miss:** `g6-en-b` "attempts on U-31" typing, persistent across every configuration.
