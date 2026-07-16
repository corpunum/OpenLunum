export const SEM_SCHEMA = 'lunum-sem/0.1-draft' as const;
export const RECORD_SCHEMA = 'lunum-record/0.1-draft' as const;
export const FP_VERSION = '0.1' as const;
export const DEFAULT_RENDERER = 'generic-en-pivot/0.1' as const;

export const WORLD_MARKERS: Readonly<Record<string, string>> = Object.freeze({
  real: 'R', fiction: 'F', tool: 'T', dream: 'D', belief: 'B', metaphor: 'M'
});

export const ROLE_ORDER = Object.freeze([
  'agent', 'experiencer', 'subject', 'actor', 'recipient', 'object', 'theme', 'patient',
  'target', 'source', 'destination', 'location', 'time', 'manner', 'value', 'reason', 'evidence'
] as const);
