# @corpunum/lunum-core

The core package provides the fundamental building blocks for Lunum semantics, fingerprints, renderers, and related utilities.


## Modules

| Module | Exported | Description |
|---|:---:|---|
| `types` | ✓ | Core Lunum-Sem types, record structures, and schema-conformance helpers |
| `constants` | ✓ | Named predicates, roles, categories, and risk/modality enum values |
| `canonicalize` | ✓ | Deterministic canonicalization for stable fingerprints |
| `fingerprint` | ✓ | Exact semantic fingerprints (lfp:), versioned identity |
| `fingerprint-migration` | ✓ | Bidirectional migration (0.1 ↔ 0.2) with schema validation, field-level warnings, and fingerprint regeneration |
| `render` | ✓ | Lunum-Code renderer (compact model-facing output) |
| `policy` | ✓ | Policy classifier for context risk/confidence classification |
| `derive` | ✓ | Derive helpers for building record fields |
| `context` | ✓ | Context management and mixed-context composition |
| `compare` | ✓ | Record comparison and similarity utilities |
| `profile-selector` | ✓ | Renderer profile selection driven by Token Atlas measurements |
| `token-atlas` | ✓ | Cross-model, cross-profile token measurement framework |
| `agent-state` | ✓ | Validated types for plans, steps, tool calls, evidence, and inter-agent handoffs |
| `native-model` | ✓ | Token mappings, instruction templates, and fallback profiles for 8 model families |
| `error-observability` | ✓ | Circuit-breaker and revert-capability types for observable failure modes |
| `downstream-quality` | ✓ | Task-success metrics and quality gate evaluation |
| `mixed-context-quality` | ✓ | Downstream accuracy comparison across natural vs Lunum vs mixed context |
| `prompt-injection` | ✓ | Prompt-injection resistance utilities and adversarial detection |
| `renderer-conformance` | ✓ | Property tests for round-trip canonicalization of safe/short/tight profiles |
| `compatibility-matrix` | ✓ | Schema-package version compatibility testing |

## Internal modules

These modules are used by the core package or exported separately but not re-exported from the main `index`:

- `conformance-reports` — Conformance report generation for hook/plugin/CLI paths
- `conformance-vectors` — Canonical conformance vector generation and property tests
- `context-measurement` — Context size and quality measurement
- `llama-tokenizer` — llama.cpp-compatible tokenizer counting
- `near-semantic-fingerprints` — Near-semantic fingerprints (nfp:), feature extraction, configurable similarity threshold
- `policy-classifier` — Policy classification with risk/confidence categories
- `profiles` — Renderer profile definitions (safe, short, tight)
- `prompt-gates` — Prompt-injection test harness with 10 adversarial inputs
- `release-provenance` — Release artifact tracking, signed manifests, and verification
- `rollback-process` — `rollbackToSource()` and `rollbackBatch()` with integrity/provenance/source-authenticity verification (verified/failed/absent), fail closed when evidence absent, digest-based source verification. 10 unit tests.
- `tokenizer-measurement` — Tokenizer measurement utilities and profile selection
- `typed-structures` — Expanded typed structures: time, quantity, uncertainty, reference, modality
- `types-schema` / `types-schema-conformance` — Schema conformance helpers for 0.1 and 0.2

## Quick start

```typescript
import {
  canonicalizeSem,
  fingerprint,
  render,
  TokenAtlas,
  ProfileSelector,
  migrateForward01to02,
  rollbackToSource,
  classifyPolicy,
  agentStateSchema,
  nativeModelProtocol
} from '@corpunum/lunum';

// Canonicalize a record for stable fingerprinting
const canonical = canonicalizeSem(record);

// Generate exact fingerprint
const lfp = fingerprint(canonical);

// Render compact Lunum-Code
const code = render(record, { profile: 'safe' });

// Token measurement
const atlas = new TokenAtlas([
  { name: 'llama3.1-8b', tokenizer: { model: 'llama3.1' } },
  { name: 'qwen2.5-7b',  tokenizer: { model: 'qwen2.5' } }
]);
const entry = atlas.measure(record);

// Profile selection
const selector = new ProfileSelector(atlas);
const profile = selector.select('llama3.1-8b', record);

// Schema migration
const migrated02 = migrateForward01to02(record01);

// Rollback to source
const rollbackResult = rollbackToSource(record);

// Policy classification
const policy = classifyPolicy(record);

// Agent state
const agentState = agentStateSchema.parse({
  plan: { id: 'p1', status: 'active', steps: [] },
  toolCalls: [],
  evidence: []
});

// Native model protocol
const mapping = nativeModelProtocol.getMapping('llama');
```

## Features in detail

### Lunum-Sem schema 0.2 (Frozen)

Locked field names, enum constraints for `modality` and `risk`, and `$ref` cross-references between experiment, protected-eval, and core schemas. See `schemas/CHANGELOG.md` for migration instructions.

### Bidirectional migration (0.1 ↔ 0.2)

Forward (`migrateForward01to02`) and backward (`migrateBackward02to01`) migration functions with:
- Schema validation at source and destination
- Field-level loss warnings (e.g., modality locked to enum, provenance field set, annotations field set)
- Fingerprint regeneration at target version
- Input-order preservation
- Batch operations (`migrateRecordsForward`, `migrateRecordsBackward`)
- Round-trip test (`roundTripMigration`) with explicit loss warnings
- 190 lines of tests

### Exact fingerprints (lfp:)

Versioned deterministic retrieval identity. Stable across canonicalization. Not fuzzy equivalence.

### Near-semantic fingerprints (nfp:)

Feature extraction, configurable similarity threshold, nfp:* format. Similarity comparison with threshold-based matching. Records carry both lfp: and nfp:; hybrid search tries exact first, falls back to near-semantic.

### Rollback process

`rollbackToSource()` and `rollbackBatch()` verify integrity/provenance/source-authenticity (verified/failed/absent). Fail closed when evidence is absent. Verify source/provenance digests rather than trusting the record itself. 10 unit tests.

### Agent-state protocol

Validated types for plans, steps, tool calls, results, constraints, evidence, and inter-agent handoffs.

### Native model protocol

Token mappings, instruction templates, and fallback profiles for native (lunum) and non-native model families (gemma, llama, qwen, claude, gemini, openai, unknown). 8 model families.

### Tokenizer measurement

Cross-model, cross-profile token measurement with Token Atlas. Per-model best profile selection. llama.cpp-compatible counting.

### Renderer conformance

Property tests verifying round-trip canonicalization for safe, short, and tight profiles against 10 diverse test records.

### Prompt injection resistance

10 adversarial inputs crafted to corrupt Lunum-Sem records through the parser. All must be detected or rejected.

### Mixed-context quality

Downstream task accuracy comparison across natural vs Lunum vs mixed context on multiple task types.

### Error observability

Circuit-breaker and revert-capability types for observable and reversible failure modes.

### Compatibility matrix

Schema-package version compatibility testing. Documents which Lunum-Sem schema versions work with which package versions.

## New in v0.2.0

- **Bidirectional migration (0.1 ↔ 0.2):** Forward and backward migration with schema validation, field-level loss warnings, fingerprint regeneration, input-order preservation. 190 lines of tests.
- **Near-semantic fingerprints:** Feature extraction, configurable threshold, nfp:* format, similarity comparison with threshold-based matching.
- **Agent-state protocol:** Validated types for plans, steps, tool calls, evidence, and inter-agent handoffs.
- **Native model protocol:** Token mappings, instruction templates, fallback profiles for 8 model families.
- **Renderer conformance suite:** Round-trip canonicalization property tests for safe/short/tight profiles.
- **Mixed-context quality:** Downstream accuracy comparison across natural vs Lunum vs mixed context.
- **Prompt injection resistance:** 10 adversarial inputs tested against parser.
- **Rollback process:** `rollbackToSource()` and `rollbackBatch()` with integrity/provenance/source-authenticity verification. 10 unit tests.
- **Error observability:** Circuit-breaker and revert-capability types.
- **Compatibility matrix:** Schema-package version compatibility.
- **Downstream quality gates:** Task-success metrics and quality gate evaluation.
- **Profile Selector:** Renderer profile selection driven by Token Atlas measurements.
- **Token Atlas:** Cross-model, cross-profile token measurement framework.
- **Comprehensive type tests for v02 migration:** 122 lines of semantic-contract type tests.
- **API stability tests:** Snapshot-based tests for public exports.
- **Schema migration utilities:** Version detection, migration, and golden vectors.
