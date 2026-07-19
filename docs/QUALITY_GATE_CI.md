# Quality Gate CI Integration

**Status:** Prototype  
**Source:** `packages/core/src/quality-gate-ci.ts`  
**Tests:** `packages/core/test/quality-gate-ci.test.ts`  
**CI Workflow:** `.github/workflows/quality-gate.yml`  
**PR:** #151 (rebuild of stale #97, #98)

## Overview

Unified quality gate runner for CI pipelines. Wraps existing quality gates into a single runnable suite suitable for continuous integration. Implements release gate 5: *Quality gate CI integration: run quality gates on every PR that touches `packages/core/src/` or `packages/eval/src/`.*

## Wrapped Gates

| Gate | Source Module | Default | Description |
|------|---------------|---------|-------------|
| downstream-quality | `downstream-quality.ts` | enabled | Task-success metrics and quality gates |
| mixed-context | `mixed-context-quality.ts` | disabled | Downstream accuracy comparison across natural vs Lunum vs mixed context |
| injection-resistance | `prompt-injection.ts` | enabled | Prompt injection resistance tests against adversarial inputs |
| renderer-conformance | `renderer-conformance.ts` | enabled | Round-trip canonicalization property tests for safe/short/tight profiles |
| prompt-gates | `prompt-gates.ts` | enabled | Lunum-Sem record validation gates |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All gates pass |
| `1` | Warnings present but overall pass |
| `2` | At least one gate failed |

## Configuration

```typescript
interface QualityGateCIConfig {
  runDownstreamQuality?: boolean;       // default: true
  runMixedContext?: boolean;             // default: false
  runInjectionTests?: boolean;           // default: true
  runConformanceSuite?: boolean;         // default: true
  runPromptGates?: boolean;              // default: true
  minimumPassRate?: number;              // default: 0.8 (0-1)
  strictMode?: boolean;                  // default: false (fail on warnings)
}
```

## Types

```typescript
/** Exit code from quality gate run. */
type GateExitCode = 0 | 1 | 2;

/** Individual gate result for CI reporting. */
interface GateResultEntry {
  name: string;
  passed: boolean;
  score: number;
  details?: string[];
  warnings?: string[];
}

/** Full CI report from running all quality gates. */
interface QualityGateCIReport {
  timestamp: number;
  gates: GateResultEntry[];
  overallScore: number;
  exitCode: GateExitCode;
  warnings: string[];
}
```

## API

### `runQualityGates(records, config)`

Run all configured quality gates on the provided records. Returns a `QualityGateCIReport`.

### `checkQualityGates(records, config)`

CI-friendly wrapper that returns an `ExitCode` directly.

### `generateCIReport(report)`

Generate a Markdown report suitable for PR comments. Includes status icons, per-gate scores, and warnings.

## CI Workflow

The `.github/workflows/quality-gate.yml` workflow:

- Triggers on pull requests touching `packages/core/src/**` or `packages/eval/src/**`
- Runs on `ubuntu-latest` with a 15-minute timeout
- Cancels in-progress runs for the same PR
- Loads protected dataset records for evaluation
- Falls back to minimal test records if none found
- Enforces `minimumPassRate: 0.8` by default
- Reports exit codes to GitHub Actions for pass/fail determination

## Honest boundary

This is a prototype runner. It wraps existing gate modules but does not yet support:

- Per-gate pass-rate thresholds (only overall `minimumPassRate`)
- Incremental evaluation (runs all gates on all records)
- Configurable gate enable/disable per environment
- Detailed failure diffing across runs

The runner is intended as a CI scaffolding layer; gate-specific behavior and thresholds are defined in the underlying modules.
