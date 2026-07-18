# Mixed-Context Quality Gates

## Purpose

Measures downstream task accuracy with natural vs Lunum vs mixed context on multiple
task types and produces structured quality reports.

This module implements release gate item **"Implement mixed-context quality gates:
measure downstream task accuracy with natural vs Lunum vs mixed context on at least
3 task types"** from WORK_QUEUE v4 (release gate 5).

## Motivation

From VISION.md:
> downstream task quality is preserved or improved

When a system uses Lunum-Sem context instead of raw natural language, we need to
verify that the conversion preserves — and ideally improves — downstream task
accuracy. Mixed-context quality gates provide this verification by comparing all
three context modes across multiple task types.

## Types

### Context Modes

| Mode | Description |
|------|-------------|
| `natural` | Raw human-readable text |
| `lunum` | Structured Lunum-Sem code |
| `mixed` | Hybrid: Lunum code where eligible, natural otherwise |

### Task Types

The gate evaluates the following task types (configurable):

- `qa` — Question answering
- `summarization` — Text summarization
- `extraction` — Information extraction
- `classification` — Text classification
- `generation` — Text generation
- `reasoning` — Logical reasoning

### Quality Metrics

| Metric | Range | Description |
|--------|-------|-------------|
| `accuracy` | 0–1 | Correct predictions / total |
| `semantic_similarity` | 0–1 | Semantic closeness of output |
| `token_efficiency` | 0–1+ | Tokens saved vs raw text |

## Components

### MixedContextQualityGate

Main class for evaluating quality across context modes.

```typescript
const gate = new MixedContextQualityGate({
  reportId: 'my-eval-001',
  taskTypes: ['qa', 'extraction', 'classification'],
  contextModes: ['natural', 'lunum', 'mixed'],
  minimumQuality: 0.7
});

const report = gate.evaluate(messages, recordPresence: 0.5);
```

### MixedContextQualityReport

Structured report containing:

- **measurements** — Per-mode, per-task-quality scores
- **comparisons** — Side-by-side comparison of all three modes per task type
- **summary** — Aggregate statistics (best/worst mode, average token savings)
- **gates** — Gate evaluations for each mode × task type

### Convenience Function

```typescript
import { measureMixedContextQuality } from '@corpunum/lunum';

const report = measureMixedContextQuality(messages, {
  taskTypes: ['qa', 'extraction', 'classification']
});
```

## Usage

### Basic Evaluation

```typescript
import { MixedContextQualityGate } from '@corpunum/lunum';

const gate = new MixedContextQualityGate();
const report = gate.evaluate(messages);

// Access comparison results
for (const comparison of report.comparisons) {
  console.log(`${comparison.taskType}:`);
  console.log(`  natural: ${comparison.naturalQuality}`);
  console.log(`  lunum:   ${comparison.lunumQuality}`);
  console.log(`  mixed:   ${comparison.mixedQuality}`);
  console.log(`  best:    ${comparison.bestMode}`);
}

// Access summary
console.log('Best mode:', report.summary.bestOverallMode);
console.log('Token savings:', report.summary.avgTokenSavings);
```

### Custom Task Types

```typescript
const gate = new MixedContextQualityGate({
  taskTypes: ['qa', 'summarization']
});
```

### Custom Context Modes

```typescript
const gate = new MixedContextQualityGate({
  contextModes: ['lunum', 'mixed']
});
```

### Quality Thresholds

```typescript
const gate = new MixedContextQualityGate({
  minimumQuality: 0.85
});
```

## Architecture

```
ContextMessages → MixedContextQualityGate → MixedContextQualityReport
                                                ↓
                                           GateEvaluation
                                                ↓
                                         Pass/Warn/Fail
```

The gate:
1. Compiles context in each mode using `compileContext()`
2. Estimates quality per mode using heuristics (Lunum code presence, message length, record presence)
3. Compares quality across modes per task type
4. Evaluates against quality gates from `downstream-quality.ts`
5. Produces a structured report

## Integration with Existing Systems

### Downstream Quality Gates

The mixed-context gate integrates with `downstream-quality.ts`:
- Uses `QualityEvaluator` (creates default if not provided)
- Produces `GateEvaluation` objects
- Reports pass/warn/fail per task type

### Context Compilation

Uses `context.ts` `compileContext()` to generate per-mode context:
- `naturalTokens` — Raw text token count
- `lunumTokens` — Lunum code token count
- `mixedTokens` — Hybrid token count
- `estimatedSavings` — Token savings ratio

### Prompt Gates

Complements `prompt-gates.ts`:
- Prompt gates validate individual records
- Mixed-context gates evaluate context quality across modes

## Limitations

- Quality estimation is heuristic-based; production use should replace with
  actual task-success measurements from evaluation harnesses
- Token counting uses character-based estimation (~4 chars per token)
- Comparison assumes equal message sets across modes

## Testing

```bash
# Run mixed-context quality tests
pnpm --filter @corpunum/lunum test:unit -- --test-name-pattern 'mixed-context-quality'

# Run all tests
pnpm verify
```

## References

- WORK_QUEUE v4: Release gate 5 — safety and quality gates
- VISION.md: "downstream task quality is preserved or improved"
- `packages/core/src/mixed-context-quality.ts` — Implementation
- `packages/core/test/mixed-context-quality.test.ts` — Tests
- `packages/core/src/downstream-quality.ts` — Quality gate integration
- `packages/core/src/context.ts` — Context compilation
