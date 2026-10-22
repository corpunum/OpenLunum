#!/usr/bin/env node
// Emits the frozen generic-en-pivot/0.2 renderer parity goldens from the BUILT TS dist, and the generic-en-pivot/0.3
// (mood, decisions/0031) render of the same inputs as `rendered_en_mood` where it differs from 0.2 (absent = identical).
//   node_modules/.bin/tsc -p packages/core/tsconfig.json; node scripts/generate-render-en-golden.mjs
// Input corpus: every entry of eval-results/golden-vectors/lfp21-golden.json (accepted AND rejected Sems; the
// renderer has its own, weaker validation, so many "rejected" Sems still render) plus crafted render edge cases.
// Output: eval-results/golden-vectors/render-en-golden.json  {meta, entries[]}
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { renderSem, LOSSLESS_RENDERER, MOOD_RENDERER } from '../packages/core/dist/src/render.js';
import { CANONICAL_SEMANTIC_FRAMES, SEMANTIC_FRAME_REGISTRY_VERSION } from '../packages/core/dist/src/frame-registry.js';

const root = new URL('../', import.meta.url).pathname;
const OUT = `${root}eval-results/golden-vectors/render-en-golden.json`;
const src = JSON.parse(fs.readFileSync(`${root}eval-results/golden-vectors/lfp21-golden.json`, 'utf8'));
const sha = (s) => createHash('sha256').update(s).digest('hex');

const entries = [];
const seen = new Set();
function emit(category, source, input, raw) {
  const key = raw ?? JSON.stringify(input);
  if (seen.has(key)) return;
  seen.add(key);
  const value = raw !== undefined ? JSON.parse(raw) : input;
  const entry = { category, source };
  if (raw !== undefined) entry.inputRaw = raw;
  else {
    const text = JSON.stringify(input);
    if (text === undefined) { entry.inputRaw = 'null'; }
    else if (JSON.stringify(JSON.parse(text)) !== text) entry.inputRaw = text;
    else entry.input = input;
  }
  try {
    entry.rendered_en = renderSem(value, { profile: LOSSLESS_RENDERER }).code;
    const mood = renderSem(value, { profile: MOOD_RENDERER }).code;
    if (mood !== entry.rendered_en) entry.rendered_en_mood = mood;
  } catch (e) {
    entry.error = true;
    entry.errorClass = e instanceof TypeError && String(e.message).startsWith('Invalid Lunum-Sem:') ? 'validation' : `js-${e?.constructor?.name ?? 'Error'}`;
    entry.reason = String(e?.message ?? e).slice(0, 300);
  }
  entries.push(entry);
}

// ---- 1. the lfp:2.1 golden corpus ----
for (const e of src.entries) {
  const cat = e.rejected ? `lfp-rejected/${e.category}` : `lfp-accepted/${e.category}`;
  emit(cat, `lfp21-golden:${e.source}`, e.input, e.inputRaw);
}

// ---- 2. crafted render edge cases ----
const base = (clauses, extra = {}) => ({ schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference', clauses, ...extra });
const A = { type: 'actor', id: 'user' };
const one = (cat, clause, extra) => emit(cat, 'crafted', base([clause], extra));
const RAWHEAD = '{"schema":"lunum-sem/0.1-draft","world":"real","kind":"preference","clauses":[{"predicate":"prefer","roles":{"experiencer":{"type":"actor","id":"user"},';
const rawTheme = (cat, themeJson, tail = '') => emit(cat, 'crafted-raw', undefined, `${RAWHEAD}"theme":${themeJson}}}]${tail}}`);

// every frame in registry 0.8
for (const [name, frame] of Object.entries(CANONICAL_SEMANTIC_FRAMES)) {
  const sample = (r) => (r.allowedTermTypes ? { type: r.allowedTermTypes[0], id: `${r.name}-1` } : `${r.name} text`);
  const req = Object.fromEntries(frame.roles.filter((r) => r.required).map((r) => [r.name, sample(r)]));
  const all = Object.fromEntries(frame.roles.map((r) => [r.name, sample(r)]));
  one('frame', { predicate: name, roles: req });
  one('frame', { predicate: name, roles: all });
  one('frame', { predicate: name, roles: all, negated: true, modality: 'obligation', time: 'now' });
  one('frame', { predicate: name, roles: req, modality: 'permission' });
  one('frame', { predicate: name, roles: req, conditions: [{ predicate: 'prefer', roles: { experiencer: A, theme: 'x' } }], consequences: [{ predicate: 'notify', roles: { agent: A } }] });
  one('frame', { predicate: name.toUpperCase().replace(/_/g, ' '), roles: Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toUpperCase(), v])) });
  one('frame', { predicate: name, roles: {} });
}

// numbers
for (const n of [0, -0, 1, 1.0, 1.5, -1.5, 1e21, 1e20, 1e-6, 1e-7, 0.1, 0.30000000000000004, 123456789012345680000, 5e-324, 1.7976931348623157e308, 2 ** 53, 9007199254740993, 100, 1.2345e-7, -1e-7]) {
  one('number', { predicate: 'below', roles: { subject: 'b', value: n } });
  one('number', { predicate: 'below', roles: { subject: 'b', value: { type: 'quantity', value: n, unit: 'percent' } } });
  one('number', { predicate: 'below', roles: { subject: 'b', value: { type: 'quantity', id: 'q', value: n, unit: 'percent' } } });
  one('number', { predicate: 'below', roles: { subject: 'b', value: { type: 'quantity', ref: n } } });
  one('number', { predicate: 'below', roles: { subject: 'b', value: { type: 'quantity', id: n } } });
  one('number', { predicate: 'p', roles: { value: [n, { value: n }, [n]] } });
  one('number', { predicate: 'p', roles: { value: { value: [n, n, null] } } });
  one('number', { predicate: 'p', roles: { value: 1 }, time: n });
}
rawTheme('number', '{"type":"quantity","value":-0,"min":-0.0,"max":1.0e0,"unit":"gb"}');
rawTheme('number', '{"type":"quantity","value":1e999,"unit":"gb"}');
rawTheme('number', '{"type":"quantity","value":0.30000000000000004,"unit":"x"}');
rawTheme('number', '{"type":"quantity","value":[1.0,-0,2.50,1e2,10000000000000000000000],"unit":"x"}');
rawTheme('number', '{"unit":"percent","value":123456789012345678901234567890}');
// units / head resolution
for (const t of [{ unit: 'percent', value: 20 }, { unit: 'percent' }, { unit: 'percent', id: 'a' }, { unit: 'percent', ref: 'r' }, { unit: '  Percent  X ', value: 'v' }, { unit: 5, value: 5 }, { unit: '', value: 5 },
  { unit: null, value: 5 }, { type: 'quantity' }, { type: 'Quantity ' }, { type: 'x-Foo Bar' }, { type: 5 }, { type: null }, { type: ['a', 'b'] }, { type: { a: 1 } }, { id: '' , value: 'x'}, { id: '  ', ref: 'r' }, { id: null, ref: 'r' },
  { id: 0 }, { id: false }, { id: true }, { id: [] }, { id: ['A', 'b'] }, { id: {} }, { ref: '  Foo  ' }, { value: null }, { value: false }, { value: 0 }, { value: '' }, { value: '  ' }, { value: ['a', ['b', 'c'], null] }, { value: {} }, { value: { id: 'in' } },
  { id: 'a', value: 'b', ref: 'c', unit: 'u' }, { value: 'a  b' }, { value: ' a\u0085b ' }, {}, [], [[]], [{}], [{ id: 'a' }, 'b', 3, null, true, [1, [2]]], ['a', ''], [''], [null], 'bare', '  Bare  Str ', '', 7, true, false, null]) {
  one('term', { predicate: 'p', roles: { theme: t, object: t } });
  one('term', { predicate: 'p', roles: { theme: t }, time: t });
  one('term', { predicate: 'p', roles: { theme: 'x' }, conditions: [{ predicate: 'c', roles: { theme: t } }] });
}
// quotes / unicode / whitespace
const strs = ['plain', 'sl/ash', 'quo"te', "it's", 'back\\slash', 'nl\ncr\rtab\tbs\bff\f', '\u0000\u0001\u001f', '\u007f', '  ', '\ud800', '\udc00', 'a\ud800b', '\ud83d', '\ude00\ud83d', '😀', '\u{10ffff}', '￾￿',
  ' x ', '﻿x﻿', '\u0085x\u0085', 'a\u0085b', 'a  b', 'a \t\n\r\u000b\u000c b', 'a b', 'a b', 'a᠎b', 'a​b', 'ΑΣ', 'ΑΣ ΑΣΑ', 'ΟΔΟΣ', 'İ', 'ẞ', 'ǈ', 'ﬁ', 'Å', 'é', 'é', 'ｱ', '①②', 'Ω', 'K', 'ΣΑΣ', 'ß', 'ǆ', 'Ⴀ', 'ᲀ', '你好', 'مرحبا', 'שלום', 'Привет', 'ὈΔΥΣΣΕΎΣ', 'ǅ', '‘quoted’', '“dq”', '{}[]()', 'a,b', 'a=b', 'a;b', '@t', 'if x then y', ' and '];
for (const s of strs) {
  one('string', { predicate: 'p', roles: { theme: s } });
  one('string', { predicate: 'p', roles: { theme: { type: 'text', value: s } } });
  one('string', { predicate: 'p', roles: { theme: { type: 'concept', id: s } } });
  one('string', { predicate: 'p', roles: { theme: { type: 'concept', ref: s, unit: s } } });
  one('string', { predicate: 'p', roles: { theme: { unit: s } } });
  one('string', { predicate: 'p', roles: { theme: [s, s] } });
  one('string', { predicate: s, roles: { theme: 'x' } });
  one('string', { predicate: 'p', roles: { [s]: 'x', a: 'y' } });
  one('string', { predicate: 'p', roles: { theme: 'x' }, modality: s });
  one('string', { predicate: 'p', roles: { theme: 'x' }, time: s });
  emit('string', 'crafted', base([{ predicate: 'p', roles: { theme: 'x' } }], { world: s }));
}
// worlds
for (const w of ['real', 'fiction', 'tool', 'dream', 'belief', 'metaphor', 'REAL', ' Real ', 'constructor', 'Constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'other', 'x-custom', 'ßeta', 'éclair', 'ǆ', 'ﬁne', '😀w', '\ud83dw', '\ud800', 'ǈ', 'ŉ', 'ΐ', 'çcedil', '1', 'true', 5, true, ['real'], { a: 1 }, 'a b']) {
  emit('world', 'crafted', base([{ predicate: 'p', roles: { theme: 'x' } }], { world: w }));
}
// modality / negation / time
for (const m of [undefined, null, '', 'obligation', 'permission', 'Obligation', ' OBLIGATION ', 'must', 'may', 'must_not', 'prohibition', 'x-custom', 5, true, false, ['obligation'], {}, 'toString', 'constructor', '__proto__', 'valueof', 'hasownproperty']) {
  for (const neg of [undefined, true, false, null, 'true', 1]) {
    one('modality', { predicate: 'send', roles: { agent: A }, ...(m === undefined ? {} : { modality: m }), ...(neg === undefined ? {} : { negated: neg }) });
    one('modality', { predicate: 'send', roles: { agent: A }, modality: m, negated: neg, time: neg });
  }
}
for (const t of [undefined, null, 'Monday', '', ' ', 0, false, { type: 'date', value: '2026-01-01' }, { type: 'date', id: '2026' }, { unit: 'days', value: 3 }, [1, 2], ['a'], 'x  y']) {
  one('time', { predicate: 'send', roles: { agent: A }, ...(t === undefined ? {} : { time: t }) });
  one('time', { predicate: 'send', roles: { agent: A }, time: t, conditions: [{ predicate: 'c', roles: {}, time: t }], consequences: [{ predicate: 'q', roles: {}, time: t }] });
}
// role ordering: known roles, ties, unknown roles, collation
const ROLES = ['agent', 'experiencer', 'subject', 'actor', 'recipient', 'object', 'theme', 'patient', 'target', 'source', 'destination', 'location', 'time', 'manner', 'value', 'reason', 'evidence', 'definition', 'relation', 'attribute', 'items', 'connective'];
{
  let seed = 0x2f3e4d5c;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const unknown = ['x-foo', 'x-Foo', 'X-FOO', 'x_foo', 'x foo', 'x-foo-bar', 'zeta', 'alpha', 'Alpha', 'ALPHA', 'beta2', 'beta10', 'beta1', '10', '2', '1', '0', '01', '007', '4294967294', '4294967295', 'a1', 'a_1', 'a-1', 'a.1', 'a', 'aa', 'ab', 'b', 'é', 'e', 'f', 'ä', 'z', 'å', 'ø', 'æ', 'ß', 'ss', 'ñ', 'n', 'o', '_', '-', '.', '~', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '+', '=', '"', "'", '`', '\\', '/', '?', ',', ';', ':', '<', '>', '|', '{', '}', '[', ']', 'я', 'а', 'б', 'ж', 'α', 'β', 'ω', 'ς', 'σ', '你', '好', 'あ', 'ア', '한', 'א', 'ب', '😀', '€', '©', '½', 'ǆ', 'ĳ', 'ij', 'ﬁ', 'fi', 'x́', 'x̣', 'x̣́', 'ẍ', 'ế', 'ế', 'constructor', '__proto__', 'prototype', 'tostring', 'a\u0000b', 'a\ud800b', 'length', 'hasownproperty'];
  for (const r of ROLES) for (const r2 of ROLES) if (r < r2 && rnd() < 0.3) one('roles', { predicate: 'p', roles: { [r2]: 'two', [r]: 'one' } });
  one('roles', { predicate: 'p', roles: Object.fromEntries(ROLES.map((r) => [r, r])) });
  one('roles', { predicate: 'p', roles: Object.fromEntries([...ROLES].reverse().map((r) => [r.toUpperCase(), r])) });
  for (const u of unknown) {
    one('roles', { predicate: 'p', roles: { [u]: 'u', agent: 'a', time: 't' } });
    one('roles', { predicate: 'p', roles: { [u]: 'u', zzz: 'z', aaa: 'a' } });
  }
  for (let i = 0; i < 900; i++) {
    const n = 2 + Math.floor(rnd() * 6);
    const roles = {};
    for (let j = 0; j < n; j++) roles[rnd() < 0.3 ? ROLES[Math.floor(rnd() * ROLES.length)] : unknown[Math.floor(rnd() * unknown.length)]] = `v${j}`;
    one('roles', { predicate: 'p', roles });
  }
  // random multi-char unknown role names
  const alpha = 'abAB09_-é ǆ́ßΑσ你😀.~'.match(/./gu);
  for (let i = 0; i < 600; i++) {
    const roles = {};
    const n = 2 + Math.floor(rnd() * 5);
    for (let j = 0; j < n; j++) { let k = ''; const len = 1 + Math.floor(rnd() * 5); for (let q = 0; q < len; q++) k += alpha[Math.floor(rnd() * alpha.length)]; roles[k] = `v${j}`; }
    one('roles', { predicate: 'p', roles });
  }
  one('roles', { predicate: 'p', roles: { a: 'x', A: 'y', ' a': 'z', 'a ': 'w', 'A ': 'v' } });
  one('roles', { predicate: 'p', roles: { RECIPIENT: 'x', recipient: 'y' } });
  one('roles', { predicate: 'p', roles: { constructor: 'x', Constructor: 'y', __PROTO__: { id: 'z' }, x: 'q' } });
  one('roles', { predicate: 'p', roles: { __Proto__: 'prim', y: 1 } });
  one('roles', { predicate: 'p', roles: { agent: null, theme: false, object: 0, value: '' } });
}
// conditions / consequences nesting
const cl = (p, r = {}, e = {}) => ({ predicate: p, roles: r, ...e });
one('conditional', cl('send', { agent: A, theme: 'x' }, { conditions: [cl('below', { subject: 'b', value: { type: 'quantity', value: 20, unit: 'percent' } })], consequences: [cl('notify', { agent: A })] }));
one('conditional', cl('send', { agent: A }, { conditions: [cl('c1'), cl('c2', { a: 1 })] }));
one('conditional', cl('send', { agent: A }, { consequences: [cl('q1'), cl('q2', {}, { negated: true, modality: 'permission', time: 'then' })] }));
one('conditional', cl('send', { agent: A }, { conditions: [cl('c', {}, { conditions: [cl('cc')], consequences: [cl('cq')] })], consequences: [cl('q', {}, { conditions: [cl('qc')] })] }));
for (const v of [[], null, false, 0, '', 'abc', true, {}, 5, { length: 2 }, { length: 0 }, { length: '' }, { length: 'x' }, [null], ['x'], [5], [[]], [{}], [{ roles: {} }], [{ predicate: 'a' }], [{ predicate: 'a', roles: 'ab' }], [{ predicate: 'a', roles: 5 }], [{ predicate: 'a', roles: ['x', 'y'] }], [{ predicate: 'a', roles: null }], [{ roles: { a: 1 } }], [{ predicate: null, roles: {} }], [{ predicate: 5, roles: {} }], [{ predicate: ['a', 'B'], roles: {} }], [{ predicate: { a: 1 }, roles: {} }]]) {
  for (const key of ['conditions', 'consequences']) {
    one('conditional-odd', cl('send', { agent: A }, { [key]: v }));
    one('conditional-odd', cl('send', { agent: A }, { conditions: [cl('c')], [key]: v }));
  }
}
for (const e of [{ negated: true }, { modality: 'obligation' }, { time: 't' }, { annotations: { a: 1 } }, { rogue: 1 }]) one('conditional', cl('p', { a: 1 }, { conditions: [cl('c', {}, e)], consequences: [cl('q', {}, e)], ...e }));
// multi-clause / top level
emit('top-level', 'crafted', base([cl('a', { x: 1 }), cl('b', { y: 2 }), cl('c', { z: 3 }, { conditions: [cl('d')] })]));
for (const v of [null, [], 'x', 1, {}, { schema: 'lunum-sem/0.2', world: 'real', kind: 'event', clauses: [cl('a')] }, base([cl('a')], { schema: 'other' }), { schema: 'lunum-sem/0.1-draft', kind: 'e', clauses: [cl('a')] }, base([cl('a')], { world: '  ' }), base([cl('a')], { kind: '' }), base([]), base({}), base([null]), base(['x']), base([{ roles: {} }]), base([{ predicate: 'a' }]), base([{ predicate: 'a', roles: [] }]), base([{ predicate: 'a', roles: null }]), base([cl('a')], { references: 'x' }), base([cl('a')], { references: [null] }), base([cl('a')], { references: [{ ref: 'a' }] }),
  base([cl('a')], { provenance: { a: 1 }, annotations: { b: [1] } }), base([cl('a'), 5]), base([cl('a'), null])]) emit('top-level', 'crafted', v);
for (const k of ['__proto__', 'constructor', 'prototype']) {
  rawTheme('forbidden-keys', `{"type":"concept","id":"a","${k}":{"x":1}}`);
  rawTheme('forbidden-keys', '"t"', `,"annotations":{"deep":[{"${k}":null}]}`);
  rawTheme('forbidden-keys', '"t"', `,"${k}":1`);
}
rawTheme('proto', '{"id":"a","value":{"__proto__":{"id":"in-value"}}}');
emit('dup-keys', 'crafted-raw', undefined, `${RAWHEAD}"theme":"t","theme":"t2"}}]}`);
emit('dup-keys', 'crafted-raw', undefined, '{"schema":"lunum-sem/0.1-draft","world":"real","world":"fiction","kind":"preference","clauses":[{"predicate":"prefer","roles":{"experiencer":"a","theme":"t"}}]}');
emit('dup-keys', 'crafted-raw', undefined, `${RAWHEAD}"theme":{"type":"concept","id":"x","id":"y"}}}]}`);
emit('lone-surrogate-keys', 'crafted-raw', undefined, `${RAWHEAD}"theme":"t","x-\\ud800":"a","x-\\udc00":"b"}}]}`);

// mood (generic-en-pivot/0.3): kinds, addressee roles, case/space normalisation, multi-clause, conditionals
{
  const Y = { type: 'text', value: 'you' };
  for (const kind of ['question', 'instruction', 'command', 'Question', ' QUESTION ', 'INSTRUCTION', 'Command ', 'directive', 'conditional_instruction', 'plan_instruction', 'event', 'simple_fact', 'x-question', 'question?', 5, true, ['question']]) {
    for (const roles of [{}, { action: { type: 'text', value: 'stop' }, object: { type: 'text', value: 'looking at me' } }, { subject: Y, action: 'sleep' }, { agent: A, theme: 'x' }, { actor: 'a' }, { experiencer: 'e', theme: 't' },
      { AGENT: 'a' }, { ' Subject ': 's' }, { recipient: 'r' }, { agent: null }, { subject: '' }, { agents: 'a' }]) {
      emit('mood', 'crafted', base([cl('assert', roles)], { kind }));
      emit('mood', 'crafted', base([cl('assert', roles, { negated: true, modality: 'necessity', time: 'today' })], { kind }));
    }
    emit('mood', 'crafted', base([cl('assert', { action: 'go' }), cl('assert', { subject: Y, action: 'stay' })], { kind }));
    emit('mood', 'crafted', base([cl('assert', { subject: Y, action: 'go' }), cl('assert', { action: 'stay' })], { kind }));
    emit('mood', 'crafted', base([cl('enable', { theme: 'x' }, { conditions: [cl('below', { subject: 'b' })], consequences: [cl('notify', { agent: A })] })], { kind }));
    emit('mood', 'crafted', base([cl('enable', { theme: 'x' })], { kind, world: 'tool' }));
  }
  emit('mood', 'crafted-raw', undefined, '{"schema":"lunum-sem/0.1-draft","world":"real","kind":"instruction","clauses":[{"predicate":"assert","roles":{"__proto__":{"id":"x"},"action":"go"}}]}');
  emit('mood', 'crafted-raw', undefined, '{"schema":"lunum-sem/0.1-draft","world":"real","kind":"instruction","clauses":[{"predicate":"assert","roles":{"agent":"a","agent":"b"}}]}');
  emit('mood', 'crafted-raw', undefined, '{"schema":"lunum-sem/0.1-draft","world":"real","kind":"command","clauses":[{"predicate":"assert","roles":["agent","x"]}]}');
}

const meta = {
  generator: 'scripts/generate-render-en-golden.mjs',
  renderer: LOSSLESS_RENDERER,
  moodRenderer: MOOD_RENDERER,
  node: process.version, icu: process.versions.icu, unicode: process.versions.unicode,
  defaultLocale: new Intl.Collator().resolvedOptions().locale,
  sourceGitSha: execSync('git rev-parse HEAD', { cwd: root }).toString().trim(),
  sourceGoldenSha256: sha(fs.readFileSync(`${root}eval-results/golden-vectors/lfp21-golden.json`)),
  frameRegistryVersion: SEMANTIC_FRAME_REGISTRY_VERSION,
  frameCount: Object.keys(CANONICAL_SEMANTIC_FRAMES).length,
  counts: { total: entries.length, rendered: entries.filter((e) => !e.error).length, error: entries.filter((e) => e.error).length, moodDiffers: entries.filter((e) => e.rendered_en_mood !== undefined).length },
  byCategory: {}
};
for (const e of entries) { const m = (meta.byCategory[e.category] ??= { rendered: 0, error: 0 }); m[e.error ? 'error' : 'rendered']++; }
fs.writeFileSync(OUT, JSON.stringify({ meta, entries }));
console.log(JSON.stringify(meta, null, 1));
