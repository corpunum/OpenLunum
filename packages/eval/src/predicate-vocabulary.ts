/**
 * Compatibility view for older evaluator imports. The source of truth is the
 * model-independent protocol registry in @corpunum/lunum; this module is not
 * derived from any evaluation corpus.
 */
import { SEMANTIC_PROTOCOL_REGISTRY, protocolVocabularyBlock } from '@corpunum/lunum';

export const PREDICATES = SEMANTIC_PROTOCOL_REGISTRY.predicates;
export const PREDICATE_SET = new Set(PREDICATES);
export const ROLES = SEMANTIC_PROTOCOL_REGISTRY.roles;
export const ROLE_SET = new Set(ROLES);
/** Generic actor labels retained as open instance examples, not protocol ontology. */
export const IDENTIFIERS = Object.freeze(['assistant', 'system', 'user']);
export const IDENTIFIER_SET = new Set(IDENTIFIERS);
export const ROLE_TYPES = SEMANTIC_PROTOCOL_REGISTRY.termTypes;
export const ROLE_TYPE_SET = new Set(ROLE_TYPES);
export const MODALITY_VALUES = SEMANTIC_PROTOCOL_REGISTRY.modalities;
export const MODALITY_VALUE_SET = new Set(MODALITY_VALUES);
export function vocabularyBlock(): string { return protocolVocabularyBlock(); }
