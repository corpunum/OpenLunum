export const SEM_SCHEMA = 'lunum-sem/0.1-draft' as const;
export const SEM_SCHEMA_02 = 'lunum-sem/0.2' as const;
export const RECORD_SCHEMA = 'lunum-record/0.1-draft' as const;
export const RECORD_SCHEMA_02 = 'lunum-record/0.2' as const;
export const FP_VERSION = '0.1' as const;
export const FP_VERSION_02 = '0.2' as const;
export const DEFAULT_RENDERER = 'generic-en-pivot/0.1' as const;

export const WORLD_MARKERS: Readonly<Record<string, string>> = Object.freeze({
  real: 'R', fiction: 'F', tool: 'T', dream: 'D', belief: 'B', metaphor: 'M'
});

export const ROLE_ORDER: readonly string[] = Object.freeze([
  'agent', 'experiencer', 'subject', 'actor', 'recipient', 'object', 'theme', 'patient',
  'target', 'source', 'destination', 'location', 'time', 'manner', 'value', 'reason', 'evidence'
]);

/** All frozen schema versions — field names are locked for these versions. */
export const FROZEN_SCHEMAS: ReadonlySet<string> = Object.freeze(new Set([
  SEM_SCHEMA_02,
  RECORD_SCHEMA_02
]));
