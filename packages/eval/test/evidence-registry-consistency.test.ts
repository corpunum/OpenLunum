/**
 * Consistency check for issue #358 (readiness R13.2).
 *
 * docs/LUNUM_READINESS.md's "Evidence and evaluation ledger" table is the
 * human-readable tracker; reports/evidence-registry.json is the
 * machine-readable registry built from it. This test parses both and fails
 * if either has a row/entry the other does not, so the two can never
 * silently drift apart.
 *
 * This test is read-only with respect to docs/LUNUM_READINESS.md -- it never
 * writes to the tracker, only parses its committed content.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { findWorkspaceRoot } from '../src/io.js';

const LEDGER_RELATIVE_PATH = 'docs/LUNUM_READINESS.md';
const REGISTRY_RELATIVE_PATH = 'reports/evidence-registry.json';

interface RegistryEntry {
  ledgerRowId: number;
  ledgerText: string;
  prNumbers: number[];
  issueNumbers: number[];
  mergeCommits: Array<{ pr: number; sha: string; verified: boolean }>;
  verificationStatus: string;
}

interface Registry {
  entries: RegistryEntry[];
}

/**
 * Extract the rows of the "Evidence and evaluation ledger" markdown table
 * from docs/LUNUM_READINESS.md. Returns the raw first-column cell text for
 * every data row (skipping the header and separator rows).
 */
function parseLedgerRows(markdown: string): string[] {
  const headingIndex = markdown.indexOf('## Evidence and evaluation ledger');
  assert.notEqual(headingIndex, -1, 'Could not find the "Evidence and evaluation ledger" heading in docs/LUNUM_READINESS.md');

  // The next '## ' heading marks the end of this section.
  const afterHeading = markdown.slice(headingIndex + '## Evidence and evaluation ledger'.length);
  const nextHeadingIndex = afterHeading.indexOf('\n## ');
  const section = nextHeadingIndex === -1 ? afterHeading : afterHeading.slice(0, nextHeadingIndex);

  const lines = section.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|'));

  // First table line is the header ('| Evidence | ... |'), second is the
  // separator ('|---|---|...'). Data rows follow.
  assert.ok(lines.length >= 2, 'Ledger table has no rows');
  const headerLine = lines[0] ?? '';
  const separatorLine = lines[1] ?? '';
  assert.match(headerLine, /\|\s*Evidence\s*\|/, 'Unexpected ledger table header');
  assert.match(separatorLine, /^\|[-\s|]+\|$/, 'Unexpected ledger table separator row');

  const dataRows = lines.slice(2);
  return dataRows.map((row) => {
    const cells = row.split('|').map((c) => c.trim());
    // row looks like: | <col1> | <col2> | <col3> | <col4> |
    // split('|') on a leading/trailing-pipe row yields ['', col1, col2, col3, col4, ''].
    const firstColumn = cells[1];
    assert.ok(firstColumn !== undefined, `Malformed ledger row, could not extract first column: "${row}"`);
    return firstColumn;
  });
}

test('evidence registry: every ledger row has exactly one registry entry, and vice versa', async () => {
  const workspaceRoot = await findWorkspaceRoot();

  const ledgerMarkdown = await readFile(path.join(workspaceRoot, LEDGER_RELATIVE_PATH), 'utf-8');
  const registryRaw = await readFile(path.join(workspaceRoot, REGISTRY_RELATIVE_PATH), 'utf-8');
  const registry = JSON.parse(registryRaw) as Registry;

  const ledgerRowTexts = parseLedgerRows(ledgerMarkdown);

  assert.equal(
    ledgerRowTexts.length,
    24,
    `Expected 24 ledger rows (PR #294 through PR #350 plus MIXED_CONTEXT_QUALITY.md and issue #342), found ${ledgerRowTexts.length}. ` +
      'If the tracker legitimately grew a new row, add a matching reports/evidence-registry.json entry and update this count.'
  );

  assert.equal(
    registry.entries.length,
    ledgerRowTexts.length,
    `Registry has ${registry.entries.length} entries but the ledger has ${ledgerRowTexts.length} rows.`
  );

  // Every registry entry must declare which ledger row it corresponds to,
  // via the exact first-column cell text, and every ledger row text must be
  // covered by exactly one registry entry (order-independent).
  const ledgerTextsRemaining = new Set(ledgerRowTexts);
  const seenLedgerTexts = new Set<string>();

  for (const entry of registry.entries) {
    assert.ok(
      typeof entry.ledgerText === 'string' && entry.ledgerText.length > 0,
      `Registry entry ledgerRowId=${entry.ledgerRowId} is missing ledgerText`
    );
    assert.ok(
      ledgerTextsRemaining.has(entry.ledgerText),
      `Registry entry ledgerRowId=${entry.ledgerRowId} ledgerText "${entry.ledgerText}" does not match any row in ` +
        `docs/LUNUM_READINESS.md's evidence ledger. Either the tracker row text changed (registry must be updated to ` +
        `match) or this entry does not correspond to a real ledger row.`
    );
    assert.ok(
      !seenLedgerTexts.has(entry.ledgerText),
      `Registry entry ledgerRowId=${entry.ledgerRowId} duplicates ledgerText "${entry.ledgerText}" already claimed by another entry.`
    );
    seenLedgerTexts.add(entry.ledgerText);
    ledgerTextsRemaining.delete(entry.ledgerText);
  }

  assert.equal(
    ledgerTextsRemaining.size,
    0,
    `${ledgerTextsRemaining.size} ledger row(s) have no matching registry entry: ${JSON.stringify(
      [...ledgerTextsRemaining]
    )}`
  );
});

test('evidence registry: every entry with mergeCommits declares them verified, or is explicitly unverified', async () => {
  const workspaceRoot = await findWorkspaceRoot();
  const registryRaw = await readFile(path.join(workspaceRoot, REGISTRY_RELATIVE_PATH), 'utf-8');
  const registry = JSON.parse(registryRaw) as Registry;

  for (const entry of registry.entries) {
    assert.ok(
      entry.verificationStatus === 'verified' || entry.verificationStatus === 'unverified',
      `Registry entry ledgerRowId=${entry.ledgerRowId} has an unrecognized verificationStatus "${entry.verificationStatus}"`
    );

    if (entry.verificationStatus === 'verified') {
      for (const mc of entry.mergeCommits ?? []) {
        assert.equal(
          mc.verified,
          true,
          `Registry entry ledgerRowId=${entry.ledgerRowId} is marked verified but merge commit for PR #${mc.pr} (${mc.sha}) is not marked verified`
        );
        assert.match(
          mc.sha,
          /^[0-9a-f]{40}$/,
          `Registry entry ledgerRowId=${entry.ledgerRowId} merge commit sha for PR #${mc.pr} is not a full 40-char lowercase hex SHA: "${mc.sha}"`
        );
      }
    }
  }
});
