# Date/source-evidence and dataset-outcome milestone

**Decision: NOT READY for OpenUnum integration.** This is a deterministic
correctness milestone, not protected extraction/retrieval qualification.
Current contract 0.14 has **zero evaluated-parser calls** in this milestone.
Engineering subagent usage is not parser evidence or included in that count.

## Commits and scope

Starting continuation HEAD: `eace760811c880452d08501cf19d2feaa20c3171`.
Goal-start HEAD: `14c0ebc1e3db4cc99280778c14c12230790f95a3`.

- `a0f29fff315decc73b829bc5f15c3f7f15904ccc`: shared date/evidence-retention
  gate, explicit contract/instruction/runtime versions, regressions and ADR0018.
- `e7d7b1d5f6ca0f6284cad8af9007c9311b255e55`: parse/abstention type-runtime
  agreement and callers. This is the frozen implementation for these receipts.
- A separate evidence-only commit introduces this report and raw publications;
  its containing Git SHA, rather than a self-referential field, identifies it.

All work is OpenLunum-only on `main`. No branches, OpenUnum changes, compaction
work, persistence integration, model/service restarts or configuration changes.
Owner work is excluded. Publication remains blocked by the repository's
clean-tree-before-push rule: unrelated dirty files are preserved, not committed,
stashed or erased. Last fetch: `origin/main` remains
`14c0ebc1e3db4cc99280778c14c12230790f95a3`; no divergence at that observation.

## Independently reproduced defects

The [preserved first receipt](before-after.json) has four bounded source-path
cases. The [final frozen-generator receipt](before-after-v3.json) has eight,
with exact source text, candidate Sem, stage outcomes and hashes. The parent
reran the frozen generator into a distinct local receipt and inspected results.
Both generations use real runtime APIs, not invented provider outputs.

| Source-path case | Old candidate identity | Contract 0.14 identity |
|---|---|---|
| `30.11.2026` source, correct ISO Sem | Withheld incorrectly | Available, unpromoted |
| Valid date `2026-04-05` changed to `2026-05-04` | Available incorrectly | Withheld |
| Date `2026-04-05` masking an omitted independent quantity 5 | Available incorrectly | Withheld |
| Missing quantity 5, date has no component 5 | Withheld | Withheld |
| Base allow fixture with no omitted digit literal | Available | Available, same fingerprint |
| Date/id only in term evidence fields | Available, same base fingerprint | Withheld |
| Date/id only in surface-reference evidence | Available, same base fingerprint | Withheld |
| Combined term/reference evidence attack | Available, same base fingerprint | Withheld |

All eight fixtures pass wire and frame gates in both generations. Submission
and record creation are inspected separately. Every observed trust confidence
is **0** and every promotion flag is **false**. Fingerprint projections of all
eight unchanged Sem representations remain identical between implementations.
This does not prove source meaning, entity grounding or general parser quality.

The older runtime is a 17-module, manifest-hash-verified source-path closure.
An unused privacy module in the local baseline copy is deliberately mutated
for a separate test. **This is not whole historical runtime attestation.** The
current source modules bind by hash to the implementation commit above. Replay
requires a v15-matching baseline module directory, supplied with
`--baseline-dir`; a fresh output is exclusive and cannot overwrite evidence.

Earlier v2's generator hash no longer matches the final script; it is preserved
as superseded diagnostic evidence, not silently repaired. `before-after-v2-rerun.json`
and v3 do match the final generator. These are repeated deterministic cases,
not additional independent samples. Original sources/gold/model evidence are
unchanged.

## Architecture and compatibility

[ADR0018](../../decisions/0018-date-and-evidence-retention-boundary.md) describes
contract `lunum-agent/0.14`, instructions `agent-extraction-instructions/0.4`
and instruction/runtime package **v16**. No wire schema, registry, frames,
Sem date values or `lfp:2.1` identity projection changes. Dates are compared
separately from numeric quantities only in the source-retention floor.

Only Gregorian-valid ISO and unambiguous dotted day>12 full dates normalize.
Ambiguous/invalid/partial dates are not guessed; they fall through the existing
numeric floor. This is not universal ambiguity detection. Metadata, surfaces,
pronoun tokens and other identity-excluded evidence cannot satisfy an omitted
literal. Evidence is retained, not deleted.

The public DatasetItem type now requires nonnull gold for parse/legacy omitted
outcome, and explicit `abstain` with null gold. Permanent positive and negative
compile assignments agree with runtime preflight. The canonical audit loader
also rejects contradictory abstention metadata rather than silently dropping it.

Source-retention checks still do not certify roles, multiplicity, recurrence,
spelled-out literals, unit conversion, names or overall meaning. Candidate
identity is not promoted/durable trust. In-memory lifecycle policy tests are
not deployed storage or deletion acceptance.

## Verification and adversarial sensitivity

- `pnpm verify`: **4,437 passed**, 0 failed/skipped/cancelled; smoke 16 items,
  4 groups. Frozen-source log SHA-256:
  `62b4dcf2da0b76debef6c8219c2fde37722006ddce033a2c3162918228bd395d`.
  An additional exact ending-HEAD verification is recorded locally after the
  evidence commit; it is not represented by this earlier log hash.
- Focused DatasetItem/audit-loader/gold-preflight tests: **11/11**.
- [Twelve actual runtime weakenings](mutation-report.json): **12/12 caught**
  through assertion failures, not imports or syntax errors. This includes
  trust, risk, lifecycle, retrieval routing/leakage, gold validity, runtime
  closure and the three new date/evidence/ambiguity attacks.
- [Type weakening](../dataset-outcome-contract-v1/mutation-report.json): the
  unmodified copy compiles; allowing null parse gold produces **two** unused
  negative-assignment directives. This is one type mutation, not two mechanisms.
- [Real local stdio MCP preflight](preflight.json): provider calls **0**, served
  contract and artifact binding pass; all **93** repository-owned served JS
  artifacts are bound. This is not whole-host/dependency-chain attestation.
- `git diff --check` passes. All **39** snapshot-bound nonruntime owner files
  remain byte-identical. Background runtime files are never restored or altered.

Runtime mutation TAP publications replace the absolute repository prefix
in stack traces with `<REPO>/` and remove diagnostic trailing whitespace for
`git diff --check`. [Publication hashes](tap-publication-v2.json) bind raw local
originals and these normalized copies; assertions and outcomes are unchanged.
The first publication manifest is superseded, not raw measurement evidence.
The first type-harness report is also preserved: it erroneously
expected tsc exit 2, while installed tsc 7.0.2 exits 1 for no-emit diagnostics.
Both required negative-assignment errors were present even then. The corrected
harness requires those exact errors and excludes missing-module/syntax failures.
No model result or gold was changed to fix these harness/compatibility issues.

## Existing corpus preflight, not a new protected experiment

[All original corpus hashes remain unchanged](unchanged-corpus-audit.json).

| Historical corpus | Rows / parse gold | Invalid before | Invalid now |
|---|---:|---:|---:|
| Stage3 historical | 54 / 48 | 30 | 30 |
| Stage3 v2 | 66 / 54 | 48 | 48 |
| Fresh-v1 from September | 56 / 52 | 1 | **0** |
| Contaminated fresh-v2 | 77 / 71 | 5 | 5 |

Fresh-v1's sole mechanical rejection was the dotted-date checker defect.
Passing its current mechanical gate is **not** fresh held-out generalization,
human/native source adjudication or proof that all annotation meanings are
correct. The contaminated corpus remains diagnostic-only. None was changed,
relabelled, or rerun through a provider.

Current-contract per-language extraction, Greek↔English protected retrieval,
embedding baseline and noisy near-threshold qualification are **NOT RUN**.
Threshold 0.80 remains experimental. The prior three-call Luna 0.13 development
pilot is preserved separately; it is not qualification of this changed runtime.

## Luna workers and parent review

All engineering workers used `gpt-6-luna`:

- Dewey: date/calendar/boundary regression fixtures.
- Volta: independent evidence-only laundering audit.
- Fermat: additive unchanged historical review/scoring bindings.
- Pascal: DatasetItem type/runtime parity and compile-negative tests.
- Lagrange: disjoint test-caller integration and narrowing.
- Rawls: hash-bound historical/current raw source-path reproductions.

The parent decided scope/architecture, inspected changes and raw failures,
corrected weak counterfactual/reproduction methodology, reran APIs, reviewed
all relevant sources and ran canonical verification. These are model-engineer
reviews, **not human/native certification**.

## Readiness impasse and next action

The same unresolved review/provider choices have persisted across three goal
turns while deterministic repairs continued. Those repairs are now verified.
There is no honest automatic action that can supply human language competence
or select/spend on an unagreed evaluation provider.

The smallest next prerequisite is an identified human/fluent Greek reviewer
for the [14 pending source-only cases](../meaning-human-review-packet-v1/README.md).
Then freeze newly independent protocol-conforming data against this candidate
and run under an explicitly selected actual model and approved budget. Native
review, provider selection and budget must not be impersonated by subagents.

The owner also needs to resolve publication policy: reconcile their existing
dirty work, or explicitly authorize a clean-tree exception for pushing only
verified agent commits. Nothing unrelated will be swept into a commit.

Until the fresh live extraction, cross-language retrieval and critical-negative
gates pass with valid provenance: **NOT READY. OpenUnum remains untouched.**
