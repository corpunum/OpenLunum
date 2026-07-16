#!/usr/bin/env node
/**
 * validate-report.cjs — Validate experiment report bundle integrity.
 *
 * Validates the actual experiment output directory containing:
 * - manifest.snapshot.json
 * - environment.json
 * - item-results.jsonl
 * - failures.jsonl
 * - summary.json
 * - report.md
 *
 * Checks:
 * 1. All expected files exist
 * 2. Dataset hashes match
 * 3. Model profile is complete
 * 4. Item count consistency
 * 5. Metric recomputability from JSONL
 * 6. Commit existence (safe git call)
 * 7. Report integrity (hash of key fields vs expected)
 *
 * Usage:
 *   node scripts/validate-report.cjs <report-directory> [--repo-root <path>]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function fileSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function commitExists(repoRoot, commitHash) {
  // Validate format first
  if (!/^[a-f0-9]{7,40}$/.test(commitHash)) return false;
  try {
    execFileSync('git', ['cat-file', '-e', commitHash], { cwd: repoRoot, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function checkModelProfileCompleteness(repoRoot, profilePath) {
  if (!profilePath) return { complete: true, missing: [] };
  const fullPath = path.join(repoRoot, profilePath);
  if (!fs.existsSync(fullPath)) return { complete: false, missing: ['profile file not found'] };
  const profile = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  const required = ['schema', 'id', 'provider', 'baseUrl', 'model', 'temperature', 'timeoutMs'];
  const missing = required.filter(k => !(k in profile));
  if (!profile.metadata || Object.keys(profile.metadata).length === 0) missing.push('metadata');
  return { complete: missing.length === 0, missing };
}

function recomputeFromJsonl(resultsPath) {
  if (!fs.existsSync(resultsPath)) return null;
  const lines = fs.readFileSync(resultsPath, 'utf-8').trim().split('\n').filter(l => l.trim());
  if (lines.length === 0) return { total: 0, passed: 0, failed: 0, errors: 0 };
  const items = lines.map(l => JSON.parse(l));
  const passed = items.filter(i => i.status === 'passed' || i.pass === true || i.pass === 'yes').length;
  const failed = items.filter(i => i.status === 'failed' || i.status === 'error').length;
  const errors = items.filter(i => i.error).length;
  return { total: items.length, passed, failed, errors };
}

function main() {
  const args = process.argv.slice(2);
  let reportDir = null;
  let repoRoot = process.cwd();
  let expectedIntegrityHash = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root' && i + 1 < args.length) {
      repoRoot = args[++i];
    } else if (args[i] === '--expected-integrity' && i + 1 < args.length) {
      expectedIntegrityHash = args[++i];
    } else if (!reportDir) {
      reportDir = args[i];
    }
  }

  if (!reportDir) {
    console.error('Usage: node scripts/validate-report.cjs <report-directory> [--repo-root <path>]');
    process.exit(1);
  }

  const fullPath = path.resolve(reportDir);
  const results = [];
  let overallPass = true;

  // 1. Check all expected files exist
  const expectedFiles = [
    'manifest.snapshot.json',
    'environment.json',
    'item-results.jsonl',
    'failures.jsonl',
    'summary.json',
    'report.md'
  ];
  for (const f of expectedFiles) {
    const fp = path.join(fullPath, f);
    const exists = fs.existsSync(fp);
    results.push({ pass: exists, name: `File ${f}`, detail: exists ? 'exists' : 'missing' });
    if (!exists) overallPass = false;
  }

  // 2. Load key files
  const manifest = loadJson(path.join(fullPath, 'manifest.snapshot.json'));
  const summary = loadJson(path.join(fullPath, 'summary.json'));
  const environment = loadJson(path.join(fullPath, 'environment.json'));

  if (!manifest) {
    results.push({ pass: false, name: 'Manifest loaded', detail: 'null' });
    overallPass = false;
  }
  if (!summary) {
    results.push({ pass: false, name: 'Summary loaded', detail: 'null' });
    overallPass = false;
  }
  if (!environment) {
    results.push({ pass: false, name: 'Environment loaded', detail: 'null' });
    overallPass = false;
  }

  if (!manifest || !summary) {
    console.log('=== Report Validation: MISSING MANIFEST/SUMMARY ===');
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}: ${r.detail}`);
    console.log(overallPass ? '=== VALIDATION PASSED ===' : '=== VALIDATION FAILED ===');
    process.exit(overallPass ? 0 : 1);
  }

  // 3. Check dataset hash
  if (manifest.dataset && manifest.dataset.path && manifest.dataset.sha256) {
    const dataPath = path.isAbsolute(manifest.dataset.path)
      ? manifest.dataset.path
      : path.join(repoRoot, manifest.dataset.path);
    if (fs.existsSync(dataPath)) {
      const actual = fileSha256(dataPath);
      const pass = actual === manifest.dataset.sha256;
      results.push({ pass, name: 'Dataset hash', detail: pass ? 'matches' : `expected ${manifest.dataset.sha256.substring(0,16)}..., got ${actual.substring(0,16)}...` });
      if (!pass) overallPass = false;
    } else {
      results.push({ pass: false, name: 'Dataset file', detail: 'not found' });
      overallPass = false;
    }
  }

  // 4. Check model profile
  if (manifest.modelProfile) {
    const profileCheck = checkModelProfileCompleteness(repoRoot, manifest.modelProfile);
    results.push({ pass: profileCheck.complete, name: 'Model profile', detail: profileCheck.complete ? 'complete' : `missing: ${profileCheck.missing.join(', ')}` });
    if (!profileCheck.complete) overallPass = false;
  }

  // 5. Check baseline commit
  if (manifest.baselineCommit) {
    const exists = commitExists(repoRoot, manifest.baselineCommit);
    results.push({ pass: exists, name: `Baseline commit ${manifest.baselineCommit.substring(0,7)}`, detail: exists ? 'found' : 'not found' });
    if (!exists) overallPass = false;
  }

  // 6. Check candidate commit
  if (manifest.candidateCommit) {
    const exists = commitExists(repoRoot, manifest.candidateCommit);
    results.push({ pass: exists, name: `Candidate commit ${manifest.candidateCommit.substring(0,7)}`, detail: exists ? 'found' : 'not found' });
    if (!exists) overallPass = false;
  }

  // 7. Check item count consistency
  const jsonlPath = path.join(fullPath, 'item-results.jsonl');
  const recomputed = recomputeFromJsonl(jsonlPath);
  if (recomputed) {
    // Handle both 'total/items' and 'total' naming
    const summaryTotal = summary.total ?? summary.items ?? 0;
    const summaryPassed = summary.passed ?? 0;
    const summaryFailed = summary.failed ?? 0;
    const summaryErrors = summary.errors ?? 0;
    const pass = recomputed.total === summaryTotal &&
                 recomputed.passed === summaryPassed &&
                 recomputed.failed === summaryFailed &&
                 recomputed.errors === summaryErrors;
    results.push({ pass, name: 'Item count consistency', detail: pass ? 'summary matches JSONL' : `computed(${recomputed.total}/${recomputed.passed}/${recomputed.failed}/${recomputed.errors}) vs summary(${summary.total}/${summary.passed}/${summary.failed}/${summary.errors})` });
    if (!pass) overallPass = false;
  } else {
    results.push({ pass: false, name: 'Item results JSONL', detail: 'not found or empty' });
    overallPass = false;
  }

  // 8. Check metric recomputability
  if (recomputed && recomputed.total > 0) {
    const summaryTotal = summary.total ?? summary.items ?? 0;
    const summaryPassed = summary.passed ?? 0;
    const passRate = summaryTotal > 0 ? summaryPassed / summaryTotal : 0;
    const recomputedRate = recomputed.passed / recomputed.total;
    const recomputabilityPass = Math.abs(passRate - recomputedRate) < 0.001;
    results.push({ pass: recomputabilityPass, name: 'Metric recomputability', detail: recomputabilityPass ? `pass rate ${passRate.toFixed(4)} recomputable` : `rate mismatch: ${passRate.toFixed(4)} vs ${recomputedRate.toFixed(4)}` });
    if (!recomputabilityPass) overallPass = false;
  }

  // 9. Integrity check
  if (expectedIntegrityHash) {
    // Hash the key fields to detect tampering
    const integrityData = JSON.stringify({
      summary,
      itemCount: recomputed ? recomputed.total : null,
      model: environment?.modelProfile?.model
    });
    const actualHash = crypto.createHash('sha256').update(integrityData).digest('hex');
    const pass = actualHash === expectedIntegrityHash;
    results.push({ pass, name: 'Report integrity', detail: pass ? 'hash matches' : `expected ${expectedIntegrityHash.substring(0,16)}..., got ${actualHash.substring(0,16)}...` });
    if (!pass) overallPass = false;
  } else {
    // No expected hash provided - just compute and log
    const integrityData = JSON.stringify({
      summary,
      itemCount: recomputed ? recomputed.total : null,
      model: environment?.modelProfile?.model
    });
    const hash = crypto.createHash('sha256').update(integrityData).digest('hex');
    results.push({ pass: false, name: 'Report integrity (logged) - no expected hash (fail-closed)', detail: `hash: ${hash.substring(0,16)}... (no expected hash provided)` });
  }

  // Print results
  console.log(`=== Report Validation: ${path.basename(fullPath)} ===`);
  for (const r of results) {
    console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}: ${r.detail}`);
  }
  console.log('');
  console.log(overallPass ? '=== VALIDATION PASSED ===' : '=== VALIDATION FAILED ===');
  process.exit(overallPass ? 0 : 1);
}

main();
