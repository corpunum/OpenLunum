import { DEFAULT_RENDERER, ROLE_ORDER, WORLD_MARKERS } from './constants.js';
import { canonicalizeSem } from './canonicalize.js';
import type { LunumClause, LunumSem, LunumTerm } from './types.js';

function termText(term: LunumTerm | undefined): string {
  if (term == null) return '';
  if (typeof term === 'string' || typeof term === 'number' || typeof term === 'boolean') return String(term);
  if (Array.isArray(term)) return term.map(termText).filter(Boolean).join('_');
  return String(term.id ?? term.value ?? term.ref ?? '').trim();
}

function orderedRoles(roles: LunumClause['roles']): Array<[string, LunumTerm]> {
  const rank = new Map<string, number>(ROLE_ORDER.map((role, index) => [role, index]));
  return Object.entries(roles).sort(([a], [b]) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999) || a.localeCompare(b));
}

function renderClause(clause: LunumClause): string {
  const head = [clause.negated ? 'not' : '', clause.modality ?? '', clause.predicate].filter(Boolean);
  const values = orderedRoles(clause.roles).map(([, value]) => termText(value)).filter(Boolean);
  let text = [...head, ...values].join(' ');
  if (clause.conditions?.length) {
    const conditions = clause.conditions.map(renderClause).join(' ; ');
    const consequences = (clause.consequences ?? []).map(renderClause).join(' ; ');
    text = `if ${conditions}${consequences ? ` then ${consequences}` : ` then ${text}`}`;
  }
  return text;
}

export interface RenderResult {
  profile: string;
  code: string;
  semantic: true;
}

export function renderSem(sem: LunumSem, options: { profile?: string } = {}): RenderResult {
  const profile = options.profile ?? DEFAULT_RENDERER;
  if (profile !== DEFAULT_RENDERER) throw new Error(`Renderer profile not installed: ${profile}`);
  const canonical = canonicalizeSem(sem);
  const marker = WORLD_MARKERS[canonical.world] ?? canonical.world.slice(0, 1).toUpperCase();
  return { profile, code: `${marker} ${canonical.clauses.map(renderClause).join(' ; ')}`.trim(), semantic: true };
}
