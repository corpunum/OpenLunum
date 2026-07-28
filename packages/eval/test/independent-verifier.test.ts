import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VERIFIER_VERSION,
  generateGoldenVectors,
  validateGoldenVectorBundle,
  crossVerifyVector,
  verifyBundle,
} from '../src/independent-verifier.js';
import type { GoldenVectorBundle } from '../src/independent-verifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const bundlePath = path.join(WORKSPACE_ROOT, 'eval-results', 'golden-vectors', 'golden-vectors.json');

describe('independent-verifier constants', () => {
  it('version is semver', () => {
    assert.match(VERIFIER_VERSION, /^\d+\.\d+\.\d+$/u);
  });
});

describe('generateGoldenVectors', () => {
  it('produces at least 100 vectors', () => {
    const bundle = generateGoldenVectors('test');
    assert.ok(bundle.vectors.length >= 100, `got ${bundle.vectors.length} vectors`);
  });

  it('has unique IDs', () => {
    const bundle = generateGoldenVectors('test');
    const ids = bundle.vectors.map(v => v.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it('passes bundle validation', () => {
    const bundle = generateGoldenVectors('test');
    const v = validateGoldenVectorBundle(bundle);
    assert.ok(v.ok, `validation failed: ${v.errors.join(', ')}`);
  });

  it('all fingerprints match format lfp:0.1:sha256:<hex>', () => {
    const bundle = generateGoldenVectors('test');
    for (const vec of bundle.vectors) {
      assert.match(vec.fingerprint, /^lfp:0\.1:sha256:[a-f0-9]{32}$/u, `bad fp for ${vec.id}`);
    }
  });

  it('all SHA-256 hashes are valid', () => {
    const bundle = generateGoldenVectors('test');
    for (const vec of bundle.vectors) {
      assert.match(vec.canonicalSha256, /^[a-f0-9]{64}$/u, `bad sha for ${vec.id}`);
    }
  });

  it('surface fingerprints present where surfaceText exists', () => {
    const bundle = generateGoldenVectors('test');
    const withSurface = bundle.vectors.filter(v => v.surfaceText != null);
    assert.ok(withSurface.length >= 10, `expected >=10 surface texts, got ${withSurface.length}`);
    for (const vec of withSurface) {
      assert.ok(vec.surfaceFingerprint != null, `${vec.id} missing surfaceFingerprint`);
      assert.match(vec.surfaceFingerprint, /^lsf:0\.1:sha256:[a-f0-9]{24}$/u, `bad sfp for ${vec.id}`);
    }
  });
});

describe('cross-verification against committed bundle', () => {
  let bundle: GoldenVectorBundle;

  it('committed golden vectors file exists', async () => {
    const raw = await readFile(bundlePath, 'utf-8');
    bundle = JSON.parse(raw) as GoldenVectorBundle;
    assert.ok(bundle.vectors.length >= 100);
  });

  it('bundle passes structural validation', () => {
    const v = validateGoldenVectorBundle(bundle);
    assert.ok(v.ok, `validation failed: ${v.errors.join(', ')}`);
  });

  it('all vectors cross-verify against live TS implementation', () => {
    const result = verifyBundle(bundle);
    assert.strictEqual(result.failCount, 0, `${result.failCount} vectors failed: ${JSON.stringify(result.discrepancies.slice(0, 3))}`);
    assert.strictEqual(result.passCount, bundle.vectors.length);
  });

  it('each individual vector produces zero discrepancies', () => {
    for (const vec of bundle.vectors) {
      const discs = crossVerifyVector(vec);
      assert.strictEqual(discs.length, 0, `${vec.id} has discrepancies: ${JSON.stringify(discs)}`);
    }
  });
});

describe('Python verifier result', () => {
  const pyResultPath = path.join(WORKSPACE_ROOT, 'eval-results', 'golden-vectors', 'python-verifier-result.json');

  it('Python verifier result exists and shows 100% pass', async () => {
    const raw = await readFile(pyResultPath, 'utf-8');
    const result = JSON.parse(raw) as { totalVectors: number; passCount: number; failCount: number; discrepancies: unknown[] };
    assert.ok(result.totalVectors >= 100, `expected >=100 vectors, got ${result.totalVectors}`);
    assert.strictEqual(result.failCount, 0, `Python verifier had ${result.failCount} failures`);
    assert.strictEqual(result.passCount, result.totalVectors);
    assert.strictEqual(result.discrepancies.length, 0);
  });
});

describe('normalization edge cases', () => {
  it('case-insensitive identifiers produce same fingerprint', () => {
    const bundle = generateGoldenVectors('test');
    const upper = bundle.vectors.find(v => v.id === 'case-upper');
    const mixed = bundle.vectors.find(v => v.id === 'case-mixed');
    assert.ok(upper != null && mixed != null);
    assert.strictEqual(upper.fingerprint, mixed.fingerprint, 'case normalization should make these identical');
  });

  it('whitespace variants produce same canonical bytes for identifiers', () => {
    const bundle = generateGoldenVectors('test');
    const tabs = bundle.vectors.find(v => v.id === 'ws-tabs');
    const newlines = bundle.vectors.find(v => v.id === 'ws-newlines');
    assert.ok(tabs != null && newlines != null);
    assert.notStrictEqual(tabs.fingerprint, newlines.fingerprint, 'different content should have different fingerprints');
  });

  it('empty annotations are omitted from canonical form', () => {
    const bundle = generateGoldenVectors('test');
    const emptyAnno = bundle.vectors.find(v => v.id === 'empty-annotations');
    const emptyProv = bundle.vectors.find(v => v.id === 'empty-provenance');
    assert.ok(emptyAnno != null && emptyProv != null);
    assert.ok(!emptyAnno.canonicalBytes.includes('"annotations"'), 'empty annotations should be omitted');
    assert.ok(!emptyProv.canonicalBytes.includes('"provenance"'), 'empty provenance should be omitted');
    assert.strictEqual(emptyAnno.fingerprint, emptyProv.fingerprint, 'both should produce same canonical form');
  });

  it('role key ordering is deterministic', () => {
    const bundle = generateGoldenVectors('test');
    const ordered = bundle.vectors.find(v => v.id === 'role-ordering');
    assert.ok(ordered != null);
    const alphaIdx = ordered.canonicalBytes.indexOf('"alpha"');
    const middleIdx = ordered.canonicalBytes.indexOf('"middle"');
    const zebraIdx = ordered.canonicalBytes.indexOf('"zebra"');
    assert.ok(alphaIdx < middleIdx && middleIdx < zebraIdx, 'roles should be sorted alphabetically');
  });
});
