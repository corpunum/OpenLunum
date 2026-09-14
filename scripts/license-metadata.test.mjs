// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const requiredPackages = ['core', 'eval', 'cli', 'api', 'mcp', 'adapter-openunum'];
// Tests also create evidence directories under packages/. Only directories
// containing package.json are workspace packages; required manifests below
// must still exist, so a deleted package cannot silently escape validation.
const packages = readdirSync(join(root, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `packages/${entry.name}`)
  .filter((path) => existsSync(join(root, path, 'package.json')));
const metadata = (path) => JSON.parse(read(`${path}/package.json`));

test('the Apache-2.0 license text is complete and unmodified', () => {
  // Standard Apache-2.0 text, including its unfilled instructional appendix.
  const digest = createHash('sha256').update(read('LICENSE')).digest('hex');
  assert.equal(digest, 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30');
  assert.match(read('NOTICE'), /Copyright 2026 Corpunum\./);
});

test('root and workspace metadata use the approved SPDX identifier', () => {
  assert.equal(JSON.parse(read('package.json')).license, 'Apache-2.0');
  for (const name of requiredPackages) {
    assert.ok(packages.includes(`packages/${name}`), `${name}: required package manifest missing`);
  }
  for (const path of packages) assert.equal(metadata(path).license, 'Apache-2.0', path);
});

test('each package carries matching license and attribution copies', () => {
  for (const path of packages) {
    assert.equal(read(`${path}/LICENSE`), read('LICENSE'), path);
    assert.equal(read(`${path}/NOTICE`), read('NOTICE'), path);
    const files = metadata(path).files;
    if (Array.isArray(files)) {
      assert.ok(files.includes('LICENSE'), `${path}: LICENSE missing from files`);
      assert.ok(files.includes('NOTICE'), `${path}: NOTICE missing from files`);
    }
  }
});

test('the license change does not publish packages or claim third-party rights', () => {
  assert.equal(JSON.parse(read('package.json')).private, true);
  for (const name of ['core', 'eval', 'cli', 'adapter-openunum']) {
    assert.equal(metadata(`packages/${name}`).private, true, name);
  }
  assert.match(read('LICENSE.md'), /does \*\*not\*\* relicense third-party code/);
  assert.match(read('LICENSE.md'), /Unclear or missing rights remain unresolved/);
});

test('current visitor pages describe Apache-2.0 rather than the old restriction', () => {
  for (const path of ['README.md', 'START_HERE.md', 'CONTRIBUTING.md', 'STATUS.md']) {
    assert.match(read(path), /Apache-2\.0/, path);
    assert.doesNotMatch(read(path), /not currently open source|all rights reserved, not open source|current terms are \*\*all rights reserved/i, path);
  }
});
