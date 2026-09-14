# Evidence and limitations

**Reconciled 2026-09-14 against main `a2b5e93002b3d7ca8b1434e72853123aeaa85dd2`.**

This page replaces the former percentage-based readiness tracker. There is no defensible conversion from tests, merged issues or implemented modules to a percentage of the Lunum vision completed. The [old scorecard](../research/archive/readiness-before-public-review-20260914.md) is retained byte-for-byte as a superseded historical artifact; its 97–100% figures are not current capability claims. Relative links inside that unedited archive refer to its [original location at the pinned commit](https://github.com/corpunum/OpenLunum/blob/a2b5e93002b3d7ca8b1434e72853123aeaa85dd2/docs/LUNUM_READINESS.md).

## Evidence categories

**Implemented** means code exists. **Conformance-tested** means selected inputs satisfy assertions. **Development-measured** means an actual run with disclosed inputs and provenance exists; inspect model/agent execution and whether the corpus was tuned. **Independently validated/adopted** requires the corresponding external evidence. None implies the next.

## Current assessment

| Capability | Implemented/tested surface | Current claim and missing evidence |
|---|---|---|
| Semantic records | `packages/core/src/types.ts`, `semantic-registry.ts`, `frame-registry.ts` | A constrained typed IR, not a universal natural-language parser. |
| Exact identity | `packages/core/src/fingerprint.ts`, conformance/migration tests | Deterministic identity of accepted representations; does not prove source equivalence. Strict `semanticFingerprint` and legacy `fingerprintSem` are different versioned paths. |
| Near-semantic comparison | Feature comparison and threshold experiments | Experimental; gold-aligned fixtures or a few negatives do not establish production calibration. |
| Extraction | Agent contract/builder/submission and source-only development harness | Model interpretation remains fallible. The V8 example below is small and not a protected result. |
| Languages/models | Historical multilingual corpora and named model-profile files | Fixture/profile presence is not declared language/model support. Human review is scoped to the exact reviewed material. |
| Rendering/compaction | `renderSem`, profile tooling, context compiler | No accepted general live token-savings-plus-task-quality result. Some counters are estimates; never advertise estimates as tokenizer measurements. |
| Source/policy/lifecycle | Source fields, candidate trust/promotion, lifecycle contracts and tests | Applications must wire storage, access control, deletion and safe serving. Tests do not establish deployed privacy/security behavior. |
| CLI/MCP | Core-backed operations and tests | Usable research interfaces within their implemented scope, not a model-quality guarantee. |
| HTTP | Reference routes and service tests | Parse/realize/render/retrieve routes include placeholders. See the [package warning](../packages/api/README.md). |
| Product adoption | In-tree adapter and research examples | No accepted evidence of unrelated products relying on Lunum in production-like conditions. No numeric adoption score. |

## Inspect a current development result

[V8 iteration-2](../experiments/natural-development-v8/extraction/results-iteration2.json) records:

- 24 source rows: 18 parse targets and 6 abstention targets;
- 17 parse submissions with reported source-relative matches; one answerable target was incorrectly abstained;
- 14 exact matches out of 14 legitimately comparable outputs; the remaining parse targets must not disappear from the task denominator;
- 6/6 correct expected abstentions and 5/6 complete parse groups;
- two reported contrast families, far too few to establish broad semantic safety.

This is **development evidence**, not a protection claim, training gold certification, native English certification, or broad accuracy estimate. Check [the manifest](../experiments/natural-development-v8/extraction/iteration2-manifest.json), [review scope](../experiments/natural-development-v8/README.md) and [open acceptance discussion](https://github.com/corpunum/OpenLunum/issues/685). These references are a snapshot, not a promise that future runs have the same result.

## Historical evidence must not be silently promoted

The repository retains superseded or invalid runs, manually aligned semantic fixtures, deterministic simulations, and unexecuted model manifests. Read their validity notes. In particular, pre-prompt-fix parser runs, placeholder model identities, supplied-gold retrieval fixtures and byte/estimate-only compaction results do not establish current model or downstream capability.

The [evidence-validity reports](../reports/evidence-validity/) and versioned experiment directories preserve that history. The historical ledger-to-registry consistency test now reads the archived scorecard with the same row assertions; no registry entries were removed. A green test suite validates the assertions being executed, not every sentence in a historical report.

## What would justify stronger public claims

A result needs a declared task and baseline, frozen inputs and comparison rules, actual model/agent execution if claimed, exact versions, raw failures, denominators, and review independent of implementation where appropriate. Generalization claims need data not repeatedly optimized during development. Native/human review must not be impersonated by an agent.

For compression: publish actual named-tokenizer counts **and** downstream quality, latency/cost and fallback rates. For adoption: provide an independently attributable consumer and a reproducible result. An internal demo is not an external adopter.

Internal schema freezes are compatibility decisions, not external standardization. Current [license terms](../LICENSE.md) remain a separate blocker to open-source reuse.
