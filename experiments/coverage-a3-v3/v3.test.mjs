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

test('judges.ask: a 4xx is a dead judge, an empty content falls back to reasoning, status and finish reason are kept (D2)', async () => {
  const { ask } = await import('../judge-calibration-v1/judges.mjs');
  const http = await import('node:http');
  const srv = http.createServer((q, r) => {
    q.resume();
    q.on('end', () => {
      if (q.url === '/404') { r.writeHead(404); r.end('{}'); return; }
      r.writeHead(200, { 'content-type': 'application/json' });
      if (q.url === '/reason') r.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '', reasoning_content: 'format {"states": false}, so {"states": true}' } }] }));
      else r.end(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{"states": false}' } }] }));
    });
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const url = (p) => ({ url: `http://127.0.0.1:${srv.address().port}${p}`, model: 'x', max: 10 });
  try {
    assert.deepEqual(await ask(url('/ok'), 'q', 'states'), { verdict: false, reply: '{"states": false}', status: 200, finishReason: 'length' });
    const r = await ask(url('/reason'), 'q', 'states');
    assert.equal(r.verdict, true); assert.equal(r.fromReasoning, true);
    await assert.rejects(() => ask(url('/404'), 'q', 'states'), /judge_unreachable:http_404/);
  } finally { srv.close(); }
});

test('score: mood from the render prefix, item set for both arms (139 + 20 each), R1 = verbFirst', async () => {
  const { moodOf, scoreItems } = await import('./score.mjs');
  assert.equal(moodOf('R question: relate(subject=x, relation=y)?'), 'question');
  assert.equal(moodOf('R imperative to you: assert(action=go)'), 'imperative');
  assert.equal(moodOf('R not ability assert(subject=I, action=help)'), 'statement');
  const score = JSON.parse(fs.readFileSync(path.join(here, '../coverage-a3-v2/score.json'), 'utf8'));
  const text = new Map(J(path.join(here, '../coverage-a3-v2/requests.jsonl')).map((r) => [r.handle, r.sourceText]));
  const controls = J(path.join(here, 'bar/controls.jsonl'));
  const items = scoreItems({ renders: score.renders, text, controls });
  assert.equal(items.length, 2 * (139 + 20));
  const own = (arm) => items.filter((x) => x.arm === arm && x.kind === 'own');
  assert.equal(own('r0').length, 139);
  for (const [i, it] of own('r1').entries()) { assert.equal(it.code, verbFirst(own('r0')[i].code)); assert.equal(it.mood, own('r0')[i].mood); }
  const moods = own('r0').reduce((m, x) => ({ ...m, [x.mood]: (m[x.mood] || 0) + 1 }), {});
  assert.deepEqual(moods, { statement: 112, question: 23, imperative: 4 });
  assert.deepEqual(items.filter((x) => x.arm === 'r1' && x.kind === 'control').map((x) => x.code), controls.map((c) => c.r1));
  assert.throws(() => scoreItems({ renders: [{ handle: 'h', code: 'R assert(subject=a, action=b)' }], text: new Map(), controls: [] }), /sentence_missing/);
});

// Synthetic score files: n records (ids h0..), 20 controls; yes(arm, i) decides each record.
function synth(judge, n, yes, ctlYes = 0, mood = () => 'statement') {
  const results = [];
  for (const arm of ['r0', 'r1']) {
    for (let i = 0; i < n; i += 1) results.push({ arm, kind: 'own', id: `h${i}`, mood: mood(i), promptSha256: `${arm}${i}`, states: yes(arm, i) });
    for (let i = 0; i < 20; i += 1) results.push({ arm, kind: 'control', id: `c${i}`, promptSha256: `${arm}c${i}`, states: i < ctlYes });
  }
  return { summary: { judge }, results };
}

test('score.verdict: bar 1 on R1, agreement, controls, lift, moods, categories and the C+D credibility check', async () => {
  const { verdict, checkCategories, CALIBRATION_LABEL } = await import('./score.mjs');
  // 139 records; R1: judge a rejects h0..h19 (85.6 %), judge b rejects h10..h29; R0: both reject h0..h59.
  const a = synth('a', 139, (arm, i) => (arm === 'r1' ? i >= 20 : i >= 60), 2, (i) => (i < 23 ? 'question' : 'statement'));
  const b = synth('b', 139, (arm, i) => (arm === 'r1' ? i < 10 || i >= 30 : i >= 60), 0);
  let v = verdict([a, b]);
  assert.equal(v.calibration, CALIBRATION_LABEL);
  assert.equal(v.calibration, 'model-rated calibration');
  assert.equal(v.arms.r1.each[0].rate, Number((119 / 139).toFixed(4)));
  assert.equal(v.arms.r1.agree, 139 - 20);
  assert.equal(v.arms.r1.bothReject.length, 10);
  assert.equal(v.bar1.verdictPossible, true);
  assert.equal(v.bar1.pass, true);
  assert.equal(v.bar1.credible, null);
  assert.equal(v.bar1.reported, 'pass, credibility not computed');
  assert.equal(v.attribution.renderEffect[0].lift, Number((119 / 139 - 79 / 139).toFixed(4)));
  assert.equal(v.attribution.liftAtLeast10PointsBoth, true);
  assert.deepEqual(v.arms.r1.each[0].byMood.question, { n: 23, states: 3 });
  // Three control yes answers fail bar 1.
  assert.equal(verdict([synth('a', 139, () => true, 3), b]).bar1.pass, false);
  // An incomplete file is no verdict.
  assert.equal(verdict([synth('a', 100, () => true), b]).bar1.pass, null);
  assert.equal(verdict([synth('a', 100, () => true), b]).bar1.reported, 'no verdict');
  // Categories for 48 synthetic jointly rejected records h0..h47: A h0-23, B h24-35, C h36-44, D h45-47.
  const cat = (i) => (i < 24 ? 'A' : i < 36 ? 'B' : i < 45 ? 'C' : 'D');
  const categories = Object.fromEntries(Array.from({ length: 48 }, (_, i) => [`h${i}`, cat(i)]));
  const ids = Object.keys(categories);
  assert.equal(checkCategories(categories, ids), categories);
  assert.throws(() => checkCategories({ ...categories, h0: 'B' }, ids), /category_count:A/);
  assert.throws(() => checkCategories(categories, ids.slice(1)), /jointly_rejected/);
  v = verdict([a, b], { categories });
  assert.deepEqual(v.arms.r1.each[0].byCategory.A, { n: 24, states: 4 });
  assert.deepEqual(v.arms.r1.each[0].cdAccepted, { n: 12, states: 12 });
  assert.equal(v.bar1.credible, false);
  assert.equal(v.bar1.reported, 'pass, not credible');
  // Judges that reject 6 or more of C+D keep bar 1 credible: accept exactly 6 of h36..h47.
  const careful = (j) => synth(j, 139, (arm, i) => arm === 'r0' || i < 36 || i >= 42, 0);
  v = verdict([careful('a'), careful('b')], { categories });
  assert.deepEqual(v.arms.r1.each[1].cdAccepted, { n: 12, states: 6 });
  assert.equal(v.bar1.credible, true);
  // Selection check and judging effect.
  v = verdict([a, b], { v2LunaRate: 78 / 139, calibration: [{ judge: 'a', r1: { pass: true, kappa: 0.9 } }, { judge: 'c', r1: { pass: true, kappa: 0.5 } }, { judge: 'b', r1: { pass: true, kappa: 0.7 } }, { judge: 'd', r1: { pass: false, kappa: 1 } }] });
  assert.deepEqual(v.selection.topTwo, ['a', 'b']);
  assert.equal(v.selection.scoredAreTopTwo, true);
  assert.ok(Math.abs(v.attribution.judgingEffect[0].diff - 1 / 139) < 2e-4);
  // Different prompts for the same item are refused.
  const bad = synth('b', 139, () => true); bad.results[0].promptSha256 = 'x';
  assert.throws(() => verdict([a, bad]), /prompt_mismatch/);
  assert.throws(() => verdict([a, a]), /same_judge_twice/);
});

test('score.summarizeJudge: unparseable counts as no', async () => {
  const { summarizeJudge } = await import('./score.mjs');
  const s = summarizeJudge([{ arm: 'r1', kind: 'own', states: true }, { arm: 'r1', kind: 'own', states: null }, { arm: 'r1', kind: 'control', states: false }]);
  assert.deepEqual(s.r1, { records: 2, states: 1, rate: 0.5, controls: 1, controlsYes: 0, unparseable: 1 });
});

test('categories: bar/categories-v2.json is exactly what build-categories.mjs derives from coverage-a3-v2 (24/12/9/3)', async () => {
  const { buildCategories } = await import('./build-categories.mjs');
  const v2 = new URL('../coverage-a3-v2/', import.meta.url);
  const J = (f) => JSON.parse(fs.readFileSync(new URL(f, v2), 'utf8'));
  const requests = fs.readFileSync(new URL('requests.jsonl', v2), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const built = buildCategories({ md: fs.readFileSync(new URL('RESULTS.md', v2), 'utf8'), judgements: [J('bar2/judgements-luna.json'), J('bar2/judgements-nemotron.json')], requests });
  const committed = JSON.parse(fs.readFileSync(new URL('./bar/categories-v2.json', import.meta.url), 'utf8'));
  assert.deepEqual(committed, built);
  const counts = {}; for (const c of Object.values(built)) counts[c] = (counts[c] || 0) + 1;
  assert.deepEqual(counts, { A: 24, B: 12, C: 9, D: 3 });
});
