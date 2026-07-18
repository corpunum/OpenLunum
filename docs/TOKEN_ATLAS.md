# Token Atlas

> P2-renderer v2: measure natural vs safe/short/tight renderings with exact
> tokenizer counts on at least 3 named local models.

## Overview

`TokenAtlas` (package `@corpunum/lunum`) measures token counts for four
Lunum rendering profiles — **natural**, **safe**, **short**, and **tight** —
across multiple named local models, producing per-model aggregates (average,
median, standard deviation, range) and per-profile reduction percentages.

## API

```typescript
import { TokenAtlas } from '@corpunum/lunum';

// Create an atlas with at least 3 named models
const atlas = new TokenAtlas([
  { name: 'llama3.1-8b', tokenizer: { model: 'llama3.1', addBos: true, addEos: true } },
  { name: 'qwen2.5-7b',  tokenizer: { model: 'qwen2.5', addBos: true, addEos: true } },
  { name: 'mistral-7b',  tokenizer: { model: 'mistral', addBos: true, addEos: true } }
]);

// Measure one or more records
const entry = atlas.measure(record);
const entries = atlas.measureBatch(records);

// Generate a report
const report = atlas.report({ title: 'Token Atlas Report' });

// Access results
console.log(report.models);        // ['llama3.1-8b', 'qwen2.5-7b', 'mistral-7b']
console.log(report.aggregates);    // per-model averages, medians, stdDevs, ranges, avgReduction
```

### Convenience factory

```typescript
const atlas = TokenAtlas.withCommonModels(); // 3 pre-configured models
```

## Architecture

- **Language-neutral**: TokenAtlas only counts tokens; it does not depend on
  any particular model's inference code.
- **Model identity explicit**: Every model is identified by a `name` string
  and a `LlamaTokenizerConfig`.
- **Minimum three models**: The constructor throws if fewer than 3 models
  are provided, matching the v2 requirement for a "Token Atlas".
- **Profile chain**: For each record the atlas:
  1. Counts tokens for the **natural** rendering (source text or first Lunum
     code rendering).
  2. Calls `ProfileGenerator.profile(record, profile)` for **safe**, **short**,
     and **tight**, then counts tokens for each profiled record.

## Report structure

```typescript
interface AtlasReport {
  title: string;
  models: string[];
  profiles: ('natural' | 'safe' | 'short' | 'tight')[];
  totalRecords: number;
  aggregates: Record<string, AtlasModelAggregates>;
  entries: AtlasEntry[];
  generatedAt: number;
}
```

Each `AtlasModelAggregates` contains `averages`, `medians`, `stdDevs`,
`ranges`, and `avgReduction` (percentage reduction relative to natural).

## Integration with profile-selection

Token Atlas is the measurement foundation for the P2-renderer v2 item
"Renderer profile selection driven by Token Atlas measurements".  The
`ProfileSelector` class (in `packages/core/src/profile-selector.ts`) reads
these aggregates to recommend the best profile per model.

## Tests

15 unit tests in `packages/core/test/token-atlas.test.ts` cover:
- Constructor validation (min 3 models)
- Single and batch measurement
- Profile reduction verification
- Report generation with aggregates
- Lifecycle (clear, getModels copy, getEntries copy)
- Edge cases (empty text, existing renderings)
