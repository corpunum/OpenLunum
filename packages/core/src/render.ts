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

/**
 * generic-en-pivot/0.2: lossless variant (decisions/0009). 0.1 drops the root
 * action of a conditional, clause time, units and role names; 0.2 keeps them:
 *   R if below(subject=b-11, value=20 percent) then must enable(agent=s-11, theme=f-11) ; must send(...)
 */
export const LOSSLESS_RENDERER = 'generic-en-pivot/0.2' as const;
const MODALITY_WORDS: Readonly<Record<string, string>> = Object.freeze({ obligation: 'must', permission: 'may' });

function termTextV2(term: LunumTerm | undefined): string {
  if (term == null) return '';
  if (typeof term === 'string' || typeof term === 'number' || typeof term === 'boolean') return String(term);
  if (Array.isArray(term)) return `[${term.map(termTextV2).join(', ')}]`;
  const head = String(term.id ?? term.ref ?? term.value ?? '').trim();
  const unit = typeof term.unit === 'string' && term.id === undefined ? ` ${term.unit}` : '';
  return head ? `${head}${unit}` : String(term.type ?? '');
}

function renderClauseV2(clause: LunumClause): string {
  const modality = clause.modality ? (MODALITY_WORDS[clause.modality] ?? clause.modality) : '';
  const roles = orderedRoles(clause.roles).map(([role, value]) => `${role}=${termTextV2(value)}`).join(', ');
  const time = clause.time !== undefined ? ` @${termTextV2(clause.time)}` : '';
  const core = [clause.negated ? 'not' : '', modality, `${clause.predicate}(${roles})${time}`].filter(Boolean).join(' ');
  const consequences = (clause.consequences ?? []).map(renderClauseV2);
  if (!clause.conditions?.length) return [core, ...consequences].join(' ; ');
  return `if ${clause.conditions.map(renderClauseV2).join(' and ')} then ${[core, ...consequences].join(' ; ')}`;
}

export interface RenderResult {
  profile: string;
  code: string;
  semantic: true;
}

export function renderSem(sem: LunumSem, options: { profile?: string } = {}): RenderResult {
  const profile = options.profile ?? DEFAULT_RENDERER;
  if (profile !== DEFAULT_RENDERER && profile !== LOSSLESS_RENDERER) throw new Error(`Renderer profile not installed: ${profile}`);
  const canonical = canonicalizeSem(sem);
  const marker = WORLD_MARKERS[canonical.world] ?? canonical.world.slice(0, 1).toUpperCase();
  const render = profile === LOSSLESS_RENDERER ? renderClauseV2 : renderClause;
  return { profile, code: `${marker} ${canonical.clauses.map(render).join(' ; ')}`.trim(), semantic: true };
}
