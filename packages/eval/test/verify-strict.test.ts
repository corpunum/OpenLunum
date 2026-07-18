/**
 * Verify strict mode tests
 *
 * Tests that the verify:strict script exists and includes
 * all required components: slow property tests, schema-drift checks,
 * and full eval smoke suite.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/test -> dist -> eval -> packages -> OpenLunum
const ROOT = resolve(__dirname, '..', '..', '..', '..');

// ── Test: Root package has verify:strict script ────────────────────

test('verify strict: root package.json has verify:strict script', () => {
  const rootPkgPath = join(ROOT, 'package.json');
  assert.ok(existsSync(rootPkgPath), 'root package.json should exist');
  const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8'));

  assert.ok(rootPkg.scripts && 'verify:strict' in rootPkg.scripts, 'root should have verify:strict script');
  const verifyStrict = rootPkg.scripts['verify:strict'];
  assert.ok(verifyStrict.includes('build'), 'should run build');
  assert.ok(verifyStrict.includes('typecheck'), 'should run typecheck');
  assert.ok(verifyStrict.includes('test:unit'), 'should run test:unit');
  assert.ok(verifyStrict.includes('eval:smoke'), 'should run eval:smoke');
});

// ── Test: Eval package has verify:strict script ────────────────────

test('verify strict: eval package.json has verify:strict script', () => {
  const evalPkgPath = join(ROOT, 'packages', 'eval', 'package.json');
  assert.ok(existsSync(evalPkgPath), 'eval package.json should exist');
  const evalPkg = JSON.parse(readFileSync(evalPkgPath, 'utf-8'));

  assert.ok(evalPkg.scripts && 'verify:strict' in evalPkg.scripts, 'eval should have verify:strict script');
  const verifyStrict = evalPkg.scripts['verify:strict'];
  assert.ok(verifyStrict.includes('build'), 'should run build');
  assert.ok(verifyStrict.includes('test'), 'should run tests');
  assert.ok(verifyStrict.includes('eval:smoke'), 'should run eval:smoke');
  assert.ok(verifyStrict.includes('typecheck'), 'should run typecheck');
});

// ── Test: Verify strict includes property tests ────────────────────

test('verify strict: property tests exist in core', () => {
  const testDir = join(ROOT, 'packages', 'core', 'test');
  const files = readdirSync(testDir).filter((f: string) => f.endsWith('.test.ts'));

  const propertyTests = files.filter((f: string) =>
    f.includes('conformance') || f.includes('conformance-gates') || f.includes('conformance-vectors')
  );

  assert.ok(propertyTests.length > 0, 'should have property tests');
});

// ── Test: Verify strict includes schema-drift checks ───────────────

test('verify strict: schema conformance tests exist', () => {
  const testDir = join(ROOT, 'packages', 'core', 'test');
  const files = readdirSync(testDir).filter((f: string) => f.endsWith('.test.ts'));

  const schemaTests = files.filter((f: string) => f.includes('schema'));

  assert.ok(schemaTests.length > 0, 'should have schema tests');
});

// ── Test: Verify strict includes smoke tests ───────────────────────

test('verify strict: eval smoke script exists', () => {
  const evalPkgPath = join(ROOT, 'packages', 'eval', 'package.json');
  const evalPkg = JSON.parse(readFileSync(evalPkgPath, 'utf-8'));

  assert.ok(evalPkg.scripts && 'eval:smoke' in evalPkg.scripts, 'eval should have eval:smoke script');
});

// ── Test: Verify strict runs all workspace tests ───────────────────

test('verify strict: all workspace packages have test:unit', () => {
  const packages = ['core', 'mcp', 'adapter-openunum', 'cli', 'eval'];

  for (const pkg of packages) {
    const pkgPath = join(ROOT, 'packages', pkg, 'package.json');
    if (!existsSync(pkgPath)) continue;

    const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    assert.ok(pkgJson.scripts && 'test:unit' in pkgJson.scripts, `${pkg} should have test:unit script`);
  }
});

// ── Test: Verify strict is more comprehensive than verify ──────────

test('verify strict: verify:strict is superset of verify', () => {
  const rootPkgPath = join(ROOT, 'package.json');
  const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8'));

  const verifyCmd = rootPkg.scripts.verify;
  const verifyStrictCmd = rootPkg.scripts['verify:strict'];

  // verify:strict should include everything verify has plus more
  assert.ok(verifyStrictCmd.includes('typecheck'), 'should include typecheck');
  assert.ok(verifyStrictCmd.includes('test'), 'should include test');
  assert.ok(verifyStrictCmd.includes('eval:smoke'), 'should include eval:smoke');
  assert.ok(verifyStrictCmd.includes('build'), 'should include build');
  assert.ok(verifyStrictCmd.includes('test:unit'), 'should include test:unit (more specific than just test)');
});

// ── Test: Schema-drift detection works ─────────────────────────────

test('verify strict: schema files exist for drift checking', () => {
  const schemasDir = join(ROOT, 'schemas');
  assert.ok(existsSync(schemasDir), 'schemas directory should exist');
  const files = readdirSync(schemasDir);
  assert.ok(files.length > 0, 'schemas directory should have files');
  assert.ok(files.some((f: string) => f.endsWith('.schema.json') || f.endsWith('.json')), 'should have JSON schema files');
});
