// coverage-a3-v3: tests for render-verb-first.mjs and prepare.mjs (offline).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verbFirst } from './render-verb-first.mjs';
import { prepare } from './prepare.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const J = (f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

test('R1 reproduces the three pre-registered examples exactly', () => {
  const md = fs.readFileSync(path.join(here, 'PREREGISTRATION.md'), 'utf8');
  const rows = [...md.matchAll(/^\| `(R [^`]+)` \| `(R [^`]+)` \|$/gm)].map((m) => [m[1], m[2]]);
  assert.equal(rows.length, 3, 'expected the three example rows in PREREGISTRATION.md');
  for (const [r0, r1] of rows) assert.equal(verbFirst(r0), r1);
});

// key=value pieces, with modality words and "not" removed, as a sorted multiset.
const pieces = (code) => code
  .replace(/^[RM] (question: )?(imperative to you: )?/, '').replace(/\?$/, '')
  .split(' ; ')
  .flatMap((c) => {
    const at = c.indexOf(' @');
    const time = at === -1 ? [] : [c.slice(at + 1)];
    const inner = (at === -1 ? c : c.slice(0, at)).replace(/^[^(]*\(/, '').replace(/\)$/, '');
    // The R1 auxiliary slot ("can not", "intends to", "not", ...) is a bare token, not key=value.
    const AUX_SLOT = /^(?:(?:can|must|intends to|certainly|thinks)(?: not)?|not)$/;
    return [...inner.split(/, (?=[a-z_]+=|(?:can|must|intends to|certainly|thinks|not)(?:,| not,|$| not$))/).filter((p) => !AUX_SLOT.test(p)), ...time];
  })
  .sort();

test('R1 on all 139 coverage-a3-v2 records: no throw, same role pieces, same frame and prefixes', () => {
  const rows = J(path.join(here, '../coverage-a3-v2/bar2/rust-renders.jsonl'));
  assert.equal(rows.length, 139);
  for (const { code } of rows) {
    const r1 = verbFirst(code);
    assert.deepEqual(pieces(r1), pieces(code), code);
    assert.equal(r1.slice(0, 2), code.slice(0, 2));
    assert.equal(r1.includes('question: '), code.includes('question: '), code);
    assert.equal(r1.endsWith('?'), code.endsWith('?'), code);
    assert.equal(r1.includes('imperative to you: '), code.includes('imperative to you: '), code);
    // Modality words leave the prefix; "not" survives only as an argument-slot token.
    assert.equal(/\bnot\b/.test(r1), /\bnot\b/.test(code), code);
  }
});

test('R1 throws on unparseable input and unknown modality', () => {
  assert.throws(() => verbFirst('nonsense'));
  assert.throws(() => verbFirst('R maybe assert(subject=I, action=go)'));
});

test('prepare.mjs: counts, no overlap, worksheet has only the 32 natural items, byte-identical reruns', () => {
  const a = fs.mkdtempSync(path.join(os.tmpdir(), 'a3v3-a-'));
  const b = fs.mkdtempSync(path.join(os.tmpdir(), 'a3v3-b-'));
  try {
    const counts = prepare(a);
    prepare(b);
    for (const f of ['calibration/items.jsonl', 'calibration/WORKSHEET.md', 'bar/controls.jsonl', 'prepare.json']) {
      assert.ok(fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f))), `${f} differs between runs`);
    }
    assert.equal(counts.calibrationNatural, 32);
    assert.equal(counts.calibrationControls, 8);
    assert.equal(counts.barControls, 20);
    const items = J(path.join(a, 'calibration/items.jsonl'));
    assert.equal(items.length, 40);
    const v2 = new Set(J(path.join(here, '../coverage-a3-v2/requests.jsonl')).map((r) => r.sourceText.trim()));
    for (const it of items) assert.ok(!v2.has(it.sentence.trim()), 'calibration sentence overlaps coverage-a3-v2');
    for (const it of items) assert.equal(it.r1, verbFirst(it.r0));
    const ws = fs.readFileSync(path.join(a, 'calibration/WORKSHEET.md'), 'utf8');
    assert.equal((ws.match(/^Label: /gm) || []).length, 32);
    assert.ok(!/a3c[12]-/.test(ws), 'worksheet must not show handles');
    for (const it of items.filter((x) => x.control)) assert.ok(!ws.includes(it.sentence + '\n\nRecord: `' + it.r0), 'control leaked into worksheet');
    for (const it of items.filter((x) => !x.control && x.r1 !== x.r0)) assert.ok(!ws.includes(it.r1), 'R1 text leaked into worksheet');
    const ctl = J(path.join(a, 'bar/controls.jsonl'));
    assert.ok(ctl.every((c) => c.control && c.expected === 'no' && c.r1 === verbFirst(c.r0)));
  } finally {
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
  }
});

test('calibrate: kappa, item set and per-arm pass rule', async () => {
  const { kappa, calibrationItems, summarize } = await import('./calibrate.mjs');
  assert.equal(kappa([[true, true], [false, false]]), 1);
  assert.equal(kappa([[true, false], [false, true]]), -1);
  const items = JSON.parse('[' + fs.readFileSync(new URL('./calibration/items.jsonl', import.meta.url), 'utf8').trim().split('\n').join(',') + ']');
  const controls = JSON.parse('[' + fs.readFileSync(new URL('./bar/controls.jsonl', import.meta.url), 'utf8').trim().split('\n').join(',') + ']');
  const labels = JSON.parse(fs.readFileSync(new URL('./calibration/labels.json', import.meta.url), 'utf8'));
  const all = calibrationItems({ items, controls, labels });
  assert.equal(all.length, 2 * (40 + 20));
  assert.equal(all.filter((x) => x.set === 'natural' && x.arm === 'r0').length, 32);
  // A judge that says yes to every real record and no to every control passes both arms.
  const ideal = all.map((x) => ({ ...x, states: x.set === 'natural' }));
  const s = summarize(ideal);
  assert.equal(s.r0.pass, true); assert.equal(s.r1.pass, true); assert.equal(s.r0.kappa, 1);
  // Two yes answers on bar controls fail the arm.
  const leaky = ideal.map((x, i) => (x.arm === 'r1' && x.set === 'barControl' && i % 2 === 0 ? { ...x, states: true } : x));
  assert.equal(summarize(leaky).r1.pass, false);
  // The D1 sensitivity check treats mostly as does-not.
  assert.ok(summarize(ideal, { mostlyAsNo: true }).r0.kappa < 1);
});
