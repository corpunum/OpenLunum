# Readiness goal: first verified safety milestone

Starting HEAD: `14c0ebc1e3db4cc99280778c14c12230790f95a3`.
Implementation: `1a8799b6a08df0abbf3011e6dfaf11bebbf2528c`, on `main`.
**Readiness decision: NOT READY. The goal remains active.**

## Confirmed runtime-path defects

The [baseline reproduction](baseline-reproduction.json) demonstrates that
record creation issued candidate identity after changing a source quantity
from 5 to 50; a shortened deletion plan deleted only the source yet reported
completion and forgot derivatives; a failed query was counted as a matcher
failure; and a throwing baseline received perfect negative rejection/top-1.
Nested destructive consequences and canonical obligation evaded risk checks.
These are deterministic path reproductions using historical source with current
built imported dependencies, **not a complete historical build or model run**.
Final inspection also found inherited property names accepted as privacy-enum
values and unavailable expected memories attributed to ranking failures.

## Changes and verification

- Record creation enforces actual transport shape and source literal retention
  before issuing source-bound candidate identity; missing literals prevent
  promotion while source evidence remains recoverable.
- Risk checks include canonical modalities and recursively inspect conditions
  and consequences. A heuristic confidence score is not a probability.
- Local deletion plans bind immutable lineage and all registered derivatives;
  async execution deletes derivatives first, preserves the source on failure,
  locks concurrent registration and retains retry state. This is an in-memory
  contract, not deployed deletion or portable authorization.
- Retrieval uses the real source-bound candidate submission API; private gold
  cannot enter raw rows or baseline inputs. Routing, common raw-pool confusion
  counts, identity coverage, conditional examined FPR, positive top-1, negative
  rejection and stage attribution are separate. Report version is `0.6.0`;
  historical reports remain unchanged and non-comparable where definitions differ.
- `pnpm verify` passed on the implementation tree: **4,415 tests, zero failures**,
  and smoke evaluation (16 items, four groups). Six deliberate weakenings were
  caught by assertion failures, not import/syntax failures. The canonical test
  command now runs this mutation gate. [Receipts](mutations/report.json) identify
  the pre-commit development parent and dirty-tree state; the target source
  contents were committed unchanged in the implementation above. TAP copies
  redact machine-local generated-copy/root paths and trim trailing whitespace
  for portability; original receipts remain unchanged locally.

The implementation preserves source → canonical semantics → stable identity →
measured rendering → safe use. No schema, registry, fingerprint projection,
renderer, model-server settings, external repository or running process was
changed. Compaction stayed parked. Owner edits were excluded from commits;
runtime markers/metrics were neither restored nor rewritten.

## Real model evidence and limits

The [three-call Luna development pilot](../luna-source-only-pilot-v1/README.md)
records actual `gpt-6-luna` session identity, source-only requests and final
builder responses. All three passed current candidate gates; none was promoted
and each had trust confidence 0. The equivalent English/Greek pair shared an
exact `lfp:2.1`; the sender/recipient reversal did not.

Offline replay of those **actual responses** against the committed implementation
retrieved two cross-language positives and rejected the one role-swap negative:
TP=2, FP=0, FN=0, TN=1. Token-Jaccard lexical retrieval on the identical routed
raw pool had TP=2, FP=1, FN=0, TN=0. This one-structure, implementer-authored
development probe is **not protected extraction accuracy, a fresh comprehensive
end-to-end run or general superiority to lexical retrieval**. Near mode returned
only the same exact hits; no near-only benefit or 0.80 calibration was shown.
Embedding baseline: **NOT RUN**. Full protected live qualification: **NOT RUN**.
Model calls totaled 79,035 reported tokens; dollar billing, temperature, seed
and immutable deployment/weight identity were unavailable, not invented.

Four repair workers and three parser-pilot workers were all Luna: Faraday
(retrieval), Banach (record containment), Mencius (lifecycle), Poincare (risk),
Hypatia (English), Newton (Greek) and Carson (Greek reversed roles). The parent
reviewed and refined the patches, ran integration and examined raw receipts.

## Remaining gate and next action

The [human source-only packet](../meaning-human-review-packet-v1/README.md) has
14 unresolved English/Greek sources, all reviews pending. Model-only or
self-reviewed dispositions cannot certify their meaning or native Greek.
Obtain that independent adjudication, then freeze a new protocol-valid protected
corpus and evaluate the frozen current parser and raw retrieval under an agreed
model/budget. Require actual full-runtime provenance and inspect every failure.
Wrong roles, omitted word-only restrictions, literal multiplicity, recurrence
and units remain outside the digit/identifier floor. Trust evidence is caller
attestation, not authentication; backend privacy/delete acceptance is still absent.

No OpenUnum integration is authorized or demonstrated. This milestone cannot
move the project to READY on deterministic tests or three development calls.
