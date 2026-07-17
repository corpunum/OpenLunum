# Conformance Reports

This document describes the conformance reports for hook/plugin/CLI integrations in OpenLunum.

## Overview

The conformance reports provide:
- Integration-specific conformance checking
- Multiple report formats (JSON, text, summary)
- Timing information
- Clear pass/fail metrics

## Report Configuration

### ConformanceReportConfig

```typescript
interface ConformanceReportConfig {
  /** Report format */
  format?: 'json' | 'text' | 'summary';
  /** Include detailed errors */
  includeErrors?: boolean;
  /** Include warnings */
  includeWarnings?: boolean;
  /** Include timing information */
  includeTiming?: boolean;
}
```

### Default Values

```typescript
{
  format: 'json',
  includeErrors: true,
  includeWarnings: true,
  includeTiming: true
}
```

## Check Result

### ConformanceCheckResult

```typescript
interface ConformanceCheckResult {
  /** Check name */
  name: string;
  /** Whether the check passed */
  passed: boolean;
  /** Error message if failed */
  error?: string;
  /** Warning message if any */
  warning?: string;
  /** Timing information */
  timing?: {
    start: number;
    end: number;
    duration: number;
  };
}
```

## Report Structure

### ConformanceReport

```typescript
interface ConformanceReport {
  /** Report ID */
  id: string;
  /** Integration type */
  integration: 'hook' | 'plugin' | 'cli';
  /** Checks performed */
  checks: ConformanceCheckResult[];
  /** Overall status */
  passed: boolean;
  /** Total checks */
  totalChecks: number;
  /** Passed checks */
  passedChecks: number;
  /** Failed checks */
  failedChecks: number;
  /** Warnings */
  warnings: number;
  /** Timestamp */
  timestamp: number;
  /** Duration */
  duration: number;
}
```

## Usage Examples

### Generate Hook Report

```typescript
import { ConformanceReportGenerator } from '@corpunum/lunum';

const generator = new ConformanceReportGenerator();

const checks = [
  { name: 'hook1', passed: true },
  { name: 'hook2', passed: true }
];

const report = generator.generateHookReport(checks);
console.log('Report ID:', report.id);
console.log('Passed:', report.passed);
```

### Generate Plugin Report

```typescript
const checks = [
  { name: 'plugin1', passed: true },
  { name: 'plugin2', passed: false, error: 'Failed' }
];

const report = generator.generatePluginReport(checks);
console.log('Failed:', report.failedChecks);
```

### Generate CLI Report

```typescript
const checks = [
  { name: 'cli1', passed: true },
  { name: 'cli2', passed: true }
];

const report = generator.generateCliReport(checks);
console.log('Report:', report);
```

### Format as JSON

```typescript
const json = generator.formatAsJson(report);
console.log(json);
```

### Format as Text

```typescript
const text = generator.formatAsText(report);
console.log(text);
```

### Format as Summary

```typescript
const summary = generator.formatAsSummary(report);
console.log(summary);
// Output: "HOOK: 2/2 checks passed"
```

## Integration Testing

### Hook Integration

```typescript
const checks = [
  { name: 'registerHook', passed: true },
  { name: 'executeHook', passed: true },
  { name: 'cleanupHook', passed: true }
];

const report = generator.generateHookReport(checks);
```

### Plugin Integration

```typescript
const checks = [
  { name: 'loadPlugin', passed: true },
  { name: 'initializePlugin', passed: true },
  { name: 'executePlugin', passed: true }
];

const report = generator.generatePluginReport(checks);
```

### CLI Integration

```typescript
const checks = [
  { name: 'parseArgs', passed: true },
  { name: 'executeCommand', passed: true },
  { name: 'outputResult', passed: true }
];

const report = generator.generateCliReport(checks);
```

## Best Practices

### 1. Include Timing
```typescript
const generator = new ConformanceReportGenerator({
  includeTiming: true
});
```

### 2. Include Warnings
```typescript
const generator = new ConformanceReportGenerator({
  includeWarnings: true
});
```

### 3. Use Summary for CI/CD
```typescript
const summary = generator.formatAsSummary(report);
console.log(summary);
// Use in CI/CD pipelines
```

### 4. Use JSON for Parsing
```typescript
const json = generator.formatAsJson(report);
const parsed = JSON.parse(json);
// Use for automated analysis
```

## Report Formats

### JSON Format
- Full report structure
- Machine-readable
- Includes all details

### Text Format
- Human-readable
- Includes check results
- Shows errors and warnings

### Summary Format
- Concise overview
- Pass/fail count
- Ideal for logs

## Integration with Testing

### Jest Integration

```typescript
import { ConformanceReportGenerator } from '@corpunum/lunum';

describe('Hook Integration', () => {
  it('should pass conformance checks', () => {
    const generator = new ConformanceReportGenerator();
    const report = generator.generateHookReport(checks);
    expect(report.passed).toBe(true);
  });
});
```

### Mocha Integration

```typescript
const generator = new ConformanceReportGenerator();

describe('Plugin Integration', function() {
  it('should pass conformance checks', function() {
    const report = generator.generatePluginReport(checks);
    assert.strictEqual(report.passed, true);
  });
});
```

## Limitations

- Report IDs are sequential
- No persistence between runs
- No automatic check generation

## Future Enhancements

### Planned Features
- File-based persistence
- Automatic check generation
- Historical trend analysis
- Custom check types

### Integrations
- CI/CD pipeline integration
- Dashboard for report visualization
- Alerting on failures