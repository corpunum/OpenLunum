# Claude Code on missing-argument probes v1 (2026-09-26)

**Out-of-sample diagnostic, self-reviewed.** The [probe set](../../../../experiments/probes-missing-argument-v1/README.md) was frozen before this run. It is AI-authored, and its Greek has not been reviewed by a human native speaker. Scoring is by outcome only (`outcomes.json`, from `scripts/research/score-probe-outcomes.mjs`).

Client, model and isolation as in the [v4 run](../claude-code-v4/README.md): commit `12d57c6`, package v4, profile iteration 3. Cost: $1.59.

| | Correct |
|---|---|
| Parse expected (argument stated) | **10/10**, all with core-issued identity |
| Abstain expected (argument missing) | 8/10 |
| Pairs with both sentences correct | 8/10 |

Both misses are the `allow` pair: "Omar allows Priya to view." and "Ο Omar επιτρέπει στην Priya να δει." The model filled the missing object with the complement verb (`theme: {"type": "task", "value": "view"}` and `{"type": "concept", "value": "see"}`). Core's placeholder rule only catches a filler that restates its own type or the predicate, so these passed.

The send, publish, enable, deploy and copy frames abstained correctly in every case. In one publish case the builder's `missing_required_role` rejection led to an abstention: the behaviour we want.
