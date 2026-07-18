# Golden Migration Vectors

## Metadata
- **Worker**: qwen
- **Area**: migration-rules
- **Branch**: agent/qwen/golden-migration-vectors
- **Start Date**: 2026-07-18
- **Status**: in-progress

## Work Item
**WORK_QUEUE v4 — P0 migration rules (release gate 2):**
- [ ] Golden migration vectors: add 20+ fixture pairs (0.1 input → expected 0.2 output) covering every structural change.

## Description
Add 30 golden fixture pairs covering every structural change between Lunum-Sem 0.1-draft and 0.2:

1. Schema version upgrade (0.1-draft → 0.2)
2. Provenance field preservation (additionalProperties: true in 0.2)
3. Annotations field preservation (additionalProperties: true in 0.2)
4. Reference structuring (uri + label + type)
5. Modality enum enforcement (fact/belief/goal/obligation/permission/null)
6. Unknown modality → mapped to default
7. Time object → ISO 8601 stringified
8. Clause annotations preservation
9. Term type enum enforcement
10. Negation flag handling
11. Conditions (nested clauses) preservation
12. Consequences (nested clauses) preservation
13. Multiple clauses in one record
14. Empty provenance/annotations handling
15. No references case
16. Mixed term types (string, number, boolean)
17. Full complex record

## Tests
- `golden-migration-vectors.test.ts` — 6 tests validating:
  - All expected02 outputs validate against Lunum-Sem 0.2 schema
  - All input01 fixtures validate against Lunum-Sem 0.1 schema
  - Fixture count >= 20 and coverage categories present
  - No unexpected fields in expected02
  - All fixture IDs unique
  - Structural change coverage complete
