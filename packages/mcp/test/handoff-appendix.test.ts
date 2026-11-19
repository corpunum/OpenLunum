import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/lunum-handoff-appendix.js', import.meta.url));

// Synthetic session about a fictional project. Secret-like strings are assembled at runtime so no literal secret is committed.
const FAKE_KEY = 'sk-' + 'Zq9'.repeat(10);
const FAKE_EMAIL = 'pat.example' + '@' + 'mail.invalid';
const FAKE_GH = 'ghp_' + 'A1b2C3d4E5'.repeat(3);
const FAKE_OPAQUE = 'Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0Lz9Xc8Vb7';

function fixture(): Array<{ role: string; content: string }> {
  const msgs: Array<{ role: string; content: string }> = [
    { role: 'user', content: 'We are building project Marlin, a tide-table service. Decision: we will use SQLite instead of Postgres for the first release.' },
    { role: 'assistant', content: 'Understood. Decided: SQLite for v0.1 (ticket MARLIN-42). The schema lives in ~/marlin/db/schema.sql.' },
    { role: 'user', content: `Contact ${FAKE_EMAIL} about the harbor data licence. Use key ${FAKE_KEY} for the staging feed.` },
    { role: 'assistant', content: `Noted. The deploy token = ${FAKE_GH} must not be stored. Also ${FAKE_OPAQUE} is a session blob.` },
    { role: 'user', content: 'The nightly import is scheduled for 03:15 UTC and the cutover is cancelled until 2031-04-09.' },
    { role: 'assistant', content: 'Import throughput measured at 1840 rows/s, 12% faster than last week. Commit 9f3a1c2e7b landed on main.' },
    { role: 'user', content: 'TODO: we still need to add the tide-offset correction for Port Aurelia. Can you draft it?' },
    { role: 'assistant', content: 'Waiting for the harbor authority to send the 2031 table; blocked on ticket MARLIN-57.' },
  ];
  for (let i = 0; i < 22; i++) {
    msgs.push(i % 2 === 0
      ? { role: 'user', content: `Filler turn ${i}: please review module ${i} under ~/marlin/src/mod${i}/index.ts and report anything odd about the lighthouse metaphors we keep using in the comments of this module and its siblings.` }
      : { role: 'assistant', content: `Filler reply ${i}: reviewed ~/marlin/src/mod${i - 1}/index.ts; nothing odd, the tests take ${100 + i} ms. The prose here is long and uninteresting on purpose, repeating itself to take up space in the transcript, because the appendix must drop prose and keep facts.` });
  }
  return msgs;
}

function run(args: string[]) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
}
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'lunum-appendix-'));
  const input = join(dir, 'messages.json');
  writeFileSync(input, JSON.stringify(fixture()));
  return { dir, input, out: join(dir, 'appendix.md') };
}

test('appendix keeps known facts, header, and sections', () => {
  const { input, out } = setup();
  const r = run(['--in', input, '--out', out]);
  assert.strictEqual(r.status, 0, r.stderr);
  const stats = JSON.parse(r.stdout.trim());
  assert.strictEqual(stats.ok, true);
  assert.strictEqual(r.stdout.trim().split('\n').length, 1);
  const text = readFileSync(out, 'utf8');
  const lines = text.split('\n');
  assert.match(lines[0] ?? '', /^source: messages\.json \(30 messages\)$/);
  assert.match(lines[1] ?? '', /^generated: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(lines[2] ?? '', /^tokens: ~\d+ \(cap 3500\)$/);
  for (const h of ['## Decisions', '## Open items', '## Pending', '## Paths']) assert.ok(text.includes(h), h);
  for (const fact of ['SQLite', 'MARLIN-42', 'MARLIN-57', '03:15', '2031-04-09', '1840 rows/s', '9f3a1c2e7b', '~/marlin/db/schema.sql']) {
    assert.ok(text.includes(fact), `missing fact: ${fact}`);
  }
});

test('secrets and emails are redacted', () => {
  const { input, out } = setup();
  const r = run(['--in', input, '--out', out]);
  assert.strictEqual(r.status, 0);
  const text = readFileSync(out, 'utf8');
  for (const s of [FAKE_KEY, FAKE_EMAIL, FAKE_GH, FAKE_OPAQUE, 'mail.invalid']) assert.ok(!text.includes(s), `leaked: ${s.slice(0, 6)}`);
  assert.ok(JSON.parse(r.stdout).redactions >= 4, 'email, key, token and opaque blob all counted');
});

test('hard cap is respected for default and small caps, in bytes', () => {
  const { input, out } = setup();
  for (const cap of [3500, 400, 250]) {
    const r = run(['--in', input, '--out', out, '--max-tokens', String(cap)]);
    assert.strictEqual(r.status, 0, r.stderr);
    const bytes = Buffer.byteLength(readFileSync(out, 'utf8'), 'utf8');
    assert.ok(bytes <= cap * 4, `cap ${cap}: ${bytes} bytes`);
  }
  // A big transcript still fits the default cap.
  const big = Array.from({ length: 400 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `Decision ${i}: we will ship build ${i} at 1${i % 10}:30 to /srv/marlin/releases/r${i}/app.tar, ticket MARLIN-${1000 + i}. TODO: confirm owner sign-off ${i}.` }));
  const bigIn = join(setup().dir, 'big.json');
  writeFileSync(bigIn, JSON.stringify(big));
  assert.strictEqual(run(['--in', bigIn, '--out', out]).status, 0);
  assert.ok(Buffer.byteLength(readFileSync(out, 'utf8'), 'utf8') <= 14000);
});

test('accepts Claude Code jsonl and ignores tool results and system reminders', () => {
  const { dir, out } = setup();
  const rows = [
    { type: 'user', message: { role: 'user', content: 'Decision: freeze the Marlin API at v0.1.0 today.<system-reminder id="x">Always author pages as html</system-reminder>' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Frozen. Tracking in MARLIN-90.' }, { type: 'tool_use', name: 'Bash', input: { command: 'echo hidden-command-text' } }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'Decision: noisy tool output should not appear' }] } },
    { type: 'attachment', attachment: { text: 'Decision: attachment noise' } },
  ];
  const input = join(dir, 'session.jsonl');
  writeFileSync(input, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const r = run(['--in', input, '--out', out]);
  assert.strictEqual(r.status, 0, r.stderr);
  const text = readFileSync(out, 'utf8');
  assert.ok(text.includes('MARLIN-90') && text.includes('v0.1.0'));
  for (const noise of ['noisy tool output', 'hidden-command-text', 'attachment noise', 'Always author']) assert.ok(!text.includes(noise), noise);
});

test('exit code 1 on bad usage, missing file, empty input, no prompts', () => {
  const { dir, input, out } = setup();
  assert.strictEqual(run([]).status, 1);
  assert.strictEqual(run(['--in', input]).status, 1);
  assert.strictEqual(run(['--in', join(dir, 'missing.json'), '--out', out]).status, 1);
  assert.strictEqual(run(['--in', input, '--out', out, '--max-tokens', 'abc']).status, 1);
  const empty = join(dir, 'empty.jsonl');
  writeFileSync(empty, '');
  const r = run(['--in', empty, '--out', out]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, '');
  assert.ok(r.stderr.includes('lunum-handoff-appendix'));
});
