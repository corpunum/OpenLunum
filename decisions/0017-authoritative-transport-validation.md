# ADR 0017 — Enforce the authoritative wire schema at submission

**Status:** Implemented 2026-10-02. Self-reviewed with Luna read-only audits.
Agent contract `lunum-agent/0.13`; no new model calls.

## Reproduction

At `7470a2322a686ee4d3d6558b77d31b20f7ea8b6c`, round-2 e05 carries
`world` and `kind` inside a condition clause. The actual
`schemas/lunum-sem.schema.json` rejects these fields, but `submitCandidate`
sets `transportValid` from the narrower hand-written structural checker and
issues `lfp:2.1:sha256:ea5ee4d0482ab6f8e7bced9fe33fdc70`. It is not promoted.
The offline meaning scorer correctly labels this output invalid. Original
requests, candidates, results and the v1 diagnostic are unchanged.

The builder's advertised schema independently has the same defect: its nested
clause definition reuses the top-level builder envelope, requiring `world`
and `kind` on conditions/consequences. These are forbidden on wire clauses.
Thus the defect is not evidence that the model misunderstood the sentence.

## Decision

Core compiles an exact generated copy of the authoritative Draft 2020-12 wire
schema with Ajv 8.20.0. The schema and its byte hash are generated together;
every core build refuses drift. The compiled package includes the schema, so
installed consumers need neither a repository-relative file nor eval/provider
code. Ajv is a core runtime dependency, bound by the workspace lockfile.

`submitCandidate` validates finite, acyclic plain JSON and the full wire
schema **before** structural validation, protocol normalization, frame checks,
literal checks or identity. No coercion, defaults or field removal is enabled.
Invalid transport yields no normalized Sem, no identity, no promotion, zero
trust confidence and path-specific diagnostics. Source text/hash remain in
the result; the caller's original candidate is unmodified and remains available
in its request/ledger. Grounding paths cannot override the transport rejection.

The builder validates its output with the same wire validator. Its schema is
now `agent-builder/0.2`: nested clauses omit envelope fields, and typed terms
reuse the wire term constraints. This is a contract correction, not a new
ontology, model profile, renderer or product integration.

## Compatibility and migration

Wire schema `lunum-sem/0.1-draft`, protocol 0.4, frame registry 0.5, extraction
instructions 0.3 and fingerprint algorithm `lfp:2.1` are unchanged. The
submission contract is versioned as 0.13 because its accepted input set
changes. Instruction package v14 binds the new validator/schema/builder
artifacts and dependency; v13 is preserved. The old meaning manifest remains
bound to 0.12 and refuses replay on 0.13; a new v2 manifest explicitly binds
the same historical input bytes to the current diagnostic contract.

No durable identity is rewritten. Previously issued identities for malformed
candidates are not silently upgraded: retain their source, raw candidate and
old contract provenance, and review/re-extract before submitting a corrected
candidate. Do not repair old evidence by stripping the offending fields.
Low-level fingerprint helpers do not become a source-correctness verifier.

## Deterministic evidence and costs

[The audit](../reports/diagnostic/2026-10-02/transport-validation/README.md)
compares the old submission code and current boundary on 556 recorded parse
rows in 37 tracked ledgers, with empty source to isolate wire enforcement:

- 544 identities under the old boundary, 496 retained byte-for-byte;
- zero changed identities and zero new identities;
- 48 previously issued identities withheld, all with listed wire violations;
- 53 wire-invalid parses in total (five already lacked identity);
- 38 of 176 rows labelled matches by their frozen source-relative scorer are
  wire-invalid. Those labels alone never established transport conformance.

These are repeated historical observations, not 556 independent sentences,
false-positive rates, source-accuracy estimates, or a new live run. Strict
enforcement will reduce acceptance of old malformed outputs. Live behavior of
0.13 and its corrected builder is **NOT RUN**.

Tests cover recursive extra fields, typed literal shape, recursive arrays,
metadata, no mutation/coercion/defaults, cycles, grounded-path containment,
builder schema agreement and an in-memory mutation of actual submission code
that bypasses enforcement and reproduces the faulty identity.

Meaning fidelity remains unresolved: valid transport does not catch omitted
word-only qualifiers, wrong roles, wrong predicates or wrong-but-valid Sem.
It does not confer trust or OpenUnum integration readiness.
