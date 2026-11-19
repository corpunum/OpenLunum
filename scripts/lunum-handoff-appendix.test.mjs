import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const BIN = fileURLToPath(new URL('./lunum-handoff-appendix.mjs', import.meta.url));
// Synthetic session about a fictional project. Secret-like strings are assembled at runtime so no literal secret is committed.
const FAKE_KEY = 'sk-' + 'Zq9'.repeat(10);
const FAKE_EMAIL = 'pat.example' + '@' + 'mail.invalid';
const FAKE_GH = 'ghp_' + 'A1b2C3d4E5'.repeat(3);
const FAKE_OPAQUE = 'Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0Lz9Xc8Vb7';
function fixture() {
    const msgs = [
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
function run(args) {
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
    for (const h of ['## Decisions', '## Open items', '## Pending', '## Paths'])
        assert.ok(text.includes(h), h);
    for (const fact of ['SQLite', 'MARLIN-42', 'MARLIN-57', '03:15', '2031-04-09', '1840 rows/s', '9f3a1c2e7b', '~/marlin/db/schema.sql']) {
        assert.ok(text.includes(fact), `missing fact: ${fact}`);
    }
});
test('secrets and emails are redacted', () => {
    const { input, out } = setup();
    const r = run(['--in', input, '--out', out]);
    assert.strictEqual(r.status, 0);
    const text = readFileSync(out, 'utf8');
    for (const s of [FAKE_KEY, FAKE_EMAIL, FAKE_GH, FAKE_OPAQUE, 'mail.invalid'])
        assert.ok(!text.includes(s), `leaked: ${s.slice(0, 6)}`);
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
    for (const noise of ['noisy tool output', 'hidden-command-text', 'attachment noise', 'Always author'])
        assert.ok(!text.includes(noise), noise);
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
test('short tool results keep high-value facts; secrets inside them are redacted; long ones are dropped', () => {
    const { dir, out } = setup();
    const bodies = [
        'Scheduled recurring task c0ffee12 (13 */2 * * *). Next run: Nov 19 10:13am.',
        'tmux session marlin-worker-7 started; pane pid 48213',
        'wrote /opt/marlin/bin/start.sh (mode 755)',
        'Rule stored: report after each tide import, apply now for schema fixes.',
        'deployed commit 4be91d07c2 to staging, listening on port 8431',
        'queued job id=ab12cd34ef for queue tide-import',
        `auth ok token=${FAKE_GH} user ${FAKE_EMAIL}; started worker pid 5150 key ${FAKE_KEY}`,
        'long noise '.repeat(60) + 'deployed commit deadbeef99 port 7777',
        'just chatter with nothing useful in it at all',
    ];
    const rows = [{ type: 'user', message: { role: 'user', content: 'Start the Marlin import worker.' } }];
    bodies.forEach((b, i) => {
        rows.push({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: `t${i}`, name: 'Bash', input: {} }] } });
        rows.push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t${i}`, content: i % 2 ? [{ type: 'text', text: b }] : b }] } });
    });
    const input = join(dir, 'tools.jsonl');
    writeFileSync(input, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const r = run(['--in', input, '--out', out]);
    assert.strictEqual(r.status, 0, r.stderr);
    const stats = JSON.parse(r.stdout);
    assert.strictEqual(stats.toolResults, 8);
    const text = readFileSync(out, 'utf8');
    for (const fact of ['c0ffee12', '13 */2 * * *', 'marlin-worker-7', '48213', '/opt/marlin/bin/start.sh', 'report after', 'apply now', '4be91d07c2', '8431', 'ab12cd34ef', '5150']) {
        assert.ok(text.includes(fact), `missing tool fact: ${fact}`);
    }
    for (const gone of [FAKE_GH, FAKE_EMAIL, FAKE_KEY, 'deadbeef99', '7777', 'chatter'])
        assert.ok(!text.includes(gone), `unexpected: ${gone.slice(0, 8)}`);
    assert.ok(stats.redactions >= 3);
    assert.ok(Buffer.byteLength(text, 'utf8') <= 14000);
});

function writeJsonl(rows) {
  const { dir, out } = setup();
  const input = join(dir, 'rep.jsonl');
  writeFileSync(input, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return { input, out };
}
const turn = (role, text) => ({ type: role, message: { role, content: text } });
const toolResult = (id, body) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: body }] } });

test('repeated facts: last value wins, is marked, earlier ones are dropped (with a was: hint)', () => {
  const { input, out } = writeJsonl([
    turn('user', 'Start the Marlin worker and watch it.'),
    turn('assistant', 'Starting worker.'),
    toolResult('a', 'Scheduled recurring job aaaa1111 (Every 2 hours at :13). Next run: 10:13.'),
    toolResult('b', 'started tmux new-session -d -s marlin-old-1\nworker pid 1111'),
    toolResult('c', 'deployed commit 1a2b3c4d5e to staging on port 8001'),
    turn('assistant', 'Decision: we hold work because the weekly limit is at 91%.'),
    turn('user', 'Replace it.'),
    turn('assistant', 'Replacing the worker now.'),
    toolResult('d', 'Scheduled recurring job bbbb2222 (Every 2 hours at :13). Next run: 12:13.'),
    toolResult('e', 'started tmux new-session -d -s marlin-new-2\nworker pid 2222'),
    toolResult('f', 'deployed commit 9f8e7d6c5b to staging on port 8002'),
    turn('assistant', 'Decision: we hold work because the weekly limit is at 97%.'),
  ]);
  const r = run(['--in', input, '--out', out]);
  assert.strictEqual(r.status, 0, r.stderr);
  const text = readFileSync(out, 'utf8');
  for (const last of ['bbbb2222', 'marlin-new-2', '2222', '9f8e7d6c5b', '8002', '97%']) assert.ok(text.includes(last), `missing latest: ${last}`);
  for (const first of ['aaaa1111', '1a2b3c4d5e', '8001', '91%']) assert.ok(!text.includes(first) || text.includes(`was: ${first}`) || text.includes(`was: ${first} `), `stale value kept without was: ${first}`);
  assert.ok(!/marlin-old-1.*\n.*marlin-new-2|^- .*marlin-old-1.*$/m.test(text.replace(/\(latest[^)]*\)/g, '')), 'old tmux name must only appear inside a was: hint');
  assert.ok(text.includes('latest of 2'), 'latest value is marked');
  assert.ok(text.includes('was: marlin-old-1') && text.includes('was: 1111'));
});

test('index tags are present on every bullet and monotonic within each section', () => {
  const { input, out } = setup();
  assert.strictEqual(run(['--in', input, '--out', out]).status, 0);
  const text = readFileSync(out, 'utf8');
  let section = '';
  let last = 0;
  let bullets = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) { section = line; last = 0; continue; }
    if (!line.startsWith('- ')) continue;
    const m = /\[m(\d+)\]$/.exec(line);
    assert.ok(m, `no [m<index>] tag: ${line.slice(0, 60)}`);
    const idx = Number(m[1]);
    assert.ok(idx >= 1 && idx <= 30, `index in range: ${idx}`);
    assert.ok(idx >= last, `monotonic in ${section}: ${idx} < ${last}`);
    last = idx;
    bullets++;
  }
  assert.ok(bullets > 5);
  assert.match(text, /MARLIN-42.*\[m[12]\]/);
});

test('cap holds with 400 messages of repeated facts, and secrets in tool results stay redacted', () => {
  const rows = [];
  for (let i = 0; i < 400; i++) {
    rows.push(turn(i % 2 ? 'assistant' : 'user', `Turn ${i}: deployed commit ${(0x10000000 + i * 7919).toString(16)} to port ${8000 + i}; weekly limit at ${i % 100}%. TODO: confirm sign-off ${i} for /srv/marlin/r${i}/app.tar.`));
    rows.push(toolResult(`t${i}`, `queued job id=${(0xabc00000 + i).toString(16)} token=${FAKE_GH} mail ${FAKE_EMAIL}`));
  }
  const { input, out } = writeJsonl(rows);
  const r = run(['--in', input, '--out', out]);
  assert.strictEqual(r.status, 0, r.stderr);
  const text = readFileSync(out, 'utf8');
  assert.ok(Buffer.byteLength(text, 'utf8') <= 14000);
  for (const s of [FAKE_GH, FAKE_EMAIL]) assert.ok(!text.includes(s));
  assert.ok(JSON.parse(r.stdout).redactions >= 400);
});
