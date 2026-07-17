/**
 * Expanded typed structures for time, quantity, uncertainty, reference, and modality
 */

// ── Time Structures ────────────────────────────────────────────────

export type TimeQualifier = 'exact' | 'approximate' | 'range' | 'relative' | 'event-based';
export type TimePrecision = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year' | 'decade' | 'century' | 'millennium';

export interface TimeValue {
  /** ISO 8601 datetime string */
  datetime?: string;
  /** Date component */
  date?: string;
  /** Time component */
  time?: string;
  /** Timezone offset */
  timezone?: string;
  /** Calendar system */
  calendar?: string;
  /** Human-readable text */
  text?: string;
}

export interface TimeRange {
  /** Start time */
  start: TimeValue;
  /** End time */
  end: TimeValue;
  /** Duration in ISO 8601 format */
  duration?: string;
}

export interface RelativeTime {
  /** Reference point */
  reference: TimeValue;
  /** Offset from reference */
  offset: string;
  /** Direction */
  direction: 'before' | 'after';
}

export interface EventTime {
  /** Event description */
  event: string;
  /** Relationship to event */
  relationship: 'before' | 'after' | 'during' | 'at';
}

export interface TypedTime {
  /** Time qualifier */
  qualifier: TimeQualifier;
  /** Time precision */
  precision?: TimePrecision;
  /** Absolute time value */
  value?: TimeValue;
  /** Time range */
  range?: TimeRange;
  /** Relative time */
  relative?: RelativeTime;
  /** Event-based time */
  event?: EventTime;
  /** Human-readable text */
  text?: string;
}

// ── Quantity Structures ────────────────────────────────────────────

export type QuantityUnit = 'number' | 'percentage' | 'ratio' | 'currency' | 'unit' | 'count';
export type QuantityPrecision = 'exact' | 'approximate' | 'estimated' | 'minimum' | 'maximum';

export interface QuantityValue {
  /** Numeric value */
  value: number;
  /** Unit of measurement */
  unit?: string;
  /** Currency code (ISO 4217) */
  currency?: string;
  /** Human-readable text */
  text?: string;
}

export interface QuantityRange {
  /** Minimum value */
  min: QuantityValue;
  /** Maximum value */
  max: QuantityValue;
}

export interface TypedQuantity {
  /** Quantity type */
  type: QuantityUnit;
  /** Precision type */
  precision: QuantityPrecision;
  /** Single value */
  value?: QuantityValue;
  /** Range of values */
  range?: QuantityRange;
  /** Human-readable text */
  text?: string;
}

// ── Uncertainty Structures ─────────────────────────────────────────

export type UncertaintyType = 'confidence' | 'probability' | 'likelihood' | 'risk' | 'variance';
export type UncertaintySource = 'measurement' | 'estimation' | 'inference' | 'model' | 'human';

export interface UncertaintyValue {
  /** Numeric value (0-1 for probability/confidence) */
  value: number;
  /** Type of uncertainty */
  type: UncertaintyType;
  /** Source of uncertainty */
  source?: UncertaintySource;
  /** Confidence interval */
  confidenceInterval?: {
    lower: number;
    upper: number;
  };
  /** Human-readable text */
  text?: string;
}

export interface TypedUncertainty {
  /** Uncertainty type */
  type: UncertaintyType;
  /** Primary uncertainty value */
  value: UncertaintyValue;
  /** Secondary uncertainty values */
  alternatives?: UncertaintyValue[];
  /** Human-readable text */
  text?: string;
}

// ── Reference Structures ───────────────────────────────────────────

export type ReferenceType = 'url' | 'doi' | 'isbn' | 'pmid' | 'identifier' | 'local' | 'cross-ref';

export interface ReferenceValue {
  /** Reference type */
  type: ReferenceType;
  /** Reference identifier */
  id: string;
  /** URL if applicable */
  url?: string;
  /** Title */
  title?: string;
  /** Authors */
  authors?: string[];
  /** Publication date */
  date?: string;
  /** Publisher */
  publisher?: string;
  /** Version */
  version?: string;
  /** Access date */
  accessDate?: string;
}

export interface CrossReference {
  /** Target record ID */
  targetId: string;
  /** Relationship type */
  relationship: 'supports' | 'contradicts' | 'relates' | 'extends' | 'references';
  /** Confidence in relationship */
  confidence?: number;
}

export interface TypedReference {
  /** Reference type */
  type: ReferenceType;
  /** Reference value */
  value: ReferenceValue;
  /** Cross-reference */
  crossRef?: CrossReference;
  /** Human-readable text */
  text?: string;
}

// ── Modality Structures ────────────────────────────────────────────

export type ModalityType = 'fact' | 'opinion' | 'belief' | 'possibility' | 'necessity' | 'obligation' | 'permission' | 'ability' | 'intention' | 'certainty';
export type ModalitySource = 'direct' | 'reported' | 'inferred' | 'observed' | 'assumed';

export interface ModalityValue {
  /** Modality type */
  type: ModalityType;
  /** Source of modality */
  source?: ModalitySource;
  /** Strength (0-1) */
  strength?: number;
  /** Certainty level */
  certainty?: 'certain' | 'likely' | 'possible' | 'unlikely' | 'impossible';
  /** Human-readable text */
  text?: string;
}

export interface TypedModality {
  /** Modality type */
  type: ModalityType;
  /** Primary modality value */
  value: ModalityValue;
  /** Alternative modalities */
  alternatives?: ModalityValue[];
  /** Human-readable text */
  text?: string;
}

// ── Integration with LunumClause ───────────────────────────────────

export interface ExtendedLunumClause extends Omit<LunumClause, 'time' | 'modality'> {
  /** Extended time structure */
  time?: TypedTime;
  /** Extended modality structure */
  modality?: TypedModality;
  /** Quantity information */
  quantity?: TypedQuantity;
  /** Uncertainty information */
  uncertainty?: TypedUncertainty;
  /** Reference information */
  reference?: TypedReference;
}

// ── Export ─────────────────────────────────────────────────────────

export const typedStructuresExports = [
  // Time
  'TimeQualifier',
  'TimePrecision',
  'TimeValue',
  'TimeRange',
  'RelativeTime',
  'EventTime',
  'TypedTime',
  // Quantity
  'QuantityUnit',
  'QuantityPrecision',
  'QuantityValue',
  'QuantityRange',
  'TypedQuantity',
  // Uncertainty
  'UncertaintyType',
  'UncertaintySource',
  'UncertaintyValue',
  'TypedUncertainty',
  // Reference
  'ReferenceType',
  'ReferenceValue',
  'CrossReference',
  'TypedReference',
  // Modality
  'ModalityType',
  'ModalitySource',
  'ModalityValue',
  'TypedModality',
  // Integration
  'ExtendedLunumClause'
] as const;