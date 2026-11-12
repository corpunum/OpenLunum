# gate-blindspots-v1: how often do meaning-changing edits still get an identity?

**Pre-registered 2026-11-12 (time in the commit), before any mutant is scored.** Deterministic: no model call, no judge, no network.

## Question

The cross-vendor review ([fact check](../cross-vendor-review-v1/gpt-6-luna-2026-11-12-CHECK.md)) showed with single probes that the deterministic gates check presence, not role or scope. This experiment measures how often that holds on real accepted records. The result is a rate, not a pass or fail. It sets the baseline any future role or scope gate must beat.

## Data

- The 139 records that contract 0.22 covered in [coverage-a3-v2](../coverage-a3-v2/RESULTS.md) (`bar2/covered.jsonl`), joined by handle to their English sources in `requests.jsonl`.
- **Originals:** the records that get an identity from `submitCandidate` at the current `main`, which includes the literal-retention fix `2e5d246d`. Only originals with an identity are mutated.

## Mutations (each applied once per original, where applicable)

Each meaning-changing mutation changes who does what, polarity, modality or mood. A faithful gate would refuse it, or would at least not issue the same kind of identity it issues for the original.

| ID | Mutation | Applies when |
|---|---|---|
| M1 | Swap the fillers of the first two filler-bearing roles of the first clause | 2 or more roles with different non-empty fillers |
| M2 | Flip `negated` on the first clause | always |
| M3 | Modality: absent becomes `possibility`; any other value becomes `possibility`, or `obligation` if it already was `possibility` | always |
| M4 | Mood: `kind` `question` or `command` becomes `simple_fact`; any other kind becomes `question` | always |

Controls, which the gates are meant to catch:

| ID | Mutation | Applies when |
|---|---|---|
| C1 | Drop the last filler-bearing role of the first clause | 2 or more filler-bearing roles |
| C2 | Replace the first filler with a word that is not in the source (`zebra`) | 1 or more filler |

A filler is a string, or the `value` or `id` of a term object. Roles whose value is not a filler (structured objects without `value` or `id`) are left alone.

## Measures

- For each mutation: applicable count, **issued rate** (mutants with a non-null `semanticFingerprint` over applicable mutants), and the refusal reasons of the refused mutants (`failureClass`, plus the first diagnostic code).
- The fingerprint of an issued mutant should differ from the original's. The script checks this, and any equal pair is reported.

## Expectations (stated before scoring)

- M1 to M4: issued rate ≥ 80% each. That is the blind spot.
- C1 and C2: issued rate ≤ 20% each. That is the gate working as designed.
- If a control issues above 20%, the gates are weaker than documented, and that is reported first.
- If a meaning-changing mutation issues below 50%, some existing gate catches it, and the gate responsible is named.

## What this does not measure

- Whether the *original* records are faithful. coverage-a3-v2/v3 cover that.
- Errors a model would actually make. The mutations are mechanical; they bound the gate's sensitivity, not the extractor's error rate.
