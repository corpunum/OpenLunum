#!/usr/bin/env node
// coverage-a3-v3 scoring (PREREGISTRATION.md "Bars"): the two selected judges score the 139 covered records of
// coverage-a3-v2 plus the 20 bar controls (bar/controls.jsonl), in both arms (R0 = the Rust generic-en-pivot/0.3
// render from coverage-a3-v2/score.json; R1 = verbFirst of it). Prompt: judge-calibration-v1's englishPrompt, unchanged.
// A judge is refused unless calibration/judge-<name>.json passed on R1 (selection is by R1 calibration).
// Resumable (<out>.partial.jsonl). One call at a time. Calibration is model-rated (DEVIATIONS.md D1).
//   node score.mjs --judge <name> --out bar/score-<name>.json
//   node score.mjs --verdict bar/score-a.json,bar/score-b.json --out RESULTS.data.json [--categories <file.json>]
// --categories: { "<handle>": "A"|"B"|"C"|"D" } for the 48 records both coverage-a3-v2 strict judges rejected.
// coverage-a3-v2 records those categories only in prose (RESULTS.md "The 48 records"); build-categories.mjs derives
// bar/categories-v2.json from it mechanically. There is no default; without
// the file, per-category acceptance and the C+D credibility check are reported as not computed.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { JUDGES, ask, englishPrompt, sleep } from '../judge-calibration-v1/judges.mjs';
import { verbFirst } from './render-verb-first.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const v2 = path.join(here, '../coverage-a3-v2');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const J = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const round = (x) => (x == null ? null : Number(x.toFixed(4)));

export const ARMS = ['r0', 'r1'];
export const CALIBRATION_LABEL = 'model-rated calibration';
export const CATEGORIES = ['A', 'B', 'C', 'D'];
export const CATEGORY_COUNTS = { A: 24, B: 12, C: 9, D: 3 };
export const BAR = { rate: 0.8, agreement: 0.75, controlsYesMax: 2, controls: 20, records: 139, cdAcceptMax: 6, lift: 0.1 };
// Same synthetic preflight as calibrate.mjs (DEVIATIONS D2); in no item set.
export const PREFLIGHT = { sentence: 'The cat sleeps.', code: 'R assert(subject=The cat, action=sleeps)' };

/** Mood from the render prefix (both arms keep it): 'question:' / 'imperative' / else statement. */
export function moodOf(code) {
  const s = String(code).replace(/^[RM] /, '');
  if (s.startsWith('question:')) return 'question';
  if (s.startsWith('imperative')) return 'imperative';
  return 'statement';
}

/**
 * The items a judge scores, in a fixed order: for each arm, the records (kind 'own') then the bar controls.
 * renders: [{ handle, code }] (the 0.3 renders); text: Map handle -> sentence; controls: bar/controls.jsonl rows.
 */
export function scoreItems({ renders, text, controls }) {
  const out = [];
  for (const arm of ARMS) {
    for (const r of renders) {
      const sentence = text.get(r.handle);
      if (sentence == null) throw new Error(`sentence_missing:${r.handle}`);
      out.push({ arm, kind: 'own', id: r.handle, sentence, code: arm === 'r0' ? r.code : verbFirst(r.code), mood: moodOf(r.code) });
    }
    for (const c of controls) out.push({ arm, kind: 'control', id: c.id, sentence: c.sentence, code: c[arm] });
  }
  return out;
}

/** Per-arm summary of one judge's rows { arm, kind, states }. A reply that does not parse (null) counts as "no". */
export function summarizeJudge(rows) {
  const out = {};
  for (const arm of ARMS) {
    const r = rows.filter((x) => x.arm === arm);
    const own = r.filter((x) => x.kind === 'own'); const ctl = r.filter((x) => x.kind === 'control');
    const states = own.filter((x) => x.states === true).length;
    out[arm] = { records: own.length, states, rate: own.length ? round(states / own.length) : null,
      controls: ctl.length, controlsYes: ctl.filter((x) => x.states === true).length, unparseable: r.filter((x) => x.states == null).length };
  }
  return out;
}

/** Category of each handle; checks the map is exactly the 48 jointly rejected records with counts 24/12/9/3. */
export function checkCategories(categories, bothReject) {
  const keys = Object.keys(categories);
  const want = new Set(bothReject);
  if (keys.length !== want.size || !keys.every((k) => want.has(k))) throw new Error('categories_not_the_jointly_rejected_set');
  for (const c of CATEGORIES) {
    const n = keys.filter((k) => categories[k] === c).length;
    if (n !== CATEGORY_COUNTS[c]) throw new Error(`category_count:${c}:${n}`);
  }
  if (!keys.every((k) => CATEGORIES.includes(categories[k]))) throw new Error('category_unknown');
  return categories;
}

/**
 * The verdict from two judges' score files ({ summary, results }).
 * opts.categories: handle -> A/B/C/D (or null: not computed). opts.v2LunaRate: coverage-a3-v2 Luna acceptance (judging effect).
 * opts.calibration: [{ judge, r1: { pass, kappa } }] for every calibrated judge (selection check), or null.
 */
export function verdict(files, { categories = null, v2LunaRate = null, calibration = null } = {}) {
  if (files.length !== 2) throw new Error('need_two_judges');
  const names = files.map((f) => f.summary.judge);
  if (names[0] === names[1]) throw new Error('same_judge_twice');
  const judgeRows = files.map((f) => f.results);
  // Both judges must have read byte-identical prompts for every item they share.
  const shaOf = new Map(judgeRows[0].map((r) => [`${r.arm}|${r.kind}|${r.id}`, r.promptSha256]));
  for (const r of judgeRows[1]) {
    const k = `${r.arm}|${r.kind}|${r.id}`;
    if (shaOf.has(k) && shaOf.get(k) !== r.promptSha256) throw new Error(`prompt_mismatch:${k}`);
  }
  const yes = (rows, arm, kind) => new Map(rows.filter((r) => r.arm === arm && r.kind === kind).map((r) => [r.id, r.states === true]));
  const arms = {};
  for (const arm of ARMS) {
    const own = judgeRows.map((rows) => yes(rows, arm, 'own'));
    const ids = [...own[0].keys()].filter((k) => own[1].has(k));
    const agree = ids.filter((k) => own[0].get(k) === own[1].get(k)).length;
    const moodById = new Map(judgeRows[0].filter((r) => r.arm === arm && r.kind === 'own').map((r) => [r.id, r.mood ?? moodOf(r.code ?? '')]));
    const each = judgeRows.map((rows, i) => {
      const s = summarizeJudge(rows)[arm];
      const byMood = {};
      for (const m of ['statement', 'question', 'imperative']) {
        const mi = ids.filter((k) => moodById.get(k) === m);
        byMood[m] = { n: mi.length, states: mi.filter((k) => own[i].get(k)).length };
      }
      let byCategory = null; let cd = null;
      if (categories) {
        byCategory = {};
        for (const c of CATEGORIES) {
          const ci = Object.keys(categories).filter((k) => categories[k] === c);
          byCategory[c] = { n: ci.length, states: ci.filter((k) => own[i].get(k) === true).length };
        }
        cd = { n: byCategory.C.n + byCategory.D.n, states: byCategory.C.states + byCategory.D.states };
      }
      return { judge: names[i], ...s, controlsOk: s.controls === BAR.controls && s.controlsYes <= BAR.controlsYesMax, byMood, byCategory, cdAccepted: cd };
    });
    arms[arm] = { each, both: ids.length, agree, agreement: ids.length ? round(agree / ids.length) : null,
      bothReject: ids.filter((k) => !own[0].get(k) && !own[1].get(k)) };
  }
  const r1 = arms.r1;
  const complete = r1.both === BAR.records && r1.each.every((e) => e.records === BAR.records && e.controls === BAR.controls);
  const numeric = complete ? r1.each.every((e) => e.rate >= BAR.rate && e.controlsOk) && r1.agreement >= BAR.agreement : null;
  let credible = null;
  if (categories) credible = r1.each.every((e) => e.cdAccepted.states <= BAR.cdAcceptMax);
  const lift = names.map((judge, i) => ({ judge, r0: arms.r0.each[i].rate, r1: arms.r1.each[i].rate,
    lift: arms.r0.each[i].rate == null || arms.r1.each[i].rate == null ? null : round(arms.r1.each[i].rate - arms.r0.each[i].rate) }));
  const bar1 = {
    arm: 'r1', verdictPossible: complete,
    pass: numeric, // the numeric bar; null = no verdict (incomplete files)
    credible, // C+D check: false if either judge accepts more than 6 of the 12 C+D records under R1; null = categories not supplied
    reported: numeric === null ? 'no verdict' : numeric === false ? 'fail' : credible === false ? 'pass, not credible' : credible === null ? 'pass, credibility not computed' : 'pass',
  };
  const out = {
    calibration: CALIBRATION_LABEL,
    judges: names,
    bars: BAR,
    bar1,
    arms,
    attribution: {
      renderEffect: lift,
      liftAtLeast10PointsBoth: lift.every((l) => l.lift != null && l.lift >= BAR.lift - 1e-9),
      judgingEffect: v2LunaRate == null ? null : names.map((judge, i) => ({ judge, r0: arms.r0.each[i].rate, v2Luna: round(v2LunaRate), diff: arms.r0.each[i].rate == null ? null : round(arms.r0.each[i].rate - v2LunaRate) })),
    },
    categories: categories ? 'supplied' : 'not computed: coverage-a3-v2 records the A/B/C/D categories only in prose (RESULTS.md); pass --categories',
  };
  if (calibration) {
    const passing = calibration.filter((c) => c.r1?.pass).sort((a, b) => (b.r1.kappa ?? -Infinity) - (a.r1.kappa ?? -Infinity));
    const top2 = passing.slice(0, 2).map((c) => c.judge);
    out.selection = { passingByR1Kappa: passing.map((c) => ({ judge: c.judge, kappa: c.r1.kappa })), topTwo: top2,
      scoredAreTopTwo: names.every((n) => top2.includes(n)), noVerdictFewerThanTwo: passing.length < 2 };
  }
  return out;
}

function loadRecords({ result, requests }) {
  const text = new Map(J(requests).map((r) => [r.handle, r.sourceText]));
  const res = JSON.parse(fs.readFileSync(result, 'utf8'));
  if (!res.parity?.pass) throw new Error('rust_ts_render_parity_not_established');
  if (res.renders.length !== BAR.records) throw new Error(`expected_${BAR.records}_records:${res.renders.length}`);
  return { renders: res.renders, text };
}

async function judgeMain(name) {
  const j = JUDGES[name];
  if (!j) throw new Error('unknown judge');
  if (['claude', 'haiku', 'sonnet', 'opus'].some((x) => name.includes(x))) throw new Error('claude_judges_excluded');
  const calFile = path.join(here, `calibration/judge-${name}.json`);
  if (!fs.existsSync(calFile)) throw new Error(`judge_not_calibrated:${name}`);
  const cal = JSON.parse(fs.readFileSync(calFile, 'utf8')).summary;
  if (cal?.arms?.r1?.pass !== true) throw new Error(`judge_failed_r1_calibration:${name}`);
  const out = arg('--out'); if (!out) throw new Error('--out required');
  const { renders, text } = loadRecords({ result: arg('--result') ?? path.join(v2, 'score.json'), requests: arg('--requests') ?? path.join(v2, 'requests.jsonl') });
  const controls = J(path.join(here, 'bar/controls.jsonl'));
  if (controls.length !== BAR.controls) throw new Error(`expected_${BAR.controls}_controls`);
  const items = scoreItems({ renders, text, controls });
  // Preflight (DEVIATIONS D2), as in calibrate.mjs: the run does not start unless one synthetic call parses.
  const pre = await ask(j, englishPrompt(PREFLIGHT.sentence, PREFLIGHT.code), 'states');
  console.log(JSON.stringify({ preflight: { verdict: pre.verdict, status: pre.status ?? null, finishReason: pre.finishReason ?? null, fromReasoning: pre.fromReasoning ?? false } }));
  if (typeof pre.verdict !== 'boolean') throw new Error(`preflight_failed:${name}:${JSON.stringify({ status: pre.status ?? null, finishReason: pre.finishReason ?? null, reply: String(pre.reply ?? '').slice(-120) })}`);
  const partial = `${out}.partial.jsonl`;
  const key = (x) => `${x.arm}|${x.kind}|${x.id}`;
  const done = new Map(J(partial).map((r) => [key(r), r]));
  for (const it of items) {
    if (done.has(key(it))) continue;
    const p = englishPrompt(it.sentence, it.code);
    const { verdict: v, reply, status = null, finishReason = null, fromReasoning } = await ask(j, p, 'states');
    const row = { arm: it.arm, kind: it.kind, id: it.id, ...(it.mood ? { mood: it.mood } : {}), promptSha256: sha(p), states: v, reply, status, finishReason, ...(fromReasoning ? { fromReasoning } : {}) };
    fs.appendFileSync(partial, JSON.stringify(row) + '\n');
    done.set(key(row), row);
    console.log(JSON.stringify({ arm: row.arm, kind: row.kind, n: done.size, states: v }));
    if (j.gapMs) await sleep(j.gapMs);
  }
  const results = items.map((it) => done.get(key(it)));
  const summary = { judge: name, label: j.label, calibration: CALIBRATION_LABEL, calibrationR1: { kappa: cal.arms.r1.kappa, pass: true }, arms: summarizeJudge(results) };
  fs.writeFileSync(out, JSON.stringify({ summary, results }, null, 1) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}

function verdictMain(list) {
  const out = arg('--out'); if (!out) throw new Error('--out required');
  const files = list.split(',').map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  // The 48 records both coverage-a3-v2 strict judges rejected (its judge.mjs --agreement bothReject).
  const v2own = (f) => new Map(JSON.parse(fs.readFileSync(path.join(v2, f), 'utf8')).results.filter((r) => r.kind === 'own').map((r) => [r.id, r.states === true]));
  const luna = v2own('bar2/judgements-luna.json'); const nem = v2own('bar2/judgements-nemotron.json');
  const bothReject = [...luna.keys()].filter((k) => nem.has(k) && !luna.get(k) && !nem.get(k));
  const catFile = arg('--categories');
  const categories = catFile ? checkCategories(JSON.parse(fs.readFileSync(catFile, 'utf8')), bothReject) : null;
  const v2LunaRate = [...luna.values()].filter(Boolean).length / luna.size;
  const calibration = fs.readdirSync(path.join(here, 'calibration')).filter((f) => /^judge-[a-z0-9-]+\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(here, 'calibration', f), 'utf8')).summary).map((s) => ({ judge: s.judge, r1: s.arms?.r1 }));
  const v = verdict(files, { categories, v2LunaRate, calibration });
  v.jointlyRejectedV2 = bothReject.length;
  fs.writeFileSync(out, JSON.stringify(v, null, 1) + '\n');
  console.log(JSON.stringify({ calibration: v.calibration, bar1: v.bar1, renderEffect: v.attribution.renderEffect }, null, 2));
}

async function main() {
  if (arg('--verdict')) return verdictMain(arg('--verdict'));
  if (arg('--judge')) return judgeMain(arg('--judge'));
  throw new Error('usage: --judge <name> --out <file> | --verdict a.json,b.json --out <file> [--categories <file>]');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
