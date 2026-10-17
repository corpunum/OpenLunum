// Candidate identity projections (not a core change, not an identity version). v1 is ADR 0027's candidate,
// copied unchanged from experiments/identity-projection-candidate-v1/measure.mjs. v2 adds, in order:
//   strip: leading English free words (ADR 0024's articles and prepositions) are removed from every
//          non-literal filler string, so "a pediatrician" = "pediatrician", "in the next room" = "the next room" = "next room";
//   fold:  the two copular general frames are one class: define -> describe, definition -> attribute.
import { createHash } from 'node:crypto';
import { stableStringify } from '../../packages/core/dist/src/index.js';

const LITERAL_TYPES = new Set(['quantity', 'date', 'time', 'duration', 'percent', 'money']);
const LEADING_FREE = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'by', 'for', 'from', 'to', 'with', 'as']);
const fold = (s) => String(s).normalize('NFKC').toLocaleLowerCase('und').replace(/_/gu, ' ').replace(/\s+/gu, ' ').trim();
function strip(s) {
  const w = s.split(' ');
  let i = 0; while (i < w.length - 1 && LEADING_FREE.has(w[i])) i += 1; // keep at least one word
  return w.slice(i).join(' ');
}
const DIRECTIVE = new Set(['command', 'instruction', 'plan_instruction', 'conditional_instruction', 'safety_constraint']);
const ASSERTIVE = new Set(['simple_fact', 'event', 'observation', 'project_state']);
const mood = (kind) => DIRECTIVE.has(kind) ? 'directive' : ASSERTIVE.has(kind) ? 'assertive' : kind;

export function makeProjection({ stripLeading = false, foldCopular = false } = {}) {
  const text = (s) => (stripLeading ? strip(fold(s)) : fold(s));
  function term(t) {
    if (t === null || t === undefined) return t;
    if (typeof t === 'string') return { v: text(t) };
    if (typeof t !== 'object') return t;
    if (Array.isArray(t)) return t.map(term);
    const out = {};
    const key = t.id ?? t.value ?? t.ref;
    if (LITERAL_TYPES.has(t.type)) { out.t = t.type; if (t.value !== undefined) out.v = typeof t.value === 'string' ? fold(t.value) : t.value; if (t.unit) out.u = fold(t.unit); if (t.format) out.f = t.format; return out; }
    if (key !== undefined) out.v = typeof key === 'string' ? text(key) : key;
    for (const [k, v] of Object.entries(t)) if (!['id', 'value', 'ref', 'type', 'language', 'surface', 'span', 'sourceSpan', 'provenance', 'annotations'].includes(k)) out[k] = term(v);
    return out;
  }
  function clause(c) {
    let p = c.predicate; let roles = c.roles ?? {};
    if (foldCopular && p === 'define') { p = 'describe'; roles = Object.fromEntries(Object.entries(roles).map(([k, v]) => [k === 'definition' ? 'attribute' : k, v])); }
    return { p, n: c.negated === true, m: c.modality ?? null, time: term(c.time),
      r: Object.fromEntries(Object.keys(roles).sort().map((k) => [k, term(roles[k])])),
      if: (c.conditions ?? []).map(clause), then: (c.consequences ?? []).map(clause) };
  }
  return (sem) => 'cand:' + createHash('sha256').update(stableStringify({ w: sem.world, k: mood(sem.kind), c: sem.clauses.map(clause) })).digest('hex').slice(0, 32);
}
export const PROJECTIONS = Object.freeze({ v1: makeProjection(), v2strip: makeProjection({ stripLeading: true }), v2fold: makeProjection({ stripLeading: true, foldCopular: true }) });
