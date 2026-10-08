export type {
  ExistsResult, ExistsStatus, LocatedSpan, NearDuplicateCandidate, NearDuplicateOptions, Reference, ReferenceKind,
  SourceLocation, SourceLocator,
} from './types.js';
export { extractReferences, distinctReferences, FILE_EXTENSIONS, REFERENCE_EXTRACTOR_VERSION } from './references.js';
export type { ExtractReferencesOptions } from './references.js';
export { jaccard, normaliseForTrigrams, TrigramIndex, trigramSet } from './trigram.js';
export type { TrigramCandidate } from './trigram.js';
export { groundDiscourse, groundText, nearDuplicateUnits, SOURCE_GROUNDING_VERSION } from './ground.js';
export type {
  GroundedReference, GroundingReport, GroundingStatus, GroundOptions, NearDuplicatePair, NearDuplicateUnitOptions, UnitRef,
} from './ground.js';
export { InMemoryLocator } from './memory.js';
export type { MemoryDocument } from './memory.js';
export { DEFAULT_UNUMSEARCH_URL, rootsFromUnits, UnumsearchLocator } from './unumsearch.js';
export type { UnumsearchLocatorOptions, UnumsearchTransport } from './unumsearch.js';
