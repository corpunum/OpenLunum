# Realization Experiment Runner

> P1-evidence v2: Run realization experiments (EN/EL/ES/ID) with
> protected-literal scoring; publish per-language metrics reports.

## Overview

`runRealizationExperiment` (package `@corpunum/lunum-eval`) runs Lunum-Sem
→ natural language realization across **English**, **Greek**, **Spanish**, and
**Indonesian**, scoring each realization with **protected-literal coverage**
and **semantic quality** components, then publishes per-language metrics
reports.

## API

```typescript
import { runRealizationExperiment } from '@corpunum/lunum-eval';

const results = await runRealizationExperiment(manifest, root, dataset);
// → { results: ItemResult[]; report: RealizationReport; output: string }
```

### Output

The runner writes:
- `reports/realization/<id>-report.json` — full JSON report with per-language
  metrics, pass rates, and semantic scores.
- `reports/realization/<id>-summary.md` — human-readable Markdown summary.

## Report structure

```typescript
interface RealizationReport {
  experimentId: string;
  languages: ('en' | 'el' | 'es' | 'id')[];
  totalRecords: number;
  metrics: Record<string, RealizationMetric>;
  passRates: Record<string, number>;
  summary: { totalItems; totalPassed; totalFailed; totalErrors;
             overallPassRate; avgProtectedLiteralCoverage; avgLatencyMs };
  generatedAt: number;
}

interface RealizationMetric {
  language: 'en' | 'el' | 'es' | 'id';
  total: number;
  passed: number;
  failed: number;
  errors: number;
  passRate: number;          // 0-1
  avgProtectedLiteralCoverage: number;  // 0-1
  avgLatencyMs: number;
  semanticScores: {
    completeness: number;
    consistency: number;
    predicateClarity: number;
    roleCoverage: number;
    protectedLiteralPreservation: number;
    overall: number;
  };
}
```

## Integration

### With existing modules

- `RealizationEngine` — produces the realized text per language.
- `ProtectedLiteralDetector` — detects protected literals in source records.
- `SemanticScorer` — scores semantic quality (completeness, consistency, etc.).

### With experiment runner

The runner is compatible with the standard `ExperimentManifest` schema:

```typescript
const manifest: ExperimentManifest = {
  schema: 'openlunum-experiment/0.1',
  id: 'realization-en-el-es-id',
  area: 'realization',
  task: 'realize',
  hypothesis: 'Protected literals preserved across EN/EL/ES/ID realization',
  baselineCommit: 'abc123',
  limits: { maxItems: 100, maxAttemptsPerItem: 1, maxModelCalls: 1000 },
  gates: { minimumFeatureRecall: 0.8, minimumExactRate: 0.5,
           requireProtectedLiteralCoverage: true },
  outputDirectory: 'reports/realization'
};
```

## Tests

13 unit tests in `packages/eval/test/realization-runner.test.ts`:
- All 4 languages tested
- Per-language metrics validation
- Protected-literal coverage scoring
- Semantic score computation
- Summary correctness
- Edge cases (empty dataset, missing literals, missing goldSem)
