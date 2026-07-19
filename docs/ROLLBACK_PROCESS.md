# Safety Rollback Process

**Package:** `packages/core/src/rollback-process.ts`  
**Tests:** `packages/core/test/rollback-process.test.ts` (10 tests)  
**Status:** Reference implementation

## Purpose

The rollback process provides a verifiable mechanism to revert a Lunum-Sem record back to its original natural-language source text, with three independent verification layers:

1. **Integrity** — the record's internal data has not been corrupted
2. **Provenance** — the provenance chain is intact and verifiable
3. **Source authenticity** — the claimed original source text matches an external digest

## Key Design Decisions

- **Separate statuses:** Integrity, provenance, and source-authenticity each have independent statuses: `verified`, `failed`, or `absent`.
- **Fail closed:** When evidence is absent (not just failed), the process defaults to `absent` rather than assuming correctness. This is a conservative safety choice.
- **Verify digests, not claims:** The process verifies source/provenance digests rather than trusting the record's own claims. The digest is computed against external source text.
- **No `as any`:** All test fixtures are schema-valid, avoiding type coercion that could hide structural issues.

## API

### `rollbackToSource(record, externalSource)`

Rolls back a single Lunum-Sem record to its original natural-language source.

- Verifies integrity (record structure intact)
- Verifies provenance (chain of custody)
- Verifies source authenticity (external digest matches claimed source)
- Returns `{ status, integrity, provenance, sourceAuthenticity, sourceText }`

### `rollbackBatch(records, sourcesMap)`

Performs batch rollback across multiple records.

- Returns per-record results and a summary with aggregate pass/fail counts.

### `verifySourceAuthentic(sourceText, expectedDigest)`

Verifies that source text matches an expected external digest (e.g., SHA-256).

- Used by rollback functions to confirm the original source has not been tampered with.

## Verification Status Matrix

| Integrity | Provenance | Source Authenticity | Result |
|---|---|---|---|
| verified | verified | verified | Full rollback — source text returned |
| verified | verified | failed | Partial — source digest mismatch |
| verified | verified | absent | Conservative — cannot confirm source |
| failed | any | any | Record corrupted — abort |
| any | failed | any | Provenance broken — abort |
| absent | any | any | Evidence missing — fail closed |

## Relation to Release Gates

Release gate 7 requires: "Published threat model, rollback process, and compatibility matrix."

- Threat model: `docs/THREAT-MODEL.md`
- Compatibility matrix: implemented and CI-tested
- Rollback process: this document + `packages/core/src/rollback-process.ts`

## Test Coverage

10 unit tests covering:
- Full rollback with all three verifications passing
- Integrity failure (corrupted record)
- Provenance failure (broken chain)
- Source authenticity failure (digest mismatch)
- Absent evidence paths (all three statuses)
- Batch rollback with mixed results
- Fail-closed behavior when evidence is absent

## Limitations

- Rollback assumes the original source text is available externally (e.g., stored in a provenance database or file).
- The process does not itself store or retrieve source text; it verifies against whatever is passed in.
- No integration with external provenance systems is implemented — this is a library-level primitive.
