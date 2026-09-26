# Frame 0.2 (`action` role): three repeated live runs

**Diagnostic development evidence, self-reviewed.** Setup:
- Claude Code with `claude-sonnet-5`, one fresh isolated process per item, as in the earlier runs.
- Package v6 (contract `lunum-agent/0.6`, frame `lunum-frame/0.2`), profile iteration 4.
- V8 is scored against the [frame-0.2 successor targets](../../../../experiments/natural-development-v8/frame-0.2-successor/README.md); probes against `private-expectations-frame-0.2.jsonl`.
- Per-repetition numbers: `repeats-summary.json` (`scripts/research/summarize-frame-0.2-repeats.mjs`). Cost: $18.50.

**Provenance:**
- Repetitions 1–2 ran at `1eaad78`, repetition 3 at `ac490f9`. Between the two commits only the renderer and benchmark code changed. The extraction-path artifacts bound by package v6 (`agent-native.js`, `frame-registry.js`, `tools.js`, `lunum-mcp.js`) were checked to be byte-identical.
- Repetition 2 records `workingTreeCleanAtStart: false`, because renderer edits were uncommitted when it launched. They were not on the extraction path.
- Repetition 1 has one run failure (unparseable final status), which scores as missing.

| | rep 1 | rep 2 | rep 3 |
|---|---|---|---|
| V8 source-relative (21 parse targets) | 18 | 18 | 18 |
| V8 exact / comparable | 16/16 | 16/16 | 16/16 |
| V8 abstentions (3) | 3 | 2 | 3 |
| Probes v1: abstain / parse | 8/8, 10/12 | 8/8, 11/12 | 8/8, 11/12 |
| Probes v2: abstain / parse | 6/6, 10/12 | 6/6, 10/12 | 6/6, 11/12 |
| Probes v2 `either` (prohibit … downloading) | abstain ×2 | abstain ×2 | abstain ×2 |

## Findings

- **Missing-argument refusals work.** Probe abstentions were 8/8 and 6/6 in every repetition. The "Dana allows Mira to access" rows now parse as `action: access` and match the successor targets.
- **Regression caused by the frame change:** "System S-22 **is permitted to** activate F-22" (and the Greek `επιτρέπεται`) is now encoded as `allow(agent: S-22, action: enable, theme: F-22)` instead of `enable` with modality `permission`. That makes the permitted party the permitter, and the paraphrase group stops converging. This costs 2 V8 rows in every repetition. It needs a rule: use `allow`/`prohibit` only when a permitting party is stated; otherwise the modality is `permission` on the action's own predicate.
- **Over-refusal on verbs the vocabulary lacks.** "Omar allows Priya to view." and "Lena allows Tomas to edit." were mostly refused as unsupported (9 of 12 verb-only allow cases across repetitions). The model does not map view→`read` or edit→`update`. That is the safe direction but loses meaning. An alias table built from these verbs would contaminate the probes, so it needs fresh probes.
- **Persistent typing miss:** `v8-g6-en-b` "attempts on U-31" is typed `object`/`identifier` rather than the profile's role default `task`.
