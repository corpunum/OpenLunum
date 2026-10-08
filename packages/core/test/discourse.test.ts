// Discourse records (decisions/0021).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeDiscourse,
  factKey,
  literalSpellings,
  planDiscourseCompaction,
  segmentDiscourse,
  unitKey,
  verifyDiscourseAnalysis,
} from '../src/discourse.js';

const REPORT = [
  '## Result',
  '',
  'Implemented the reconciler in `src/core/reconciler.mjs`. We decided to keep the flag off by default.',
  'Tests now pass on commit 3465e355.',
  '',
  '- Status: green',
  '- PR-54 is merged',
  '- Next step: re-run the e2e suite tomorrow',
  '',
  '| Item | Result |',
  '|---|---|',
  '| unit | 120 passed |',
  '',
  '```js',
  'const x = 1;',
  '```',
  'Is the dashboard still needed?',
].join('\n');

test('segmentation keeps exact source spans and structural kinds', () => {
  const units = segmentDiscourse(REPORT);
  for (const unit of units) assert.equal(REPORT.slice(unit.start, unit.end), unit.text);
  const kinds = units.map((u) => u.kind);
  assert.deepEqual(kinds, ['heading', 'sentence', 'sentence', 'sentence', 'kv', 'list_item', 'kv', 'table_row', 'table_row', 'code', 'sentence']);
  assert.equal(units[9]!.text, '```js\nconst x = 1;\n```');
});

test('tool-result lines split into the call and its fields', () => {
  const line = '- shell_run(cmd=npm test) — ok: true; code: 1; stdout: Tests: 3 failed | 120 passed (123); stderr: Error: ENOENT missing.json';
  const analysis = analyzeDiscourse(line);
  const units = analysis.units.map((a) => [a.unit.kind, a.unit.text]);
  assert.deepEqual(units.map(([k]) => k), ['tool_call', 'kv', 'kv', 'kv', 'kv']);
  assert.ok(analysis.units.slice(1).every((a) => a.unit.parent === 0));
  const records = analysis.units.flatMap((a) => a.records.map((r) => r.type));
  assert.ok(records.includes('exit_status'));
  assert.ok(records.includes('test_result'));
  assert.ok(records.includes('error'));
  const tests = analysis.units.flatMap((a) => a.records).find((r) => r.type === 'test_result');
  assert.deepEqual(tests && tests.type === 'test_result' ? tests.counts : null, { fail: 3, pass: 120 });
  // Fact keys are scoped by the tool, so two tools' "code:" never collide.
  const code = analysis.units[2]!.records.find((r) => r.type === 'kv');
  assert.ok(code && code.type === 'kv' && code.factKey !== factKey('code'));
});

test('records are verifiable surface records; the document record links units', () => {
  const analysis = analyzeDiscourse(REPORT);
  assert.deepEqual(verifyDiscourseAnalysis(REPORT, analysis), { valid: true, issues: [] });
  const doc = analysis.document;
  assert.equal(doc.topic, 0);
  assert.ok(doc.decisions.includes(2));
  assert.ok(doc.commitments.includes(6));
  assert.ok(doc.openItems.includes(10));
  assert.ok(doc.literalUnits.includes(1) && doc.literalUnits.includes(3));
  assert.equal(Object.values(doc.facts).find((f) => f.key === 'Status')?.value, 'green');
  for (const a of analysis.units) {
    assert.match(a.key, /^lsu:0\.1:sha256:[0-9a-f]{24}$/u);
    // Never a semantic identity.
    assert.equal((a as unknown as Record<string, unknown>).semanticFingerprint, undefined);
  }
  assert.ok(analysis.units[1]!.literals.paths.includes('src/core/reconciler.mjs'));
  assert.ok(analysis.units[3]!.literals.hashes.includes('3465e355'));
  assert.ok(analysis.units[5]!.literals.identifiers.includes('pr-54'));
  assert.ok(analysis.units[6]!.literals.relativeTimes.includes('day:tomorrow'));
});

test('a record stands in for its unit only when it keeps every literal of the unit', () => {
  const kept = analyzeDiscourse('stdout: Tests: 3 failed | 120 passed (123) in 4.2s and a lot of other output text here');
  // "4.2" and "123" are not in the rendering: no stand-in.
  assert.equal(kept.units[0]!.recordText, null);
  const fine = analyzeDiscourse('summary: 3 failed, 120 passed — after a very long and detailed explanation of everything that happened');
  // The kv rendering is the unit minus nothing: never shorter, so still null; the gate is about literals.
  assert.equal(fine.units[0]!.recordText, null);
  const tampered = analyzeDiscourse('code: 7');
  tampered.units[0]!.recordText = 'exit=0';
  assert.equal(verifyDiscourseAnalysis('code: 7', tampered).valid, false);
});

test('unit keys ignore formatting but never literals', () => {
  assert.equal(unitKey('- **Done**: pushed 3465e355.'), unitKey('Done: pushed 3465e355'));
  assert.notEqual(unitKey('Done: pushed 3465e355'), unitKey('Done: pushed 3465e356'));
  assert.notEqual(unitKey('Retry 3 times'), unitKey('Retry 4 times'));
});

test('compaction plan: newest copy wins, recent messages stay verbatim, literals survive', () => {
  const long = (extra: string): string => [
    'Implemented the reconciler.',
    'The full log is in /var/log/openunum/reconcile.log and the fix is commit 3465e355.',
    'Status: running',
    ...Array.from({ length: 40 }, (_, i) => `Narrative sentence number ${String.fromCharCode(97 + (i % 26))} without any literal at all, padding the message.`),
    extra,
  ].join('\n');
  const messages = [
    { id: 1, role: 'assistant', content: long('Remaining: ship it.') },
    { id: 2, role: 'user', content: 'ok' },
    { id: 3, role: 'assistant', content: 'Status: done\nThe fix is commit 3465e355.' },
    { id: 4, role: 'user', content: 'thanks' },
  ];
  const plan = planDiscourseCompaction(messages, { keepVerbatimLast: 3, maxMessageChars: 400 });
  const first = plan.messages[0]!;
  assert.equal(first.compacted, true);
  assert.ok(first.content.length < messages[0]!.content.length);
  assert.match(first.content, /^\[compacted: \d+ units; .*source: message 1\]/u);
  // Duplicate of the newer message dropped; superseded value kept as history.
  assert.ok(!first.content.includes('The fix is commit 3465e355.'));
  assert.match(first.content, /Status: running \(superseded\)/u);
  assert.deepEqual(plan.factHistory[factKey('Status', '')]?.map((h) => h.value), ['running', 'done']);
  // Every literal of the compacted message is still visible somewhere in the plan output.
  const all = plan.messages.map((m) => m.content).join('\n');
  for (const literal of literalSpellings(messages[0]!.content)) assert.ok(all.includes(literal), literal);
  // Recent messages are untouched.
  for (const m of plan.messages.slice(1)) assert.equal(m.compacted, false);
  assert.equal(plan.messages[2]!.content, messages[2]!.content);
  assert.ok(plan.stats.dispositions.omitted > 0);
  assert.ok(plan.stats.dispositions.duplicate > 0);
});

test('compaction plan: one huge recent message is bounded by recentMaxChars; clipped units list their literals', () => {
  const blob = `stdout: ${Array.from({ length: 200 }, (_, i) => `line ${1000 + i} at /srv/app/file${i}.js`).join(' ')}`;
  const plan = planDiscourseCompaction([{ id: 9, role: 'user', content: blob }], { recentMaxChars: 2000 });
  const only = plan.messages[0]!;
  assert.equal(only.compacted, true);
  assert.ok(only.content.length < 2600);
  assert.match(only.content, /…\[\+\d+ chars; literals: /u);
  assert.match(only.content, /\(\+\d+ more\)/u);
});

test('compaction plan never makes a message longer and never compacts short ones', () => {
  const plan = planDiscourseCompaction([
    { id: 1, role: 'user', content: 'short message' },
    { id: 2, role: 'assistant', content: 'x'.repeat(1600) },
    { id: 3, role: 'user', content: 'a' },
  ], { keepVerbatimLast: 1 });
  assert.equal(plan.messages[0]!.compacted, false);
  assert.ok(plan.messages[1]!.content.length <= 1600);
});

test('semantic identity dedup requires the kept unit to carry every literal', () => {
  const sentence = (n: number): string => `Restart the payment service ${n} times. ${'Padding without literals goes here. '.repeat(50)}`;
  const messages = [
    { id: 1, role: 'assistant', content: sentence(3) },
    { id: 2, role: 'assistant', content: 'Restart the payment service again.' },
  ];
  const same = (): string => 'lfp:2.1:sha256:same';
  const identityOf = (unit: { text: string }): string | null => (/^Restart the payment service/u.test(unit.text) ? same() : null);
  const plan = planDiscourseCompaction(messages, { keepVerbatimLast: 1, identityOf, maxMessageChars: 100000 });
  // The newer unit lacks "3": the older one is not dropped.
  assert.match(plan.messages[0]!.content, /Restart the payment service 3 times\./u);
  assert.equal(plan.stats.semanticIdentities, 2);
});

test('every non-whitespace character is in exactly one unit (except table separator rows)', () => {
  const samples = [REPORT, 'a. b! c? d; e…\nF\n\n- x\n  continued\n1) y\n| a | b |\n|---|---|\n```\ncode\n```\ntail', 'x'.repeat(3000) + '. Next sentence here.'];
  for (const text of samples) {
    const covered = new Array(text.length).fill(0);
    for (const unit of segmentDiscourse(text)) for (let i = unit.start; i < unit.end; i += 1) covered[i] += 1;
    const separators = [...text.matchAll(/^\|[\s|:-]+\|$/gmu)].flatMap((m) => Array.from({ length: m[0].length }, (_, k) => m.index + k));
    for (let i = 0; i < text.length; i += 1) {
      if (/\s/u.test(text[i]!) || separators.includes(i)) continue;
      assert.equal(covered[i], 1, `char ${i} (${JSON.stringify(text[i])}) covered ${covered[i]} times`);
    }
  }
});

test('analysis is linear on long digit runs; test counts read the same', () => {
  // Was quadratic in TEST_COUNTS: ~36 s on 200k digits, blocking the caller's event loop.
  const started = performance.now();
  analyzeDiscourse('1'.repeat(200_000));
  analyzeDiscourse(`${'7'.repeat(100_000)} passed`);
  assert.ok(performance.now() - started < 1000, `took ${Math.round(performance.now() - started)} ms`);
  const records = analyzeDiscourse('Tests: 3 failed | 120 passed (123); build x12 passed').units.flatMap((a) => a.records);
  assert.deepEqual(records.find((r) => r.type === 'test_result'), { type: 'test_result', counts: { fail: 3, pass: 120 } });
});
