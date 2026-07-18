# Schema Changelog

All notable changes to OpenLunum JSON schemas are documented in this file.

The schemas follow [Semantic Versioning for JSON Schema](https://json-schema.org/draft/2020-12/json-schema-core.html#rfc.section.10.1) conventions:
- Major versions (0.1 → 1.0) indicate breaking changes
- Minor versions (0.1 → 0.2) indicate additive changes that preserve compatibility
- Patch versions indicate non-breaking corrections

---

## [Unreleased]

### Added
- `shared.schema.json` — New shared definitions file containing common types used across schemas
  - `dataset` — Common dataset structure (path, sha256, license, envVar)
  - `limits` — Common execution limits (maxItems, maxAttemptsPerItem, maxModelCalls)
  - `gates` — Common quality gates (minimumFeatureRecall, minimumExactRate, requireProtectedLiteralCoverage)
  - `id`, `task`, `area`, `coverage` — Common type definitions

---

## [0.2] — 2026-07-18

### Changed — `lunum-sem.schema.json` (0.1-draft → 0.2)

#### Breaking Changes

1. **Schema ID changed**
   - Before: `lunum-sem/0.1-draft`
   - After: `lunum-sem/0.2`
   - Migration: Update `schema` field value from `"lunum-sem/0.1-draft"` to `"lunum-sem/0.2"`

2. **`modality` field now enum-constrained**
   - Before: `"modality": {"type": ["string", "null"]}`
   - After: `"modality": {"type": ["string", "null"], "enum": ["fact", "belief", "goal", "obligation", "permission", null]}`
   - Migration: Ensure all clause `modality` values are one of: `fact`, `belief`, `goal`, `obligation`, `permission`, or `null`

3. **`term` objects now have constrained `type` field**
   - Before: `term.type` could be any string
   - After: `term.type` must be one of: `entity`, `quantity`, `time`, `location`, `abstract`
   - Migration: Update term `type` values to use the allowed enum

4. **`references` array now has strict structure**
   - Before: `"references": {"type": "array", "items": {"type": "object"}}`
   - After: References must have `uri` (required), plus optional `type` and `label`
   - Migration: Add `uri` field to all reference objects; add `type` and `label` for clarity

#### Additive Changes

5. **Added descriptions to all fields**
   - All properties now have `description` fields for better documentation

6. **Added `format: "uri"` to reference URIs**
   - Reference `uri` fields now have `"format": "uri"` constraint

### Migration from 0.1-draft to 0.2

```typescript
// Step 1: Update schema version
const record02 = { ...record01, schema: 'lunum-sem/0.2' as const };

// Step 2: Update term types
record02.clauses.forEach(clause => {
  Object.values(clause.roles).forEach(term => {
    if (typeof term === 'object' && term !== null && !Array.isArray(term)) {
      if (!['entity', 'quantity', 'time', 'location', 'abstract'].includes(term.type)) {
        term.type = 'entity'; // Default to entity for unknown types
      }
    }
  });
});

// Step 3: Update references
if (record02.references) {
  record02.references.forEach(ref => {
    if (!ref.uri) {
      ref.uri = ''; // Add missing uri
    }
  });
}

// Step 4: Validate modality
record02.clauses.forEach(clause => {
  if (clause.modality !== null && clause.modality !== undefined) {
    const valid = ['fact', 'belief', 'goal', 'obligation', 'permission'].includes(clause.modality);
    if (!valid) {
      console.warn(`Invalid modality "${clause.modality}", defaulting to null`);
      clause.modality = null;
    }
  }
});
```

---

## [0.1-draft] — 2026-07-15

### Initial Schema Release

#### `lunum-sem.schema.json`
- Initial Lunum-Sem semantic representation schema
- Supports clauses with predicates, roles, negation, modality
- Supports conditional clauses (conditions/consequences)
- Supports references and provenance

#### `experiment.schema.json`
- Initial experiment manifest schema
- Supports parse, realize, render, context, retrieval, integration tasks
- Supports dataset, limits, gates configuration

#### `lunum-record.schema.json`
- Initial Lunum Record container schema
- Wraps sem (Lunum-Sem), fingerprint, renderings, policy

#### `model-profile.schema.json`
- Initial model profile schema for OpenAI-compatible providers

#### `protected-eval.schema.json`
- Initial protected evaluation manifest schema
- Supports dataset, coverage, instructions

#### `renderer-profile.schema.json`
- Initial renderer profile schema
- Supports semantic rendering configuration

#### `report-validation.schema.json`
- Initial report validation schema for experiment manifests

---

## Version History

| Version | Date | Schema Files Changed | Description |
|---------|------|---------------------|-------------|
| 0.2 | 2026-07-18 | lunum-sem.schema.json | Freeze 0.2 with locked fields, enum constraints |
| 0.1-draft | 2026-07-15 | All 7 schema files | Initial schema release |

---

## Migration Guide Summary

### From 0.1-draft to 0.2
1. Change `schema` from `"lunum-sem/0.1-draft"` to `"lunum-sem/0.2"`
2. Validate term `type` values against enum
3. Ensure reference objects have `uri` field
4. Validate modality against allowed values

### General Best Practices
- Always validate against the latest schema before processing
- Use the `$ref` cross-references in `shared.schema.json` for common types
- Preserve `provenance` and `annotations` during migrations — they are additive

---

## Schema Registry

| File | $id | Version | Status |
|------|-----|---------|--------|
| `lunum-sem.schema.json` | `https://openlunum.org/schemas/lunum-sem/0.2` | 0.2 | Frozen |
| `experiment.schema.json` | `https://openlunum.org/schemas/experiment/0.1` | 0.1 | Stable |
| `protected-eval.schema.json` | `https://openlunum.org/schemas/protected-eval/0.1` | 0.1 | Stable |
| `lunum-record.schema.json` | `https://openlunum.org/schemas/lunum-record/0.1-draft` | 0.1-draft | Experimental |
| `model-profile.schema.json` | (see file) | 0.1 | Stable |
| `renderer-profile.schema.json` | (see file) | 0.1 | Stable |
| `report-validation.schema.json` | (see file) | 0.1 | Stable |
| `shared.schema.json` | `https://openlunum.org/schemas/shared/0.1` | 0.1 | Shared definitions |
