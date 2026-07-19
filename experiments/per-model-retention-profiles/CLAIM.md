# Claim: Per-Model Retention Profiles

- **Worker:** agent/qwen
- **Area:** evaluation / retention
- **Branch:** agent/qwen/retention/per-model-profiles
- **Start Date:** 2026-07-19
- **Intended Dataset:** round-trip retention experiments on EN/EL/ES/ID

## Background

STATUS.md honest boundary notes: "per-model retention profiles are not yet established."
The existing round-trip retention module already tracked per-language, per-model statistics
internally but only output per-language aggregated metrics.

## Goal

Add per-model retention profile computation to the round-trip retention experiment runner
so that each model's performance can be analyzed independently across all languages.

## Deliverables

1. `ModelRetentionProfile` type — per-model retention characteristics including per-language breakdown
2. `ModelLanguageProfile` type — per-model, per-language retention metrics
3. Updated `RoundTripReport` with `modelProfiles` and `bestModelsByLanguage` fields
4. Model profile markdown reports written to disk
5. Best-models-by-language summary report
6. Unit tests for all new functionality
