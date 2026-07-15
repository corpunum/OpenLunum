export const SEM_SCHEMA = 'lunum-sem/0.1-draft';
export const RECORD_SCHEMA = 'lunum-record/0.1-draft';
export const FP_VERSION = '0.1';
export const DEFAULT_RENDERER = 'safe/generic/0.1';

export const WORLD_MARKERS = Object.freeze({
  real: 'R', fiction: 'F', tool: 'T', dream: 'D', belief: 'B', metaphor: 'M'
});

export const ROLE_ORDER = Object.freeze([
  'agent', 'experiencer', 'subject', 'actor', 'recipient', 'object', 'theme', 'patient',
  'target', 'source', 'destination', 'location', 'time', 'manner', 'value', 'reason', 'evidence'
]);
