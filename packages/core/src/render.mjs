import { DEFAULT_RENDERER, ROLE_ORDER, WORLD_MARKERS } from './constants.mjs';
import { canonicalizeSem } from './canonicalize.mjs';

function termText(term) {
  if (term == null) return '';
  if (typeof term === 'string' || typeof term === 'number' || typeof term === 'boolean') return String(term);
  if (Array.isArray(term)) return term.map(termText).filter(Boolean).join('_');
  return String(term.id ?? term.value ?? term.ref ?? '').trim();
}

function orderedRoles(roles) {
  const rank = new Map(ROLE_ORDER.map((r, i) => [r, i]));
  return Object.entries(roles || {}).sort(([a], [b]) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999) || a.localeCompare(b));
}

function renderClause(clause) {
  const head = [clause.negated ? 'not' : '', clause.modality || '', clause.predicate].filter(Boolean);
  const values = orderedRoles(clause.roles).map(([, value]) => termText(value)).filter(Boolean);
  let text = [...head, ...values].join(' ');
  if (clause.conditions?.length) {
    const conditions = clause.conditions.map(renderClause).join(' ; ');
    const consequences = (clause.consequences || []).map(renderClause).join(' ; ');
    text = `if ${conditions}${consequences ? ` then ${consequences}` : ` then ${text}`}`;
  }
  return text;
}

export function renderSem(sem, { profile = DEFAULT_RENDERER } = {}) {
  if (profile !== DEFAULT_RENDERER) throw new Error(`Renderer profile not installed: ${profile}`);
  const canonical = canonicalizeSem(sem);
  const marker = WORLD_MARKERS[canonical.world] || canonical.world.slice(0, 1).toUpperCase();
  return {
    profile,
    code: `${marker} ${canonical.clauses.map(renderClause).join(' ; ')}`.trim(),
    semantic: true
  };
}
