# OpenLunum → OpenUnum Native Adoption Plan

> **Updated:** 2026-08-08
>
> **OpenUnum baseline:** commit `5bdb2e7` on `main` (no Lunum-related code changes since `18c11d8`)
>
> **OpenLunum baseline:** `@corpunum/lunum` v0.2.0, 72 compiled JS modules, 2,152 tests, frozen Lunum-Sem v1.0 schema
>
> **Strategy:** Inline OpenLunum core as native code (not an npm dependency). Shadow-first rollout.

## Gap Analysis: Current Shadow vs Target

| Dimension | Current Shadow (`v2.7-shadow`) | Target (Native Lunum) |
|---|---|---|
| Semantic parsing | None — stopword-stripped telegraph text | Full `LunumSem` with clauses, predicates, roles, provenance |
| Fingerprinting | SHA-1 of telegraph text (20 hex chars) | SHA-256 semantic (`lfp:1.0:`) + surface (`lsf:1.0:`) fingerprints |
| Multi-language | English-only ASCII stripping | Language-neutral semantic records, `world`-aware routing |
| Context compaction | None | `ProfileGenerator` with safe/short/tight profiles (0.3/0.5/0.7 reduction) |
| Token estimation | `chars / 4` | Exact tokenizer adapters with rough fallback |
| Retrieval | BM25 + embeddings + freshness only | + fingerprint-based semantic recall boost |
| Safety gating | Length/structure eligibility only | Category, confidence >= 0.9, risk classification, failure taxonomy |
| Evaluation | Compression ratio logging | Quality, semantic retention, safety, latency, rollback metrics |
| Dependency model | Inline stub | Inline core (copied built JS, no npm dependency) |

## What Changed From the Previous Plan

| Item | Status | Notes |
|---|---|---|
| Commit `18c11d8` reference | **Updated** | Current head `5bdb2e7`. No Lunum code drift — plan proceeds from current state. |
| External npm dependency | **Changed** | Old plan used `@corpunum/lunum` as npm dep. New: inline built JS into `src/memory/lunum-core/`. |
| Shadow-first rollout | **Retained** | Phases 0–2 maintain shadow parity before enabling native paths. |
| Call site alignment | **Retained** | 4 call sites match adapter exports exactly. Zero signature changes needed. |
| DB schema compatibility | **Retained** | v8 columns (`lunum_code`, `lunum_sem_json`, `lunum_fp`, `lunum_meta_json`) are sufficient. |
| Multi-language support | **Added** | New Phase 5. |
| Context compaction | **Added** | New Phase 4. |

## Call Sites in OpenUnum

| Location | Function | Context |
|---|---|---|
| `src/core/agent.mjs:649` | `deriveLunumSidecar` | User messages |
| `src/core/plan-executor.mjs:291` | `deriveLunumSidecar` | Plan steps |
| `src/core/chat-orchestrator.mjs:1220` | `deriveLunumSidecar` | Assistant responses |
| `src/core/chat-orchestrator.mjs:1260` | `compileLunumShadowContext` | Shadow comparison |

## DB Columns (schema v8)

- `messages`: `lunum_code`, `lunum_sem_json`, `lunum_fp`, `lunum_meta_json`
- `plan_records`: same 4 columns
- `plan_step_records`: same 4 columns
- `lunum_shadow_logs`: natural/mixed token totals and ratio

---

## Phase 0 — Validation (no OpenUnum edits)

1. Copy `~/OpenLunum/packages/core/dist/src/` to a staging area.
2. Verify `deriveLunumSidecar` and `compileLunumShadowContext` return the exact shape `{lunumCode, lunumSem, lunumFp, lunumMeta}`.
3. Confirm all operations run offline with zero network calls.
4. Run OpenLunum contract tests against the staged copy.

**Acceptance:** Shape matches exactly. Offline confirmed. No OpenUnum state changed.

**Rollback:** Delete staging area.

## Phase 1 — Core integration (replace shadow stub)

1. Copy `~/OpenLunum/packages/core/dist/src/` into `src/memory/lunum-core/`.
2. Replace `src/memory/lunum.mjs` with a thin adapter that re-exports `deriveLunumSidecar` and `compileLunumShadowContext` from `lunum-core/index.js`.
3. Preserve backward compatibility: the adapter must return the same shape, accept the same arguments.
4. The 4 call sites remain untouched.
5. Default to shadow mode (existing behavior: derive sidecars, log shadow context, serve natural).

**Acceptance:** All 4 call sites execute without changes. OpenUnum unit tests pass. Shadow logs continue to populate.

**Rollback:** `git revert` the commit. Old stub is restored.

## Phase 2 — Persistence and migration

1. Wire real `LunumSem` JSON into `lunum_sem_json` column (currently stores telegraph metadata).
2. Store versioned fingerprints (`lfp:1.0:sha256:...`) in `lunum_fp`.
3. Record schema/canonicalization/renderer versions in `lunum_meta_json`.
4. Add a backfill command for old rows (opt-in, never mutate silently).
5. No schema migration needed — columns exist and accept the new data shapes.

**Acceptance:** New messages store real `LunumSem`. Old rows remain readable. Backfill command works on demand.

**Rollback:** Set `LUNUM_NATIVE=false` environment variable to fall back to surface-only derivation.

## Phase 3 — Retrieval augmentation

1. Add SQLite index on `lunum_fp` in messages table.
2. Enhance `src/memory/recall.mjs` to boost results with matching `lunum_fp` (exact semantic fingerprint match).
3. Add `surfaceFingerprint` near-match as a secondary signal.
4. Keep existing BM25 + embeddings + freshness decay.
5. Log retrieval quality comparisons in shadow logs.

**Acceptance:** Fingerprint-indexed recall returns in < 80ms. Shadow comparison shows measurable relevance improvement.

**Rollback:** Remove fingerprint boost weight (config change, no migration).

## Phase 4 — Context compaction

1. Integrate `ProfileGenerator` into `src/core/context-compiler.mjs`.
2. Use `model-renderer-profiles` to select safe/short/tight based on active model family.
3. When context pressure triggers compaction, render eligible messages via Lunum profiles instead of truncation.
4. Update `src/core/context-budget.mjs` to account for compacted token counts.
5. Shadow-compare compacted vs natural context quality before enabling.

**Acceptance:** Compaction reduces context tokens by 30–70% for eligible messages. No degradation in response quality vs natural context.

**Rollback:** Set compaction profile to `natural` (no Lunum rendering applied).

## Phase 5 — Multi-language support

1. Add language detection at sidecar derivation time.
2. Store source language in `LunumSem.world`.
3. Route rendering through language-appropriate canonicalization.
4. Enable cross-language retrieval via language-neutral fingerprints.

**Acceptance:** Messages in supported languages produce valid `LunumSem`. Cross-language recall works for supported pairs.

**Rollback:** Default to English-only canonicalization.

## Phase 6 — Full enablement and evaluation

1. Graduate from shadow to live mixed context for high-confidence categories.
2. Keep natural fallback for: conditionals, safety constraints, exact text, code, commands, paths, legal/medical.
3. Enable `contextMode: 'mixed'` as a user-facing configuration option.
4. Measure: quality retention, semantic accuracy, safety, latency, token savings.
5. Rollback is a configuration change (`contextMode: 'natural'`), not a migration.

**Acceptance:** Mixed context serves real compacted content. Evaluation shows quality parity or improvement.

## Upgrade Flow

```text
OpenLunum release → rebuild dist/ → copy to src/memory/lunum-core/ → OpenUnum tests
→ shadow comparison → explicit approval → commit to main
```

Do not auto-track OpenLunum main. Each upgrade is an explicit, tested commit.
