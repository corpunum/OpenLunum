# ADR 0018 — Separate dates from quantities and evidence from retained meaning

**Status:** Implemented 2026-10-02. Self-reviewed; Luna workers supplied
independent deterministic audits and regression fixtures. Agent contract
`lunum-agent/0.14`, instructions `agent-extraction-instructions/0.4`.
No live parser/model calls.

## Reproductions

The [preserved contract-0.13 counterexample](../experiments/gold-metadata-preflight-v1/date-literal-counterexample.json)
rejects the correct ISO representation of the German source date `30.11.2026`:
the numeric checker reads a decimal `30.11`, rather than a full date. Conversely,
ISO dates with swapped valid month/day components can pass a bag-of-numbers
check, and a date component can satisfy an omitted independent quantity.

An independent source-path audit also reproduced literal laundering: a date
placed only in term metadata or a surface-evidence reference makes an otherwise
incomplete candidate pass retention. Those fields do not participate in
`lfp:2.1`; adding them can rescue availability without changing the fingerprint.
The defect affects submission and source-bound record creation, not just gold
preflight. The candidate is still unpromoted; identity availability is not trust.

## Decision

The shared `checkLiteralRetention` gate now treats Gregorian-calendar-valid
full ISO dates separately from numeric quantities. Dotted day/month/year dates
normalize only when day > 12 makes the ordering unambiguous. Invalid, partial,
embedded identifier/path and ambiguous spellings receive no guessed date
normalization. They fall through the existing numeric floor; this is **not** a
general ambiguity detector or guarantee that ambiguous inputs abstain.

Recognized date spans are removed from both numeric pools. Dates require an
exact normalized-date match, and cannot satisfy an independent quantity.
Result reports add `sourceDates` and `missingDates`; diagnostics name missing
dates separately. The public `numbersInText` utility keeps its old behavior.

Only instance-bearing fields of the existing identity projection can satisfy
the floor: primitive terms, arrays and `id`, `ref`, `value`, `unit`, `min`,
`max`, `format`, recursively through roles, time, conditions and consequences.
Controlled type labels are not source payload. Grounded top-level references
count only their referent (`ref`, falling back to `id`). Surface-evidence
references and identity-excluded metadata, language, tokens, surfaces, spans,
provenance and provider fields cannot rescue a missing literal. They are retained
as evidence; they are not deleted or hashed into proposition identity.

Submission, source-bound record creation and complete evaluation-gold preflight
use the same gate. No schema, vocabulary, frame or fingerprint projection
changes. Previously accepted unchanged representations retain their fingerprint;
some faulty or evidence-laundered candidates now lose availability, while the
verified dotted-date representation gains availability. No durable records are
rewritten or promoted. Old identities retain their original contract provenance
and require source review/re-extraction rather than silent upgrading.

## Runtime and evidence compatibility

Instruction package/runtime inventory v16 binds contract 0.14 and the changed
instructions and served modules. V15 and historical reviews/results remain
unaltered. Additive review v2 and scoring manifest v3 rebind the same historical
bytes for **offline diagnostic use only**; they do not provide new review or
relabel outcomes. Old package bindings fail current live preflight.

This is source-retention normalization, **not Sem normalization**: date values
inside Sem are not rewritten. Dotted and ISO Sem values can still have different
exact fingerprints. Parser instructions continue to require ISO values.

## Limits and verification

The [registered deterministic experiment](../experiments/date-literal-retention-v1/CLAIM.md)
preserves failures and before/after source-path receipts. Tests cover calendars,
Unicode boundaries, decimals/grouping, valid date swaps, separate quantities,
nested clauses, evidence-field attacks and both runtime boundaries. Actual
isolated weakenings of date rejection, field filtering and ambiguity handling
must be caught, not merely fail to import.

This remains a **presence floor**, not source meaning certification. It does not
prove roles, literal multiplicity, units, word-only numbers/dates, recurrence,
names, referent grounding or overall semantic fidelity. Wrong-but-valid Sem can
remain a candidate with available identity, never automatically trusted or
durably promoted. Contract 0.14 protected/live quality is **NOT RUN**. Native
source review and budgeted independent raw-text evaluation remain required
before any OpenUnum integration. No OpenUnum runtime, persistence or deployed
lifecycle behavior is claimed.
