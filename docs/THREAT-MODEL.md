# Threat model

## Assets

Natural source evidence, canonical semantic records, fingerprints, model context, retrieval ranking, plans, tool decisions, user preferences, and product databases.

## Adversaries and failures

### 1. Malicious source content / prompt injection

**Threat**: Malicious source content attempts to inject arbitrary instructions or data through the Lunum-Sem parser or renderer, tricking the system into treating injected content as legitimate semantic claims.

**Concrete mitigations**:
- **Schema validation**: All input records must pass strict JSON Schema validation before processing. Extra fields are rejected when `additionalProperties: false` is set.
- **Type checking**: Parsed Lunum-Sem records must conform to the Lunum-Sem schema (`lunum-sem/0.1-draft`). Clauses must have valid predicates and role structures.
- **Confidence gating**: Low-confidence parses (below `minimumExactRate` gate) fall back to natural-language evidence. High-impact actions require higher confidence thresholds.
- **Prompt-injection resistance tests**: 10 adversarial inputs are tested to verify the parser detects or rejects injection attempts.
- **Provenance chain**: Every record carries provenance (`source.text`, `source.language`, `source.ref`) that is never overwritten during parsing.

**Test**: `packages/core/test/prompt-gates.test.ts` verifies prompt injection resistance.

### 2. Compromised plugins or MCP servers

**Threat**: A compromised MCP server or plugin returns fabricated Lunum-Sem records or modifies records in transit, corrupting the semantic record chain.

**Concrete mitigations**:
- **Integrity hashes**: Each report bundle carries a SHA-256 integrity hash over its summary, item count, and model profile. Tampering is detected.
- **Signature verification**: Optional signed artifacts can verify record provenance from trusted sources.
- **Shadow mode**: Integrations can run in shadow mode, comparing outputs against direct API calls without affecting production decisions.
- **Removability**: Integrations must be removable without destroying product data (safety invariant #6).

**Test**: Report validation (`packages/eval/test/report-validation.test.ts`) verifies integrity hash detection on tampered reports.

### 3. Accidental parser hallucination

**Threat**: The model-based parser produces Lunum-Sem records that are syntactically valid but semantically incorrect — inventing predicates, roles, or claims not present in the source text.

**Concrete mitigations**:
- **Gold-standard comparison**: Parse results are compared against gold-standard Lunum-Sem using fingerprint comparison. Only exact-fingerprint matches pass.
- **Feature recall gating**: Minimum feature recall threshold (e.g., 0.95) ensures parsed records capture most source semantics.
- **Protected literal coverage**: Protected literals from the source must appear in the parsed output to prevent hallucination of missing facts.
- **Abstention/clarification**: Low-confidence parses can return explicit abstention instead of guessing.

**Test**: `packages/core/test/core.test.ts` verifies fingerprint stability and clause structure correctness.

### 4. Renderer ambiguity

**Threat**: The renderer produces output text that is ambiguous — different readers could interpret the same Lunum-Sem record differently, causing downstream confusion.

**Concrete mitigations**:
- **Deterministic rendering**: Each renderer profile (safe, short, tight) produces deterministic output for the same input. No randomness in token selection.
- **Profile-specific guarantees**:
  - **Safe**: Preserves all annotations and provenance. No information loss.
  - **Short**: Removes annotations but preserves semantic claims.
  - **Tight**: Minimal token count while preserving core semantics.
- **Round-trip verification**: Canonicalization → fingerprint comparison verifies that rendering doesn't change semantics.
- **Golden-output tests**: 10+ diverse inputs have deterministic golden outputs for each profile.

**Test**: `packages/core/test/renderer-conformance.test.ts` verifies profile conformance and round-trip canonicalization.

### 5. Schema drift and stale fingerprints

**Threat**: The Lunum-Sem schema evolves (e.g., new typed structures), but existing records still use the old schema. Stale fingerprints no longer correspond to current canonicalization.

**Concrete mitigations**:
- **Schema versioning**: All records carry explicit schema version (`lunum-sem/0.1-draft`). Migration tools detect version mismatches.
- **Bidirectional migration**: 0.1→0.2 forward migration and 0.2→0.1 lossy backward migration with data-loss warnings.
- **Golden vectors**: 20+ fixture pairs (0.1 input → expected 0.2 output) verify migration correctness.
- **Schema drift testing**: `pnpm verify --strict` detects schema-to-TypeScript drift on every build.
- **$ref cross-references**: JSON Schema `$ref` links between schemas ensure tools validate the full graph.

**Test**: `packages/core/test/fingerprint-migration.test.ts` verifies forward/backward migration and golden vector validation.

### 6. Product integration bugs

**Threat**: Product-specific integration code (OpenUnum adapter, MCP servers) produces incorrect Lunum-Sem records or misinterprets Lunum records, causing downstream failures.

**Concrete mitigations**:
- **Shadow mode**: Integrations run alongside production, comparing outputs without affecting decisions.
- **Conformance reports**: Hook/plugin/CLI integrations produce conformance reports verifying correct Lunum-Sem generation.
- **Test fixtures**: Negative test matrices (timeout, thrown-error, malformed output, schema-mismatch) verify error handling.
- **Artifact validation**: Expected artifacts are checked independently from their creation, preventing circular validation.

**Test**: `packages/eval/test/integration.test.ts` and `packages/eval/test/retrieval.test.ts` verify negative matrices.

### 7. Unsafe automatic dependency upgrades

**Threat**: Automatic dependency upgrades break Lunum-Sem contracts — e.g., a new `@corpunum/lunum` version changes fingerprint calculation without a version bump.

**Concrete mitigations**:
- **Semantic versioning**: Breaking changes require major version bumps. The fingerprint format includes version (`lfp:0.1:`).
- **CI gates**: Every PR runs `pnpm verify` including schema-drift checks, property tests, and the full eval smoke suite.
- **Release provenance**: Signed artifacts include commit hashes, lockfile hashes, and model/tokenizer profiles.
- **Lockfile freeze**: `pnpm-lock.yaml` is committed and verified; `pnpm install --frozen-lockfile` in CI.

**Test**: `packages/core/test/schema-conformance.test.ts` verifies schema-to-TypeScript drift detection.

### 8. Model-specific misunderstandings

**Threat**: Different models tokenize or interpret Lunum-Sem records differently, causing inconsistent outputs across model deployments.

**Concrete mitigations**:
- **Token Atlas**: Measures token counts across 3+ named models for each rendering profile (natural, safe, short, tight).
- **Model-specific tight profiles**: For each model, produce a tight profile that provably doesn't change semantics.
- **Cross-model consistency**: Fingerprint comparison verifies that different models produce the same semantics for the same record.
- **Fallback profiles**: Non-native models use instruction templates that preserve Lunum-Sem structure.

**Test**: `packages/core/test/token-atlas.test.ts` and `packages/core/test/tokenizer-measurement.test.ts` verify cross-model consistency.

## Safety invariants

1. **Original evidence remains available**: The raw source text is never discarded during parsing.
2. **Compact code never silently becomes the only record**: Lunum-Sem records carry `source.text` and provenance.
3. **Low-confidence or high-impact content falls back to natural**: Configurable gates enforce minimum thresholds.
4. **A fingerprint identifies canonical semantics under a named version, not truth**: `lfp:0.1:sha256:...` includes version.
5. **Products remain responsible for authorization and tool safety**: Lunum handles semantics; products handle access control.
6. **Integrations must be removable without destroying product data**: Adapter pattern with clean separation.

## Test matrix

### Parser-hallucination tests

| Test file | Scenario | Verification |
|-----------|----------|--------------|
| `core.test.ts` | Fingerprint stability | Same input → same fingerprint |
| `core.test.ts` | Clause structure | Valid predicates, role types |
| `parse-experiment.test.ts` | Gold-standard comparison | Exact-fingerprint match |
| `abstention-clarification.test.ts` | Low-confidence abstention | Returns abstention, not guessing |

### Renderer-ambiguity tests

| Test file | Scenario | Verification |
|-----------|----------|--------------|
| `renderer-conformance.test.ts` | Deterministic output | Same input → same output |
| `renderer-conformance.test.ts` | Round-trip canonicalization | canonicalize → fingerprint stable |
| `profile-selector.test.ts` | Model-specific profiles | Same semantics, fewer tokens |
| `token-atlas.test.ts` | Cross-model consistency | Same fingerprint across models |
