/**
 * Conformance reports for hook/plugin/CLI integrations
 * 
 * This module provides conformance reporting functionality
 * for testing and validating integrations.
 */

// ── Report Configuration ───────────────────────────────────────────

export interface ConformanceReportConfig {
  /** Report format */
  format?: 'json' | 'text' | 'summary';
  /** Include detailed errors */
  includeErrors?: boolean;
  /** Include warnings */
  includeWarnings?: boolean;
  /** Include timing information */
  includeTiming?: boolean;
}

// ── Conformance Check Result ───────────────────────────────────────

export interface ConformanceCheckResult {
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

// ── Conformance Report ─────────────────────────────────────────────

export interface ConformanceReport {
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

// ── Conformance Report Generator ───────────────────────────────────

export class ConformanceReportGenerator {
  private config: Required<ConformanceReportConfig>;
  private reportCount: number;

  constructor(config: ConformanceReportConfig = {}) {
    this.config = {
      format: config.format ?? 'json',
      includeErrors: config.includeErrors ?? true,
      includeWarnings: config.includeWarnings ?? true,
      includeTiming: config.includeTiming ?? true
    };
    this.reportCount = 0;
  }

  /**
   * Generate conformance report for an integration
   */
  generate(integration: 'hook' | 'plugin' | 'cli', checks: ConformanceCheckResult[]): ConformanceReport {
    const startTime = Date.now();
    
    const passedChecks = checks.filter(c => c.passed).length;
    const failedChecks = checks.filter(c => !c.passed).length;
    const warnings = this.config.includeWarnings ? checks.filter(c => c.warning).length : 0;
    
    this.reportCount++;
    
    const report: ConformanceReport = {
      id: `cr:${this.reportCount.toString().padStart(6, '0')}`,
      integration,
      checks,
      passed: failedChecks === 0,
      totalChecks: checks.length,
      passedChecks,
      failedChecks,
      warnings,
      timestamp: startTime,
      duration: 0
    };
    
    if (this.config.includeTiming) {
      const endTime = Date.now();
      report.duration = endTime - startTime;
      for (const check of checks) {
        if (check.timing) {
          check.timing.duration = check.timing.end - check.timing.start;
        }
      }
    }
    
    return report;
  }

  /**
   * Generate report for hook integration
   */
  generateHookReport(checks: ConformanceCheckResult[]): ConformanceReport {
    return this.generate('hook', checks);
  }

  /**
   * Generate report for plugin integration
   */
  generatePluginReport(checks: ConformanceCheckResult[]): ConformanceReport {
    return this.generate('plugin', checks);
  }

  /**
   * Generate report for CLI integration
   */
  generateCliReport(checks: ConformanceCheckResult[]): ConformanceReport {
    return this.generate('cli', checks);
  }

  /**
   * Format report as JSON
   */
  formatAsJson(report: ConformanceReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Format report as text
   */
  formatAsText(report: ConformanceReport): string {
    let text = `Conformance Report: ${report.id}\n`;
    text += `Integration: ${report.integration}\n`;
    text += `Passed: ${report.passed ? 'YES' : 'NO'}\n`;
    text += `Checks: ${report.passedChecks}/${report.totalChecks} passed\n`;
    text += `Failed: ${report.failedChecks}\n`;
    text += `Warnings: ${report.warnings}\n`;
    text += `Duration: ${report.duration}ms\n\n`;
    
    if (this.config.includeErrors || this.config.includeWarnings) {
      for (const check of report.checks) {
        const status = check.passed ? '✓' : '✗';
        text += `${status} ${check.name}`;
        if (check.error) {
          text += ` - ${check.error}`;
        }
        if (check.warning && this.config.includeWarnings) {
          text += ` (warning: ${check.warning})`;
        }
        text += '\n';
      }
    }
    
    return text;
  }

  /**
   * Format report as summary
   */
  formatAsSummary(report: ConformanceReport): string {
    return `${report.integration.toUpperCase()}: ${report.passedChecks}/${report.totalChecks} checks passed${report.failedChecks > 0 ? ` (${report.failedChecks} failed)` : ''}`;
  }

  /**
   * Get report count
   */
  getReportCount(): number {
    return this.reportCount;
  }

  /**
   * Reset report count
   */
  reset(): void {
    this.reportCount = 0;
  }

  /**
   * Get configuration
   */
  getConfig(): Required<ConformanceReportConfig> {
    return { ...this.config };
  }

  /**
   * Set configuration
   */
  setConfig(config: Partial<ConformanceReportConfig>): void {
    if (config.format !== undefined) this.config.format = config.format;
    if (config.includeErrors !== undefined) this.config.includeErrors = config.includeErrors;
    if (config.includeWarnings !== undefined) this.config.includeWarnings = config.includeWarnings;
    if (config.includeTiming !== undefined) this.config.includeTiming = config.includeTiming;
  }
}

// ── Export ─────────────────────────────────────────────────────────

export const conformanceReportExports = [
  ConformanceReportGenerator
] as const;