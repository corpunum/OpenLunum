import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const BIN = fileURLToPath(new URL('./lunum-handoff-variant.mjs', import.meta.url));

function setup(extra = '') {
    const root = mkdtempSync(join(tmpdir(), 'variant-'));
    const D = join(root, 'handoff');
    mkdirSync(join(D, 'topics'), { recursive: true });
    writeFileSync(join(root, 'run.sh'), '#!/bin/sh\n');
    const index = `# demo handoff title\nRepo: ${root}\n\n## Who I am\nSynthetic session.\n\n## STATE NOW\n- Ran ${root}/run.sh and ./missing.py today.\n- Peers: alpha [aaaaaa], alpha [bbbbbb], beta [cccccc], [dddddd].\n${extra}\n`;
    writeFileSync(join(D, 'INDEX.md'), index);
    writeFileSync(join(D, 'topics', 't.md'), `See ${root}/notes.md for details.\n`);
    const tr = join(root, 't.jsonl');
    writeFileSync(tr, JSON.stringify([{ role: 'user', content: 'Decision: we will ship the demo on Friday.' }, { role: 'assistant', content: 'Understood.' }]));
    return { root, D, tr, index };
}
const run = (D, tr, more = []) => spawnSync(process.execPath, [BIN, '--dir', D, '--session', 'demo', '--transcript', tr, '--pilot', '2', ...more], { encoding: 'utf8' });

test('INDEX sections preserved verbatim, header and pilot line present, INDEX untouched', () => {
    const { D, tr, index } = setup();
    const r = run(D, tr);
    assert.strictEqual(r.status, 0, r.stderr);
    const out = readFileSync(join(D, 'lunum', 'INDEX.md'), 'utf8');
    assert.ok(out.startsWith('# Handoff demo (Lunum variant, pilot #2)\n'));
    assert.ok(out.includes('At the end of your first report write: `pilot: reasks=N rereads=N`.'));
    const body = index.split('\n').slice(1).join('\n').trim();
    assert.ok(out.includes(body));
    assert.ok(!out.includes('# demo handoff title'));
    assert.ok(out.includes('## Working files and peers'));
    assert.strictEqual(readFileSync(join(D, 'INDEX.md'), 'utf8'), index);
});

test('paths with existence and refs extracted; duplicate name flagged', () => {
    const { root, D, tr } = setup();
    assert.strictEqual(run(D, tr).status, 0);
    const out = readFileSync(join(D, 'lunum', 'INDEX.md'), 'utf8');
    assert.ok(out.includes(`- ${root}/run.sh (exists)`));
    assert.ok(out.includes('- ./missing.py (not found on disk)'));
    assert.ok(out.includes(`- ${root}/notes.md (not found on disk)`));
    assert.ok(out.includes(`${root}/HANDOVER.md`));
    assert.ok(out.includes('- alpha [aaaaaa] (duplicate name: use the ref)'));
    assert.ok(out.includes('- alpha [bbbbbb] (duplicate name: use the ref)'));
    assert.ok(out.includes('- beta [cccccc]\n'));
    assert.ok(out.includes('- [dddddd]\n'));
});

test('redact-file replaces literals; secret pattern exits non-zero listing lines only', () => {
    const { D, tr } = setup('- codeword zebra-plum-17 is internal.');
    const rf = join(D, '..', 'redact.txt');
    writeFileSync(rf, 'zebra-plum-17\n');
    assert.strictEqual(run(D, tr, ['--redact-file', rf]).status, 0);
    const out = readFileSync(join(D, 'lunum', 'INDEX.md'), 'utf8');
    assert.ok(out.includes('codeword [REDACTED] is internal'));
    assert.ok(!out.includes('zebra-plum-17'));
    const fake = 'ghp_' + 'A1b2C3d4E5'.repeat(3);
    const s = setup(`- leaked ${fake} here`);
    const r = run(s.D, s.tr);
    assert.notStrictEqual(r.status, 0);
    assert.match(r.stderr, /lines?:? .*\d/);
    assert.ok(!r.stderr.includes(fake));
});

test('INDEX already has Working files and peers: no generated section, only missing extras appended', () => {
    const { root, D, tr, index } = setup('');
    writeFileSync(join(D, 'INDEX.md'), index + `\n## Working files and peers\n- ${root}/run.sh already listed\n- peer alpha [aaaaaa]\n`);
    writeFileSync(join(D, 'topics', 't.md'), `See ${root}/run.sh and ${root}/extra-file.md, peer gamma [eeeeee].\n`);
    const r = run(D, tr);
    assert.strictEqual(r.status, 0, r.stderr);
    const out = readFileSync(join(D, 'lunum', 'INDEX.md'), 'utf8');
    assert.strictEqual(out.split('\n').filter((l) => l === '## Working files and peers').length, 1);
    assert.ok(!out.includes('### Files and paths'));
    const extra = out.slice(out.indexOf('## Working files and peers (extra, extracted)')).split('\n\n')[1];
    assert.ok(extra.includes(`${root}/extra-file.md`) && extra.includes('[eeeeee]'));
    assert.ok(!extra.includes('run.sh') && !extra.includes('[aaaaaa]'));
});

test('INDEX section covers everything: no extra section', () => {
    const { root, D, tr, index } = setup('');
    writeFileSync(join(D, 'INDEX.md'), index + `\n## Working files and peers\n- ${root}/notes.md\n`);
    assert.strictEqual(run(D, tr).status, 0);
    assert.ok(!readFileSync(join(D, 'lunum', 'INDEX.md'), 'utf8').includes('(extra, extracted)'));
});
