# Schema Changelog

All breaking changes to Lunum schemas, with migration instructions.

---

## 0.2 — Frozen (2026-07-18)

### lunum-sem/0.2

| Change | Type | Details |
|--------|------|---------|
| `clauses[].modality` | Breaking | Locked to enum: `["certainty", "possibility", "necessity", "obligation", null]`. Values outside this set must be mapped to `certainty` during migration. |
| `clauses[].time` | Breaking | Must be ISO 8601 `date-time` string or typed object. Plain strings not matching ISO 8601 must be converted. |
| `provenance` | Breaking | Locked field set: `source`, `author`, `timestamp`, `license`. Unknown fields rejected. |
| `annotations` | Breaking | Locked field set: `confidence`, `tags`, `notes`. Unknown fields rejected. |
| `references` | Breaking | New type: `{ id, url, title?, type? }`. Must conform to `$defs/reference`. |
| `clause[].annotations` | Breaking | Locked field set: `confidence`, `evidence`. Unknown fields rejected. |

**Migration:** Convert any non-ISO 8601 time strings to ISO 8601. Map unknown modality values to `certainty`. Flatten provenance/annotations to locked fields.

### lunum-record/0.2

| Change | Type | Details |
|--------|------|---------|
| `recordVersion` | Breaking | New const value: `lunum-record/0.2`. |
| `source` | Breaking | Added locked field `format` (enum: `["natural", "structured", "mixed"]`). |
| `sem` | Breaking | Must reference `lunum-sem/0.2` schema (was 0.1-draft). |
| `renderings` | Breaking | Keys must be valid BCP-47 language tags. Values have locked field set: `code`, `profile`, `tokens`. |
| `policy.risk` | Breaking | Locked enum: `["low", "medium", "high", "unknown"]`. |
| `meta` | Breaking | Locked field set: `created`, `modified`, `schemaVersion`. |

**Migration:** Update `recordVersion` to `lunum-record/0.2`. Update embedded `sem.schema` to `lunum-sem/0.2`. Add `meta.schemaVersion: "0.2"`.

---

## 0.1-draft — Initial Draft (2026-01-01)

### lunum-sem/0.1-draft

| Field | Type | Constraints |
|-------|------|-------------|
| `schema` | `const` | `"lunum-sem/0.1-draft"` |
| `world` | `string` | `minLength: 1` |
| `kind` | `string` | `minLength: 1` |
| `clauses` | `Clause[]` | `minItems: 1` |
| `references` | `object[]` | Unrestricted shape |
| `provenance` | `object` | Unrestricted shape |
| `annotations` | `object` | Unrestricted shape |

### lunum-record/0.1-draft

| Field | Type | Constraints |
|-------|------|-------------|
| `recordVersion` | `const` | `"lunum-record/0.1-draft"` |
| `source` | `object` | `text` required |
| `sem` | `LunumSem` | Reference to `lunum-sem.schema.json` |
| `fingerprint` | `string` | Pattern: `^lfp:` |
| `renderings` | `object` | Unrestricted keys, locked value shape |
| `policy` | `object` | `eligible`, `risk`, `confidence` required |
| `meta` | `object` | Unrestricted shape |

---

## Migration Guide: 0.1 → 0.2

1. **Read the 0.1 record** and extract `sem` and `source`.
2. **Upgrade sem**:
   - Set `sem.schema` to `"lunum-sem/0.2"`.
   - For each clause, if `modality` is not in the 0.2 enum, replace with `"certainty"`.
   - For each clause, if `time` is not ISO 8601, stringify it.
   - If `provenance` has unknown fields, keep only `source`, `author`, `timestamp`, `license`.
   - If `annotations` has unknown fields, keep only `confidence`, `tags`, `notes`.
   - If `references` entries don't match the new reference shape, add `id` and `url` fields.
3. **Upgrade record**:
   - Set `recordVersion` to `"lunum-record/0.2"`.
   - Update embedded `sem.schema` to `"lunum-sem/0.2"`.
   - Add `meta: { schemaVersion: "0.2" }` if not present.
   - Ensure `renderings` keys are BCP-47 compliant.
   - If `policy.risk` is not in `["low", "medium", "high", "unknown"]`, set to `"unknown"`.
4. **Validate** against `lunum-sem-0.2.schema.json` and `lunum-record-0.2.schema.json`.
