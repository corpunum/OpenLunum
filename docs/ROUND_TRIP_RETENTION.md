# Multilingual Round-Trip Retention

**Status:** Prototype  
**Source:** `packages/eval/src/round-trip-retention.ts`  
**Tests:** `packages/eval/test/round-trip-retention.test.ts`  
**PR:** #176

## Overview

Round-trip retention experiments measure how well Lunum-Sem records survive a parse→realize→parse cycle across multiple human languages and local models. Unlike round-trip self-consistency (which measures whether the same input produces the same Lunum-Sem output), round-trip retention measures whether semantic meaning is preserved when passing through human-language intermediate forms.

This addresses release gate 3: *Multilingual semantic-retention evaluation on named corpora.*

## Workflow

For each evaluation item:

1. **Start from gold Lunum-Sem** — the canonical semantic record.
2. **Realize gold Sem to target language** — use a local model to generate natural-language text in the target language (English, Greek, Spanish, or Indonesian).
3. **Parse the realized text back** — use a local model to parse the realized text back into Lunum-Sem.
4. **Compare parsed-back Sem against gold Sem** — evaluate structural and semantic fidelity.
5. **Score**: predicate match, role match, protected-literal preservation.
6. **Publish per-language pass/fail metrics** — retention rate, mean latency, and per-dimension scores.

## Languages and Models

| Language | Code |
|----------|------|
| English | `en` |
| Greek | `el` |
| Spanish | `es` |
| Indonesian | `id` |

Experiments run against at least 2 local models. Per-language metrics are published for each model.

## Metrics

### `RoundTripMetric`

| Field | Type | Description |
|-------|------|-------------|
| `language` | `RealizationLanguage` | Target language |
| `totalItems` | `number` | Total evaluation items |
| `passedItems` | `number` | Items where parsed-back Sem matches gold Sem |
| `failedItems` | `number` | Items where semantic meaning was altered |
| `errorItems` | `number` | Items that produced parse/realize errors |
| `retentionRate` | `number` | `passedItems / totalItems` |
| `avgPredicateMatch` | `number` | Fraction of predicates that match |
| `avgRoleMatch` | `number` | Fraction of roles that match |
| `avgProtectedLiteralPreservation` | `number` | Fraction of protected literals preserved |
| `meanLatencyMs` | `number` | Average round-trip latency |

### `RoundTripReport`

| Field | Type | Description |
|-------|------|-------------|
| `experimentId` | `string` | Experiment identifier |
| `runId` | `string` | Unique run identifier |
| `languages` | `RealizationLanguage[]` | Languages tested |
| `models` | `string[]` | Models tested |
| `totalItems` | `number` | Total items across all languages |
| `totalPassed` | `number` | Total items passed across all languages |
| `totalFailed` | `number` | Total items failed |
| `totalErrors` | `number` | Total error items |
| `overallRetentionRate` | `number` | Overall retention rate |
| `perLanguage` | `RoundTripMetric[]` | Per-language metrics |

## Honest boundary

- This is a prototype experiment runner. It measures retention but does not yet establish per-model retention thresholds.
- The experiment tests parse→realize→parse cycles but does not test the full context pipeline (e.g., retrieval, injection, mixed-context).
- Per-language retention profiles are not yet established; results are per-language per-model, not yet aggregated into a production profile.
- Threshold tuning for pass/fail is not yet automated; results must be reviewed manually.
