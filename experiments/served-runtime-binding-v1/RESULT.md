# Second readiness milestone: preflight integrity

Starting HEAD: `a4aa081b675532855bf4360bcb790dcc9275a881` on `main`.
Gold repair: `3f6e476`.
Frozen implementation: `a504fb163fb774a1c95a36a816bf6278a47548fd`.
**NOT READY. No new measured parser/model calls were made.**

## Reproduced defects and changes

V14's selected runtime hashes passed after unlisted dependencies such as
`derive.js` and `fallback-policy.js` changed. New v15 is additive: it leaves
v14 and historical evidence intact, and binds the complete inventory and
bytes of 93 repository-owned core/MCP JavaScript artifacts. Missing, added,
changed, malformed or symlink-escaped inputs fail before provider contact.
Installed AJV version and lockfile checks remain separate; this is not whole
host/dependency supply-chain attestation. Schema, protocol, frames, fingerprint
projection and public parser conventions are unchanged.

Gold preflight previously accepted `parse`+null and `abstain`+nonnull Sem as
abstentions, omitted source literal checks, and inspected only the selected
prefix. It now validates the complete dataset before discovery/generation:
nonempty unique IDs/source text, supported language, outcome/gold agreement,
transport, structure, strict protocol canonicality, frames, identity, semantic
atoms/groups and the same necessary digit/identifier floor as candidates.
Empty datasets and bad rows beyond a pilot limit fail with zero HTTP requests.
It never silently repairs gold. Source-bound diagnostic callers forward their
original source metadata; pure Sem comparison remains explicitly separate.

## Current-contract corpus audit

[Full IDs, stages and hashes](../gold-metadata-preflight-v1/existing-corpus-audit.json)
were produced offline against the implementation above; frozen inputs were not
modified. These are **current compatibility diagnostics, not new model scores**.

| Existing corpus | Rows / parse targets | Current invalid parse targets | Interpretation |
|---|---:|---:|---|
| Stage 3 original | 54 / 48 | 30 | Noncanonical protocol targets |
| Stage 3 v2 | 66 / 54 | 48 | Current frame/identity/group failures; historical live result NOT_RUN |
| Fresh v1 | 56 / 52 | 1 | Dotted-date literal-check false rejection, not wrong gold |
| Fresh v2 | 77 / 71 | 5 | Invalid visibility term annotations; preserved contaminated attempt |

None is fresh independent protected qualification for the current candidate.
No human/native review is established by this audit. Fresh-v1 was previously
scored on an older implementation and parent-authored; fresh-v2's original
contamination notice expressly prohibits repair/reuse for a capability result.

The [date counterexample](../gold-metadata-preflight-v1/date-literal-counterexample.json)
independently demonstrates a remaining checker defect on a hand-authored
regression source: valid ISO `2026-11-30` preserves unambiguous `30.11.2026`,
but the numeric floor treats the latter as decimal `30.11` and withholds
identity. Its transport/structure/frame pass; trust remains unpromoted at 0.
Do not relabel this as model misunderstanding, alter gold, or disable the floor.
A conservative date-aware repair needs separate tests distinguishing dates
from actual decimal quantities, invalid and ambiguous dates, and real mutations.
The current floor still does not certify role placement, units, multiplicity,
word-only restrictions, recurrence or full source meaning.
The internal `DatasetItem.goldSem` static type also still omits null although
the explicit abstention runtime contract permits it; this existing type cleanup
is not claimed fixed by the runtime metadata gate.

## Verification and evidence limits

`pnpm verify` passed **on committed a504fb1**: 4,421 tests, 0 failures/skips,
smoke 16 items / 4 groups. [Receipt and original-log hashes](verification.json).
Two earlier failed development verification attempts are retained and explained
there. The mixed-result regression was strengthened to assert a correct parse
and a schema-valid wrong-negation failure, not merely an item count.

All nine actual isolated weakenings are caught by assertion failures, not setup
errors. [Mutation receipt](mutations/report.json); the three new protections have
both passing and weakened TAP transcripts here. Paths are redacted and trailing
whitespace trimmed in published copies; original hashes are recorded. The prior
six mechanisms are also rerun in the canonical verification gate.

A new owned stdio child returned [the raw current MCP contract](preflight.json)
and matched v15's artifact binding on the frozen implementation: provider calls
0. It closed normally; no existing server/service was restarted or modified.
No schema handshake is semantic fidelity, model identity, or readiness evidence.
Embedding, protected extraction, protected raw retrieval and noise-aware near
threshold qualification are **NOT RUN**. The previous three-call Luna pilot is
development evidence only and has not been reclassified.

Four Luna workers contributed: Hilbert (corpus/evidence audit), Kierkegaard
(runtime-binding adversarial tests), Copernicus (gold preflight implementation),
and Cicero (independent dotted-date counterexample). The parent reviewed code,
reproduced the findings, fixed caller integration and ran final verification.

## Remaining decisions

Correct the date checker conservatively, then obtain independent source
adjudication (including native/fluent Greek), freeze fresh protocol-valid
protected data, and run the exact candidate under an agreed model/budget.
The [14-source source-only human packet](../meaning-human-review-packet-v1/README.md)
is still pending; model workers are not human/native certification.

All task commits are local on `main`. Remote `main` was fetched and remained
`14c0ebc1e3db4cc99280778c14c12230790f95a3`, with no divergence at inspection.
Push is NOT RUN: unrelated owner work remains dirty, while repository policy
requires a clean tree. The owner was asked for an explicit verified-only push
exception; no response has been received. Nothing was cleaned, stashed,
rewritten or force-pushed. Owner nonruntime file bytes and deleted runtime
marker were preserved; background runtime metrics were not restored.
OpenUnum, other repositories and pre-existing processes remain untouched.
Compaction stayed parked. Deletion/lifecycle contracts remain deterministic,
in-memory evidence, not deployed backend acceptance.
