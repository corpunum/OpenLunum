#!/usr/bin/env node
// judge-calibration-v1: build the calibration items. Offline, no model call. Deterministic.
// 1. Greek: the owner's 40 labelled pairs (experiments/pivot-el-en-v1/calibration), labels parsed by the rule in that
//    README (a box counts as marked if it matches [xXχΧ✓✔]; exactly one box = valid, else "unlabelled").
// 2. English: the 20 seeded A3 controls (same seed and pairing as experiments/coverage-a3-v1/judge.mjs: a sentence paired
//    with another covered sentence's record), rendered with generic-en-pivot/0.3 by the Rust CLI, with Rust-TS parity.
//   node experiments/judge-calibration-v1/prepare.mjs   -> items.jsonl, prepare.json
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { renderSem, MOOD_RENDERER } from '../../packages/core/dist/src/render.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../..');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const J = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const calib = path.join(root, 'experiments/pivot-el-en-v1/calibration');

// ---- 1. owner labels ----
const LABELS = ['same', 'mostly_same', 'different', 'cant_tell'];
const sheet = fs.readFileSync(path.join(calib, 'WORKSHEET-owner-filled.md'), 'utf8');
const owner = new Map();
for (const sec of sheet.split(/^## /mu).slice(1)) {
  const id = Number(sec.match(/^(\d+)/u)?.[1]);
  const boxes = [...sec.matchAll(/^- \[(.)\]/gmu)].slice(0, 4).map((m) => /[xXχΧ✓✔]/u.test(m[1]));
  const marked = boxes.flatMap((b, i) => (b ? [LABELS[i]] : []));
  owner.set(id, boxes.length === 4 && marked.length === 1 ? marked[0] : 'unlabelled');
}
const items = [];
for (const it of J(path.join(calib, 'items.jsonl'))) {
  items.push({ set: 'greek', id: `el-${it.id}`, original: it.greekOriginal, after: it.shownGreek, isControl: it.isControl, controlKind: it.controlKind, owner: owner.get(it.id) });
}

// ---- 2. A3 controls, rendered with 0.3 ----
const a3 = path.join(root, 'experiments/coverage-a3-v1');
const SEED = 'coverage-a3-v1-judge:2026-10-22';
const text = new Map(J(path.join(a3, 'requests-v27.jsonl')).map((r) => [r.handle, r.sourceText]));
const covered = J(path.join(a3, 'bar2/covered.jsonl'));
const bin = path.join(root, 'crates/lunum-render/target/release/lunum-render');
const out = execFileSync(bin, ['--profile', MOOD_RENDERER], { input: covered.map((c) => JSON.stringify(c)).join('\n') + '\n' }).toString();
const rust = new Map(J2(out).map((r) => [r.handle, r.code]));
function J2(s) { return s.split('\n').filter(Boolean).map((l) => JSON.parse(l)); }
let parity = 0;
for (const c of covered) if (rust.get(c.handle) === renderSem(c.sem, { profile: MOOD_RENDERER }).code) parity += 1;
if (parity !== covered.length) throw new Error(`rust_ts_parity ${parity}/${covered.length}`);
const order = [...covered].sort((x, y) => (sha(`${SEED}|${x.handle}`) < sha(`${SEED}|${y.handle}`) ? -1 : 1));
for (let i = 0; i < 20; i += 1) {
  items.push({ set: 'a3-control', id: `${order[i].handle}~${order[i + 1].handle}`, sentence: text.get(order[i].handle), code: rust.get(order[i + 1].handle), isControl: true });
}
fs.writeFileSync(path.join(here, 'items.jsonl'), items.map((x) => JSON.stringify(x)).join('\n') + '\n');
const greek = items.filter((x) => x.set === 'greek');
const summary = { greekItems: greek.length, greekControls: greek.filter((x) => x.isControl).length,
  ownerLabels: Object.fromEntries([...LABELS, 'unlabelled'].map((l) => [l, greek.filter((x) => !x.isControl && x.owner === l).length])),
  ownerControlsCaught: greek.filter((x) => x.isControl && x.owner === 'different').length,
  a3Controls: 20, renderer: MOOD_RENDERER, rustTsParity: `${parity}/${covered.length}`, itemsSha256: sha(fs.readFileSync(path.join(here, 'items.jsonl'), 'utf8')) };
fs.writeFileSync(path.join(here, 'prepare.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(summary);
