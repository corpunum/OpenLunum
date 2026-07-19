# Quality Gate CI Integration

Unified quality gate runner for CI pipelines. Runs sem-validation, injection-resistance, renderer-conformance, downstream-quality, and context-quality gates with configurable exit codes.

## Overview

Implements WORK_QUEUE v4 release gate 5: **"Quality gate CI integration"** — run quality gates on every PR that touches `packages/core/src/` or `packages/eval/src/`.

## Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | All gates pass | CI passes |
| 1 | Warnings but overall pass | CI passes with warnings |
| 2 | At least one gate failed | CI fails |

## API

### `runQualityGates(config?)`

Runs all configured quality gates and returns a full report.

```typescript
interface QualityGateCIConfig {
  runInjectionTests?: boolean;       // default: true
  runConformanceSuite?: boolean;     // default: true
  runDownstreamQuality?: boolean;    // default: true
  runContextQuality?: boolean;       // default: false
  minimumPassRate?: number;          // default: 0.8
  strictMode?: boolean;              // default: false
  seedRecords?: LunumSem[];          // optional test records
}

interface QualityGateReport {
  overallStatus: 'pass' | 'warn' | 'fail';
  exitCode: 0 | 1 | 2;
  gates: GateResult[];
  timestamp: string;
  totalGates: number;
  passedGates: number;
  failedGates: number;
  warnedGates: number;
}
```

### `checkQualityGates(config?)`

CI-friendly wrapper returning only the exit code.

```typescript
function checkQualityGates(config?: QualityGateCIConfig): 0 | 1 | 2;
```

### `generateCIReport(report)`

Generates a Markdown report suitable for PR comments.

```typescript
function generateCIReport(report: QualityGateReport): string;
```

## Gates

1. **sem-validation** — Validates Lunum-Sem record structures using `validateSem()`
2. **injection-resistance** — 10 adversarial input tests from `prompt-injection.ts`
3. **renderer-conformance** — Profile round-trip canonicalization from `renderer-conformance.ts`
4. **downstream-quality** — Task success evaluation from `downstream-quality.ts`
5. **context-quality** — Natural vs Lunum vs mixed comparison from `mixed-context-quality.ts`

## CI Integration

### GitHub Actions

The `.github/workflows/quality-gates.yml` workflow runs on PRs that touch:
- `packages/core/src/**`
- `packages/eval/src/**`

### Local Usage

```bash
# Run quality gates and exit on failure
node -e "
  const { checkQualityGates } = require('./packages/core/dist/src/quality-gate-ci.js');
  process.exit(checkQualityGates());
"

# Generate a full report
node -e "
  const { runQualityGates, generateCIReport } = require('./packages/core/dist/src/quality-gate-ci.js');
  const report = runQualityGates();
  console.log(generateCIReport(report));
"
```

## Configuration Examples

### Minimal (CI)

```typescript
checkQualityGates({
  runContextQuality: false,  // skip expensive context tests
});
```

### Strict Mode

```typescript
checkQualityGates({
  strictMode: true,          // any warning becomes fail
  minimumPassRate: 0.9,      // higher threshold
});
```

### Custom Seed Records

```typescript
checkQualityGates({
  seedRecords: [myValidSemRecord],
  runInjectionTests: true,
  runConformanceSuite: true,
  runDownstreamQuality: true,
});
```

## Testing

```bash
# Run quality gate CI tests
node --test packages/core/dist/test/quality-gate-ci.test.js

# Run full verify
pnpm verify
```

## Release Gate Alignment

This implements release gate 5 (safety and quality gates):
- ✅ Quality gates run automatically on PRs touching core/eval
- ✅ Configurable gates with pass/warn/fail semantics
- ✅ CI integration with exit codes
- ✅ Markdown reports for pull request visibility
