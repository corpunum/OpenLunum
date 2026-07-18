# Cross-Lingual Retrieval Precision

## Metadata
- **Worker**: qwen
- **Area**: multilingual-retrieval
- **Branch**: agent/qwen/cross-lingual-retrieval
- **Start Date**: 2026-07-18
- **Status**: in-progress

## Work Item
**WORK_QUEUE v4 — P1 multilingual retention (release gate 3):**
- [ ] Measure cross-lingual retrieval precision: query in language A, retrieve semantically equivalent records in language B.

## Description

Implement cross-lingual retrieval precision measurement. The module enables:
1. Indexing Lunum-Sem records by language and fingerprint
2. Querying in one language and retrieving semantically equivalent records in another
3. Computing precision, recall, and F1 score per query
4. Aggregating metrics by language pair, source language, and target language

## Files Created
- `packages/eval/src/cross-lingual-retrieval.ts` — Cross-lingual index and retrieval module
- `packages/eval/test/cross-lingual-retrieval.test.ts` — 20 tests

## Test Coverage
- Index add/list/query operations
- Language-based indexing
- Query generation from parallel record groups
- Retrieval precision/recall/F1 computation
- Edge cases: empty queries, empty expected IDs, maxResults limit
- Per-language-pair and per-language metrics
- Report structure validation

## Key Features
- `CrossLingualIndex`: Index records by language and fingerprint
- `runCrossLingualRetrieval`: Measure precision for cross-lingual queries
- `createCrossLingualQueries`: Generate queries from parallel record groups
- Metrics: precision, recall, F1 score, per-language breakdown
- CLI helper: `printCrossLingualReport()`
