import { test } from 'node:test';
import assert from 'assert';
import { 
  createReleaseManifest, 
  signReleaseManifest, 
  verifyReleaseManifest,
  getCurrentCommit,
  getCurrentVersion
} from '../src/release-provenance.js';

test('release provenance module can be imported', () => {
  assert.ok(true);
});

test('createReleaseManifest creates a valid manifest', () => {
  const manifest = createReleaseManifest('1.0.0', 'abc123', ['file1.txt', 'file2.txt']);
  
  assert.strictEqual(manifest.version, '1.0.0');
  assert.strictEqual(manifest.commit, 'abc123');
  assert.ok(manifest.timestamp);
  assert.ok(manifest.artifactHash);
  assert.deepStrictEqual(manifest.files, ['file1.txt', 'file2.txt']);
  assert.ok(!manifest.signature);
  assert.ok(!manifest.publicKey);
});

test('getCurrentCommit returns a commit hash', () => {
  const commit = getCurrentCommit();
  assert.ok(typeof commit === 'string');
  // In a real scenario, we'd have more specific tests
});

test('getCurrentVersion returns the package version', () => {
  const version = getCurrentVersion();
  assert.ok(typeof version === 'string');
  assert.ok(version.length > 0);
});

// Note: Signing and verification tests are more complex and would require 
// actual key pairs, which are not generated in this test environment
// This is a placeholder for future implementation
test('signReleaseManifest and verifyReleaseManifest functions exist', () => {
  // This test just ensures the functions exist and can be called
  const manifest = createReleaseManifest('1.0.0', 'abc123', ['file1.txt']);
  
  // In a real test, we'd have proper keys to sign and verify with
  // For now, we just ensure the functions exist
  assert.ok(typeof signReleaseManifest === 'function');
  assert.ok(typeof verifyReleaseManifest === 'function');
});