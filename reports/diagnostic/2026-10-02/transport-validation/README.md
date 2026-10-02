# Actual wire validation: offline regression and compatibility evidence

Baseline: `7470a2322a686ee4d3d6558b77d31b20f7ea8b6c`, agent contract 0.12.
Candidate: contract 0.13, bound to the commit adding this report and to the
compiled artifact hashes in [audit.json](audit.json). Self-reviewed, with
Luna read-only architectural/adversarial review. **New model calls: zero.**

## Result

Round-2 e05 was wire-invalid but received identity under 0.12. The new actual
wire gate rejects it before normalization, with source retained, no Sem,
no fingerprint, and no trust promotion. A deliberate in-memory mutation of
the real submission implementation bypasses this check and reproduces the
old identity; the regression detects it.

The builder was also advertising envelope `world`/`kind` on nested clauses.
Its new 0.2 input schema correctly represents nested clauses. Typed quantity
and date constraints come from the same authoritative wire schema.

| Recorded parse rows across 37 tracked ledgers | Count |
|---|---:|
| Total parse observations | 556 |
| Identity under baseline 0.12 | 544 |
| Identity retained unchanged under 0.13 | 496 |
| Identity bytes changed | 0 |
| Old identities withheld for wire violations | 48 |
| New identities | 0 |
| Wire-invalid rows, including five already without identity | 53 |
| Frozen source-relative scorer matches | 176 |
| Those matches that are nevertheless wire-invalid | 38 |

The audit enumerates every withheld identity by file, row, handle and exact
diagnostics. These violations include `world`/`kind` on nested clauses and
`kind` on a root clause. Original ledgers, scores and evidence are unchanged.

## Interpretation

This boundary enforces an existing contract; it does not measure understanding
or prove that all rejected Sem lost source meaning. The schema and fingerprint
algorithm were not changed. The audit runs old submission source in memory
against unchanged protocol/frame/fingerprint helpers, with **empty source**
to isolate transport from source-literal retention. It includes repetitions
and earlier implementations, not 556 independent protected sentences.

The 38 wire-invalid historically scorer-matched rows invalidate any inference
from those match labels to complete transport conformance. They do not justify
rewriting historical language-quality scores. Contract 0.13 live extraction,
raw-text retrieval, embeddings and threshold calibration are **NOT RUN** here.
Meaning targets still have 14 unresolved sources. OpenLunum remains **NOT READY**
for OpenUnum integration.

Reproduce after building (stdout only, no provider):

```sh
node scripts/research/transport-validation-audit.mjs
```

An optional output argument creates a new file exclusively. The report's Git
addition commit and compiled hashes identify the measured implementation;
the baseline SHA and every input ledger hash are recorded in the JSON.

Tests additionally exercise recursive invalid fields, arrays, term/evidence
extensions, no mutation/defaults/coercion, cycles, accessor/proxy rejection,
grounding providers not being called on invalid input and builder parity.
