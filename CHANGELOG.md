# OpenLunum Changelog

## Since 0.2.1 (Documentation Sync)

### Added — Infrastructure & Tooling (0.2.0)
- **Core Library:** Strict TypeScript reference library providing semantic contracts, canonicalization, and release provenance.
- **CLI:** Tools for inspecting, encoding, compiling, and verifying Lunum releases.
- **MCP Prototype:** Reference server implementation for Model Context Protocol tooling.
- **OpenUnum Adapter:** Compatibility package matching existing product sidecar shapes.

### Changed
- Updated project status and architecture maps to reflect core package maturity.

### Added — Features (0.2.0)
- **Profile Selection Result:** Explicit type for renderer profile selection driven by Token Atlas measurements.
- **Realization Runner:** Experiment runner with protected-literal scoring for multilingual realization.
- **Token Atlas:** Cross-model, cross-profile token measurement framework for natural vs renderer profile comparison.
- **Profile Selection:** Renderer profile selection driven by Token Atlas measurements (per-model best profile).

## Since 0.2.1 — Merged Work (7650cc09, 605ae11, ef230af, 2001733)

### Added — Downstream Quality Gates (2001733)
- **Task-success metrics:** Metrics that verify downstream task quality is preserved when using Lunam context vs raw text.
- **Quality gates:** Evaluation gates to ensure semantic retention and downstream quality.
- **Downstream task evaluation:** Verification that Lunum context preserves task completion rates.

### Changed — Evaluation Infrastructure (605ae11)
- **Reconciliation of runners:** Aligned retrieval/integration runners with main branch evaluation protocol.
- **Evaluation suite consistency:** Ensured development suite matches declared evaluation boundaries.

### Changed — Work Queue Documentation (ef230af)
- **Check-off downstream gates:** Documented downstream-quality gate items as completed in work queue.

## Since 0.2.0

### Added — Evidence & Hardening (PR #50, #61, #62, #51, #66, #52, #55, #57)
- **Parse experiments:** EN/EL/ES/ID runs against local models via eval runner with per-language metrics.
- **Realization experiments:** EN/EL/ES/ID runs with protected-literal scoring.
- **Token Atlas:** Cross-model token measurement with at least 3 named local models.
- **Fingerprint migration:** Code-level utilities with version detection, migration, and golden vectors.
- **CI conformance gates:** Property tests wired into CI for idempotence, key-order independence, fingerprint stability.
- **MCP server hardening:** Error contracts, input validation, conformance test suite.
- **OpenUnum shadow-mode:** Live integration test against real product runtime.
- **Renderer profile selection:** Per-model best profile driven by Token Atlas measurements.

---

# OpenLunum Changelog

## Since 0.2.0 (Initial Release)

### Added — Core Features
- **Lunum-Sem:** Language-neutral structured meaning representation
- **Fingerprinting:** Deterministic retrieval and deduplication identities
- **Renderer profiles:** Tokenizer-aware compact rendering options
- **Multilingual support:** English, Greek, Spanish, Indonesian

### Changed — Architecture
- **Separation of concerns:** Meaning from model-facing rendering
- **Versioned schemas:** Explicit versioned schema identifiers
- **Protected literals:** Natural source text preservation

---

## Since 0.1.0 (Initial Development)

### Added — Research Foundation
- **Lunum-1:** Initial language experiment
- **Archival benchmark:** ~5.78x expansion study
- **Shadow implementation:** Reduced implementation in OpenUnum
- **Independent ownership:** OpenLunum restores correct ownership boundary
