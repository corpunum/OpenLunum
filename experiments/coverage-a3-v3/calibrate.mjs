#!/usr/bin/env node
// coverage-a3-v3 judge calibration (PREREGISTRATION.md, "Judge calibration"), applied separately per arm.
// A judge passes an arm when: Cohen's kappa >= 0.4 against the labels over the 40 calibration items (yes/mostly =
// states, no = does not, can't tell dropped; the 8 controls count as "no"), <= 1/8 calibration controls answered
// yes, and <= 1/20 bar controls answered yes. Prompt: judge-calibration-v1's englishPrompt, unchanged.
// Labels: calibration/labels.json (rater claude-blind; DEVIATIONS.md D1: model-rated calibration).
// Resumable (<out>.partial.jsonl). One call at a time.
//   node calibrate.mjs --judge luna --out calibration/judge-luna.json
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { JUDGES, ask, englishPrompt, sleep } from '../judge-calibration-v1/judges.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const J = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
export const ARMS = ['r0', 'r1'];

/** Cohen's kappa for two binary raters over paired booleans. */
export function kappa(pairs) {
  const n = pairs.length;
  if (!n) return null;
  const po = pairs.filter(([a, b]) => a === b).length / n;
  const pa = pairs.filter(([a]) => a).length / n;
  const pb = pairs.filter(([, b]) => b).length / n;
  const pe = pa * pb + (1 - pa) * (1 - pb);
  return pe === 1 ? null : (po - pe) / (1 - pe);
}

/** The items a judge sees, in a fixed order: 40 calibration items and 20 bar controls, for each arm. */
export function calibrationItems({ items, controls, labels }) {
  const byId = new Map(labels.labels.map((l) => [l.id, l]));
  const out = [];
  for (const arm of ARMS) {
    for (const it of items) {
      const label = it.control ? 'no' : byId.get(it.id)?.label;
      if (!label) throw new Error(`label_missing:${it.id}`);
      out.push({ arm, set: it.control ? 'calControl' : 'natural', id: it.id, sentence: it.sentence, code: it[arm], label });
    }
    for (const c of controls) out.push({ arm, set: 'barControl', id: c.id, sentence: c.sentence, code: c[arm], label: 'no' });
  }
  return out;
}

const BINARY = { yes: true, mostly: true, no: false, cant_tell: null };

/** Per-arm verdict from rows { arm, set, label, states }. `mostlyAsNo` is the D1 sensitivity check (no bar). */
export function summarize(rows, { mostlyAsNo = false } = {}) {
  const out = {};
  for (const arm of ARMS) {
    const r = rows.filter((x) => x.arm === arm);
    const cal = r.filter((x) => x.set !== 'barControl');
    const truth = (x) => (mostlyAsNo && x.label === 'mostly' ? false : BINARY[x.label]);
    const pairs = cal.filter((x) => truth(x) !== null).map((x) => [truth(x), x.states === true]);
    const k = kappa(pairs);
    const calYes = r.filter((x) => x.set === 'calControl' && x.states === true).length;
    const barYes = r.filter((x) => x.set === 'barControl' && x.states === true).length;
    const nat = r.filter((x) => x.set === 'natural');
    out[arm] = {
      kappa: k == null ? null : Number(k.toFixed(4)), n: pairs.length,
      calControlsYes: calYes, calControls: r.filter((x) => x.set === 'calControl').length,
      barControlsYes: barYes, barControls: r.filter((x) => x.set === 'barControl').length,
      naturalYesRate: nat.length ? Number((nat.filter((x) => x.states === true).length / nat.length).toFixed(4)) : null,
      unparseable: r.filter((x) => x.states === null).length,
      pass: k != null && k >= 0.4 && calYes <= 1 && barYes <= 1
    };
  }
  return out;
}

async function main() {
  const name = arg('--judge'); const j = JUDGES[name];
  if (!j) throw new Error('unknown judge');
  if (['claude', 'haiku', 'sonnet', 'opus'].some((x) => name.includes(x))) throw new Error('claude_judges_excluded');
  const items = J(path.join(here, 'calibration/items.jsonl'));
  const controls = J(path.join(here, 'bar/controls.jsonl'));
  const labels = JSON.parse(fs.readFileSync(path.join(here, 'calibration/labels.json'), 'utf8'));
  const all = calibrationItems({ items, controls, labels });
  const out = arg('--out');
  const partial = `${out}.partial.jsonl`;
  const done = new Map(J(partial).map((r) => [`${r.arm}|${r.set}|${r.id}`, r]));
  for (const it of all) {
    const key = `${it.arm}|${it.set}|${it.id}`;
    if (done.has(key)) continue;
    const p = englishPrompt(it.sentence, it.code);
    const { verdict, reply } = await ask(j, p, 'states');
    const row = { arm: it.arm, set: it.set, id: it.id, label: it.label, promptSha256: sha(p), states: verdict, reply };
    fs.appendFileSync(partial, JSON.stringify(row) + '\n');
    done.set(key, row);
    console.log(JSON.stringify({ arm: row.arm, set: row.set, n: done.size, states: verdict }));
    if (j.gapMs) await sleep(j.gapMs);
  }
  const rows = all.map((it) => done.get(`${it.arm}|${it.set}|${it.id}`));
  const summary = { judge: name, label: j.label, rater: labels.rater, modelRatedCalibration: true, arms: summarize(rows), sensitivityMostlyAsNo: summarize(rows, { mostlyAsNo: true }) };
  fs.writeFileSync(out, JSON.stringify({ summary, results: rows }, null, 1) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
