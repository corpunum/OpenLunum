# Candidate identity projection v1: offline, in-sample

**2026-10-16. No model calls. Self-reviewed.** The design was informed by the very data it is measured on: the v17 and cross-language-convergence-v1 split analyses. **This is in-sample evidence.** It is not a core change and not a new identity version. [ADR 0027 (proposed)](../../decisions/0027-identity-projection-candidate.md) sets the held-out run it must pass.

## The candidate

The projection is applied after core normalisation, to Sem that already receives `lfp:2.1`. [measure.mjs](measure.mjs) implements it.

| Unchanged | Folded |
|---|---|
| world | `kind`, reduced to a **mood class**: directive (command, instruction, plan_instruction, conditional_instruction, safety_constraint) or assertive (simple_fact, event, observation, project_state). Other kinds stay as they are. |
| predicate | A bare string filler counts the same as `{value: string}`. |
| negation and modality | `id` and `value` fold into one key, compared case-insensitively, with `_` treated as a space. |
| role names | Term types are dropped, **except** quantity, date, time, duration, percent and money, which keep their value, unit and format. |
| clause time | |
| conditions and consequences | |
| every filler's words | |

An earlier variant dropped `kind` entirely. In the repository it merged **across mood** (`command` with `simple_fact`, `command` with `event`). With no modality present, that turns "Restart X" (an order) into "X restarted" (a report): the Greek imperative/aorist case. Mood is therefore kept.

## Result ([result.json](result.json))

| Measure | `lfp:2.1` | Candidate |
|---|---|---|
| Same sentence, two runs: clc-v1 S1 against R2 | 4/12 | **8/12** |
| Same sentence, two runs: round-2 original against v17 | 7/12 | **11/12** |
| Cross-language pairs, clc-v1 S1 + S2 | 0/5 | **0/5** (canonicalisation does not translate) |
| Greek paraphrase pairs, clc-v1 S3 | 1/1 | 1/1 |
| Repository Sem with identity | 2,698 Sem, 407 distinct identities | 114 identities collapse into 47 groups |
| Collapses touching the adversarial, collision or contrast suites | — | **0** |

**What the 47 collapses contain:** these are within-mood kind labels, term-type labels, case or underscore differences, and id/value form. The spot-checked collapses are all the same words with different labels:
- `files` typed as `concept` and as `object`;
- `power_saving` typed as `feature` and as `concept`;
- `on-call team` written as `id` and as `value`;
- `green_tea` typed as `concept` and as `object`.

No homonym merge was found. The corpus has few homonym tests, so the absence proves little.

## Known risks

- **Homonyms told apart only by term type** (Apple the company and apple the fruit) would merge. The fix belongs in grounding (a resolved ID), not in a type label the extractor chooses inconsistently.
- **Case folding** would merge `US` and `us`. Folding could be limited to case plus underscore for multi-letter lowercase words; that is not measured here.
- **Cross-language identity is not addressed.** It needs a term-identity layer.
