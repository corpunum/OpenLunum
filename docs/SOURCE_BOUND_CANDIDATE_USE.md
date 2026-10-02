# Source-bound candidate use

Source evidence remains authoritative. These guards do not certify that a
model understood the source, and they do not constitute deployed storage.

`createRecord()` now applies the authoritative wire validator before
normalization and the same digit/identifier retention floor as agent
submission. A missing source literal withholds exact candidate identity and
promotion, while retaining the source, candidate, and diagnostics. An absent
source is explicitly marked `semanticIdentityBinding: unbound`; a fingerprint
of supplied Sem is not proof of extraction correctness. The literal checker
does not establish role accuracy, number-word preservation, unit meaning,
multiplicity, or complete preservation of qualifiers.

Risk inspection traverses all nested conditions and consequences and includes
canonical `obligation`/`necessity`, not only legacy `must` spellings. A computed
confidence score is not a calibrated probability. Caller-supplied verifier
metadata is an attestation, not authentication: trusted consumers must obtain
and authenticate independent evidence themselves. The agent extraction path
does not accept that metadata as automatic promotion authority.

## Local lifecycle registry

`DerivedDataLifecycleRegistry.executeDeletion()` is now asynchronous. Callers
must await its report. `DeleteTarget` may return a promise; it must acknowledge
an actual, idempotent backend deletion, not merely enqueue work.

The registry issues `derived-deletion-plan/1` plans bound to an immutable
source lineage and the complete registered target set. Mutated, unissued,
stale, or source-incarnation-mismatched plans are rejected before a deleter is
called. A new registration invalidates prior plans. A source cannot acquire a
new derivative while its cascade is executing.

Derivatives are attempted first. The source is deleted only after all of them
succeed; failed cascades keep their registry state for retry. Adapters must
make repeated deletion of an already absent derivative succeed safely. Plans
are local to the issuing registry instance, not portable authorization tokens
or a persisted recovery journal. Rebuilding a registry after a restart must
re-register the actual source lineage and every derivative before issuing a
fresh plan. No deployed database, index, cache, or OpenUnum deletion is claimed.

## Retrieval reports

Raw retrieval report `0.6.0` describes **candidate-identity retrieval**, not
promoted memory. The routed raw-memory universe is the common end-to-end
confusion-count denominator for semantic and lexical systems, including the
primary `falsePositiveRate`. `examinedFalsePositiveRate` conditions on actual
comparisons and is `null` when none were possible. Identity availability and
unexamined pairs are reported separately; low operational FPR with extraction
failures is not evidence of successful semantic rejection.
Equivalent records excluded by language routing are not semantic negatives.
Exact and near-only matches are distinguished; near similarity remains
experimental and does not establish identity. Historical reports are not
rewritten or silently comparable with the corrected denominators.
