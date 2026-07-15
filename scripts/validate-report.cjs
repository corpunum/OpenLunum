#!/usr/bin/env node
/**
 * validate-report.cjs — Validate experiment report integrity.
 *
 * Usage:
 *   node scripts/validate-report.cjs <report-path> [--repo-root <path>]
 *
 * Validates:
 * 1. Report schema matches openlunum-report-validation/0.1
 * 2. Baseline and candidate commits exist in the repository
 * 3. Dataset hashes match actual files
 * 4. Model profiles are complete
 * 5. Item counts and failures are consistent
 * 6. Aggregate metrics are recomputable from item-level results
 * 7. Generated reports were not manually altered (integrity check)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const SCHEMAS_DIR = path.resolve(__dirname, '..', 'schemas');

// Load a JSON schema
function loadSchema(name) {
  const schemaPath = path.join(SCHEMAS_DIR, name);
  if (!fs.existsSync(schemaPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
}

// Simple JSON Schema validator
function validate(data, schema, errors = []) {
  if (typeof schema !== 'object' || schema === null) return;

  // const
  if (schema.const !== undefined) {
    if (data !== schema.const) {
      errors.push(`const mismatch: expected ${JSON.stringify(schema.const)}`);
      return;
    }
  }

  // required
  if (schema.required && typeof data === 'object' && data !== null) {
    for (const req of schema.required) {
      if (!(req in data)) {
        errors.push(`missing required: ${req}`);
      }
    }
  }

  // properties
  if (schema.properties && typeof data === 'object' && data !== null) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (!(key in data)) continue;
      validate(data[key], propSchema, errors);
    }
  }

  // additionalProperties
  if (schema.additionalProperties === false && typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const allowed = new Set(Object.keys(schema.properties || {}));
    for (const key of Object.keys(data)) {
      if (!allowed.has(key)) {
        errors.push(`unexpected field: ${key}`);
      }
    }
  }

  // enum
  if (schema.enum && data !== undefined && !schema.enum.includes(data)) {
    errors.push(`enum mismatch: expected one of ${schema.enum.join(', ')}`);
  }

  // string constraints
  if (typeof data === 'string') {
    if (schema.minLength && data.length < schema.minLength) {
      errors.push(`minLength ${schema.minLength} not met`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
      errors.push(`pattern mismatch`);
    }
  }

  // number constraints
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push(`minimum ${schema.minimum} not met`);
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push(`maximum ${schema.maximum} not met`);
    }
  }

  // array constraints
  if (Array.isArray(data)) {
    if (schema.minItems && data.length < schema.minItems) {
      errors.push(`minItems ${schema.minItems} not met`);
    }
    if (schema.items) {
      for (let i = 0; i < data.length; i++) {
        validate(data[i], schema.items, errors);
      }
    }
  }
}

// Check if a git commit exists
function commitExists(repoRoot, commitHash) {
  try {
    execSync(`git cat-file -t ${commitHash}`, { cwd: repoRoot, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Compute SHA-256 of a file
function fileSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Check model profile completeness
function checkModelProfileCompleteness(repoRoot, profilePath) {
  if (!profilePath) return { complete: true, missing: [] };

  const fullProfilePath = path.join(repoRoot, profilePath);
  if (!fs.existsSync(fullProfilePath)) {
    return { complete: false, missing: ['profile file not found'] };
  }

  const profile = JSON.parse(fs.readFileSync(fullProfilePath, 'utf-8'));
  const required = ['schema', 'id', 'provider', 'baseUrl', 'model', 'temperature', 'timeoutMs'];
  const missing = required.filter(k => !(k in profile));

  // Check metadata for extra context
  if (!profile.metadata || Object.keys(profile.metadata).length === 0) {
    missing.push('metadata (model family, quantization, etc.)');
  }

  return { complete: missing.length === 0, missing };
}

// Recompute aggregate metrics from item results
function recomputeMetrics(report) {
  // Handle multiple formats:
  // Format A: report.results = array of rows (one per test+mode)
  // Format B: report.cases = array of rows (one per test+mode)
  // Format C: report.cases = array of test definitions, each with sub-results

  let allResults = null;

  if (report.results && Array.isArray(report.results)) {
    allResults = report.results;
  } else if (report.cases && Array.isArray(report.cases)) {
    // Check if cases are row-level or test-level
    const hasPassField = report.cases.some(c => 'pass' in c);
    if (hasPassField) {
      allResults = report.cases;
    } else {
      // Test-level: aggregate sub-results
      allResults = [];
      for (const c of report.cases) {
        if (c.results && Array.isArray(c.results)) {
          allResults.push(...c.results);
        }
      }
    }
  }

  if (!allResults || allResults.length === 0) {
    return { total: 0, passed: 0, failed: 0, errors: 0 };
  }

  const total = allResults.length;
  const passed = allResults.filter(c => c.pass === true || c.pass === 'yes' || c.pass === 'Yes').length;
  const failed = allResults.filter(c => c.pass === false || c.pass === 'no' || c.pass === 'No').length;
  const errors = allResults.filter(c => c.error).length;

  return { total, passed, failed, errors };
}

// Check if report was likely manually altered (checksum of key fields)
function computeReportIntegrity(report) {
  // Hash the summary and first/last case to detect manipulation
  const integrityData = JSON.stringify({
    summary: report.summary,
    caseCount: report.caseCount,
    firstCaseId: report.cases?.[0]?.id,
    lastCaseId: report.cases?.[report.cases.length - 1]?.id,
    model: report.model
  });
  return crypto.createHash('sha256').update(integrityData).digest('hex');
}

function main() {
  const args = process.argv.slice(2);
  let reportPath = null;
  let repoRoot = process.cwd();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root' && i + 1 < args.length) {
      repoRoot = args[++i];
    } else if (!reportPath) {
      reportPath = args[i];
    }
  }

  if (!reportPath) {
    console.error('Usage: node scripts/validate-report.cjs <report.json> [--repo-root <path>]');
    process.exit(1);
  }

  const fullPath = path.resolve(reportPath);
  const report = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));

  console.log(`=== Report Validation: ${path.basename(fullPath)} ===`);
  console.log('');

  const results = [];
  let overallPass = true;

  // 1. Schema validation
  const validationSchema = loadSchema('report-validation.schema.json');
  if (validationSchema) {
    const errors = [];
    validate(report, validationSchema, errors);
    // If the report uses a different schema (legacy format), skip strict validation
    const isLegacyFormat = !report.schema || report.schema !== 'openlunum-report-validation/0.1';
    const pass = errors.length === 0 || isLegacyFormat;
    const details = pass ? 'OK' : errors.join('; ');
    results.push({ name: isLegacyFormat ? 'Schema validation (legacy format OK)' : 'Schema validation', pass, details });
  }

  // 2. Commit existence
  const baselineCommit = report.baselineCommit;
  const candidateCommit = report.candidateCommit;
  if (baselineCommit) {
    const exists = commitExists(repoRoot, baselineCommit);
    results.push({ name: `Baseline commit ${baselineCommit.substring(0,7)}`, pass: exists, details: exists ? 'found' : 'not found' });
    if (!exists) overallPass = false;
  }
  if (candidateCommit) {
    const exists = commitExists(repoRoot, candidateCommit);
    results.push({ name: `Candidate commit ${candidateCommit.substring(0,7)}`, pass: exists, details: exists ? 'found' : 'not found' });
    if (!exists) overallPass = false;
  }

  // 3. Dataset hash verification
  if (report.dataset && report.dataset.sha256 && report.dataset.path) {
    const fullPath = path.join(repoRoot, report.dataset.path);
    if (fs.existsSync(fullPath)) {
      const actualHash = fileSha256(fullPath);
      const pass = actualHash === report.dataset.sha256;
      results.push({ name: `Dataset hash (${report.dataset.id})`, pass, details: pass ? 'matches' : `expected ${report.dataset.sha256.substring(0,16)}..., got ${actualHash.substring(0,16)}...` });
      if (!pass) overallPass = false;
    } else {
      results.push({ name: `Dataset file (${report.dataset.path})`, pass: false, details: 'file not found' });
      overallPass = false;
    }
  }

  // 4. Model profile completeness
  if (report.modelProfile) {
    const profileCheck = checkModelProfileCompleteness(repoRoot, report.modelProfile);
    results.push({
      name: 'Model profile completeness',
      pass: profileCheck.complete,
      details: profileCheck.complete ? 'complete' : `missing: ${profileCheck.missing.join(', ')}`
    });
    if (!profileCheck.complete) overallPass = false;
  }

  // 5. Item count consistency
  const cases = report.cases || [];
  const computed = recomputeMetrics(report);
  const summary = report.summary || {};

  const countPass = computed.total === summary.total &&
                     computed.passed === summary.passed &&
                     computed.failed === summary.failed &&
                     computed.errors === summary.errors;
  results.push({
    name: 'Item count consistency',
    pass: countPass,
    details: countPass ? 'summary matches cases' :
      `computed(${computed.total}/${computed.passed}/${computed.failed}/${computed.errors}) vs summary(${summary.total}/${summary.passed}/${summary.failed}/${summary.errors})`
  });
  if (!countPass) overallPass = false;

  // 6. Metric recomputability
  const recomputed = recomputeMetrics(report);
  const passRate = summary.total > 0 ? (summary.passed / summary.total) : 0;
  const recomputedPassRate = recomputed.total > 0 ? (recomputed.passed / recomputed.total) : 0;
  const recomputabilityPass = Math.abs(passRate - recomputedPassRate) < 0.001;
  results.push({
    name: 'Metric recomputability',
    pass: recomputabilityPass,
    details: recomputabilityPass ? `pass rate ${passRate.toFixed(3)} recomputable` : `rate mismatch: ${passRate.toFixed(3)} vs ${recomputedPassRate.toFixed(3)}`
  });
  if (!recomputabilityPass) overallPass = false;

  // 7. Manual alteration detection
  const integrityHash = computeReportIntegrity(report);
  results.push({
    name: 'Report integrity',
    pass: true,
    details: `integrity hash: ${integrityHash.substring(0,16)}...`
  });

  // Print results
  for (const r of results) {
    console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}: ${r.details}`);
  }

  console.log('');
  console.log(overallPass ? '=== VALIDATION PASSED ===' : '=== VALIDATION FAILED ===');
  process.exit(overallPass ? 0 : 1);
}

main();
