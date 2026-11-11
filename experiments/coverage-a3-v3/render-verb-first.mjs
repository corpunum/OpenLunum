#!/usr/bin/env node
// coverage-a3-v3 R1 arm: deterministic verb-first rewrite of a generic-en-pivot/0.3 render string.
// Rules: PREREGISTRATION.md "Arms". Offline, no model call.
// CLI: node render-verb-first.mjs < in.jsonl > out.jsonl  ({"handle","code"} -> {"handle","code","r1"})
import fs from 'node:fs';

// Modality word -> English auxiliary (Arms rule 2).
const AUX = { ability: 'can', must: 'must', intention: 'intends to', certainty: 'certainly', opinion: 'thinks' };
// The frozen 139 records use exactly these modality words (plus 'not'); anything else throws.
const MODALITIES = new Set(['not', ...Object.keys(AUX)]);
const ACTION_KEYS = ['action', 'relation', 'attribute']; // rule 1: the action slot is action, else relation, else attribute.

// One clause: [modality words] frame(args) [@time]. Records with several clauses
// join them with " ; " (1 of the 139); each clause is rewritten on its own.
// (Choice: the pre-registration does not mention multi-clause records; applying
// rules 1-3 per clause is the reading closest to its examples.)
function verbFirstClause(s, code) {
  // Optional @time suffix (rule 5: kept).
  let time = null;
  const at = s.indexOf(' @');
  if (at !== -1) { time = s.slice(at + 1); s = s.slice(0, at); }
  const m = /^([a-z]+(?: [a-z]+)*)\((.*)\)$/.exec(s);
  if (!m) throw new Error(`cannot parse: ${code}`);
  const words = m[1].split(' ');
  const frame = words.pop();
  const mods = words;
  if (mods.some((w) => !MODALITIES.has(w))) throw new Error(`unknown modality: ${code}`);
  // Choice: at most one non-not modality word; the observed data has only not + one.
  const nonNot = mods.filter((w) => w !== 'not');
  if (nonNot.length > 1) throw new Error(`two modalities: ${code}`);
  const negated = mods.includes('not');
  // Args: key=value separated by ", ". A value may itself contain ", " (e.g. the
  // vocative record "object=you, Tom"), so a piece that does not start with
  // "key=" is glued back onto the previous argument.
  const args = [];
  for (const piece of m[2] === '' ? [] : m[2].split(', ')) {
    if (/^[a-z_]+=/.test(piece)) args.push(piece);
    else if (args.length) args[args.length - 1] += `, ${piece}`;
    else throw new Error(`non-arg: ${code}`);
  }
  const key = (a) => a.slice(0, a.indexOf('='));
  // Rule 1: subject, then action/relation/attribute, then the rest in original order.
  const subject = args.filter((a) => key(a) === 'subject');
  const action = args.filter((a) => ACTION_KEYS.includes(key(a)));
  const rest = args.filter((a) => !subject.includes(a) && !action.includes(a));
  const ordered = [...subject, ...action, ...rest];
  // Choice: the auxiliary/not slot goes after the subject, immediately before the action slot;
  // when there is no action slot, it sits at the first role position (after the subject).
  const slot = nonNot.length ? AUX[nonNot[0]] + (negated ? ' not' : '') : negated ? 'not' : null;
  const outArgs = [...ordered];
  if (slot) outArgs.splice(subject.length, 0, slot);
  return `${frame}(${outArgs.join(', ')})` + (time ? ` ${time}` : '');
}

export function verbFirst(code) {
  let s = code.trim();
  const label = s.startsWith('R ') ? 'R' : s.startsWith('M ') ? 'M' : null;
  if (!label) throw new Error(`no frame label: ${code}`);
  s = s.slice(2);
  // Optional question prefix and trailing ? (rule 4: kept).
  const question = s.startsWith('question: ');
  if (question) {
    s = s.slice('question: '.length);
    if (!s.endsWith('?')) throw new Error(`question without ?: ${code}`);
    s = s.slice(0, -1);
  }
  // Optional imperative prefix (rule 4: kept).
  const imperative = s.startsWith('imperative to you: ');
  if (imperative) s = s.slice('imperative to you: '.length);
  const clauses = s.split(' ; ').map((c) => verbFirstClause(c, code));
  let out = `${label} `;
  if (question) out += 'question: ';
  if (imperative) out += 'imperative to you: ';
  out += clauses.join(' ; ');
  if (question) out += '?';
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const line of fs.readFileSync(0, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const { handle, code } = JSON.parse(line);
    console.log(JSON.stringify({ handle, code, r1: verbFirst(code) }));
  }
}
