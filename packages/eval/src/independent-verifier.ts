import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalizeSem, stableStringify } from '@corpunum/lunum';
import { fingerprintSem, surfaceFingerprint } from '@corpunum/lunum';

export const VERIFIER_VERSION = '0.1.0' as const;

export interface GoldenVector {
  id: string;
  input: unknown;
  canonicalBytes: string;
  canonicalSha256: string;
  fingerprint: string;
  surfaceText?: string;
  surfaceFingerprint?: string;
}

export interface GoldenVectorBundle {
  schema: 'openlunum-golden-vectors/0.1';
  version: typeof VERIFIER_VERSION;
  generatedAt: string;
  generatorCommit: string;
  fpVersion: string;
  semSchema: string;
  vectors: GoldenVector[];
}

export interface VerifierResult {
  schema: 'openlunum-verifier-result/0.1';
  version: typeof VERIFIER_VERSION;
  verifiedAt: string;
  totalVectors: number;
  passCount: number;
  failCount: number;
  discrepancies: VerifierDiscrepancy[];
}

export interface VerifierDiscrepancy {
  vectorId: string;
  field: 'canonicalBytes' | 'canonicalSha256' | 'fingerprint' | 'surfaceFingerprint';
  expected: string;
  actual: string;
}

function makeSem(world: string, kind: string, predicate: string, roles: Record<string, unknown>, extras?: Record<string, unknown>): unknown {
  return {
    schema: 'lunum-sem/0.1-draft',
    world,
    kind,
    clauses: [{ predicate, roles, negated: false, ...extras }],
  };
}

function makeComplex(overrides: Record<string, unknown>): unknown {
  return {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'statement',
    clauses: [{
      predicate: 'test',
      roles: { agent: { type: 'actor', id: 'user' } },
      negated: false,
    }],
    ...overrides,
  };
}

function generateTestInputs(): { id: string; input: unknown; surfaceText?: string }[] {
  const inputs: { id: string; input: unknown; surfaceText?: string }[] = [];

  // Basic preference patterns
  const preferences = ['dark_mode', 'light_mode', 'high_contrast', 'compact_view', 'notifications_off'];
  for (const pref of preferences) {
    inputs.push({
      id: `pref-${pref}`,
      input: makeSem('real', 'preference', 'prefer', {
        experiencer: { type: 'actor', id: 'user' },
        theme: { type: 'concept', id: pref },
      }),
    });
  }

  // Multilingual text values (exercises NFKC normalization)
  const texts: [string, string][] = [
    ['en', 'Hello world'],
    ['el', 'Καλημέρα κόσμε'],
    ['ja', 'こんにちは世界'],
    ['ar', 'مرحبا بالعالم'],
    ['zh', '你好世界'],
    ['ko', '안녕하세요 세계'],
    ['de', 'Über das Gelände'],
    ['fr', 'Café crème'],
    ['es', 'El niño pequeño'],
    ['ru', 'Привет мир'],
  ];
  for (const [lang, text] of texts) {
    inputs.push({
      id: `lang-${lang}`,
      input: makeSem('real', 'statement', 'express', {
        speaker: { type: 'actor', id: 'user' },
        content: { type: 'literal', value: text, language: lang },
      }),
      surfaceText: text,
    });
  }

  // Negation variants
  for (const negated of [false, true]) {
    inputs.push({
      id: `neg-${negated ? 'true' : 'false'}`,
      input: {
        schema: 'lunum-sem/0.1-draft',
        world: 'real',
        kind: 'preference',
        clauses: [{
          predicate: 'prefer',
          roles: { experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'feature_x' } },
          negated,
        }],
      },
    });
  }

  // Multiple clauses
  inputs.push({
    id: 'multi-clause-2',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'compound',
      clauses: [
        { predicate: 'prefer', roles: { theme: { type: 'concept', id: 'dark_mode' } }, negated: false },
        { predicate: 'use', roles: { instrument: { type: 'tool', id: 'keyboard' } }, negated: false },
      ],
    },
  });

  inputs.push({
    id: 'multi-clause-3',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'compound',
      clauses: [
        { predicate: 'read', roles: { agent: { type: 'actor', id: 'user' }, theme: { type: 'document', id: 'report' } }, negated: false },
        { predicate: 'review', roles: { agent: { type: 'actor', id: 'reviewer' }, theme: { type: 'document', id: 'report' } }, negated: false },
        { predicate: 'approve', roles: { agent: { type: 'actor', id: 'manager' }, theme: { type: 'document', id: 'report' } }, negated: false },
      ],
    },
  });

  // Whitespace normalization edge cases
  inputs.push({
    id: 'ws-tabs',
    input: makeSem('real', 'statement', 'say', {
      content: { type: 'literal', value: 'hello\t\tworld\t\t!', language: 'en' },
    }),
    surfaceText: 'hello\t\tworld\t\t!',
  });
  inputs.push({
    id: 'ws-newlines',
    input: makeSem('real', 'statement', 'say', {
      content: { type: 'literal', value: 'line1\n\nline2\n\nline3', language: 'en' },
    }),
    surfaceText: 'line1\n\nline2\n\nline3',
  });
  inputs.push({
    id: 'ws-mixed',
    input: makeSem('real', 'statement', 'say', {
      content: { type: 'literal', value: '  mixed \t spaces \n and \r\n newlines  ', language: 'en' },
    }),
    surfaceText: '  mixed \t spaces \n and \r\n newlines  ',
  });

  // Case normalization for identifiers
  inputs.push({
    id: 'case-upper',
    input: makeSem('real', 'preference', 'PREFER', {
      experiencer: { type: 'ACTOR', id: 'USER' },
      theme: { type: 'CONCEPT', id: 'DARK_MODE' },
    }),
  });
  inputs.push({
    id: 'case-mixed',
    input: makeSem('real', 'preference', 'PrEfEr', {
      experiencer: { type: 'AcToR', id: 'UsEr' },
      theme: { type: 'CoNcEpT', id: 'DaRk_MoDe' },
    }),
  });

  // Modality
  inputs.push({
    id: 'modality-might',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'hypothetical',
      kind: 'speculation',
      clauses: [{
        predicate: 'cause',
        roles: { agent: { type: 'event', id: 'storm' }, patient: { type: 'state', id: 'outage' } },
        negated: false,
        modality: 'might',
      }],
    },
  });

  // Time field
  inputs.push({
    id: 'time-simple',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'event',
      clauses: [{
        predicate: 'occur',
        roles: { theme: { type: 'event', id: 'meeting' } },
        negated: false,
        time: { type: 'temporal', id: '2026-01-15' },
      }],
    },
  });

  // Conditions and consequences
  inputs.push({
    id: 'conditional',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'hypothetical',
      kind: 'rule',
      clauses: [{
        predicate: 'trigger',
        roles: { agent: { type: 'system', id: 'alarm' } },
        negated: false,
        conditions: [{ predicate: 'exceed', roles: { theme: { type: 'metric', id: 'temperature' }, threshold: { type: 'value', value: 90 } }, negated: false }],
        consequences: [{ predicate: 'alert', roles: { recipient: { type: 'actor', id: 'operator' } }, negated: false }],
      }],
    },
  });

  // Annotations
  inputs.push({
    id: 'annotations-basic',
    input: makeComplex({
      annotations: { source: 'test', confidence: 0.95, tags: ['a', 'b', 'c'] },
    }),
  });

  // Provenance
  inputs.push({
    id: 'provenance-basic',
    input: makeComplex({
      provenance: { tool: 'unit-test', version: '1.0', timestamp: '2026-01-01T00:00:00Z' },
    }),
  });

  // References
  inputs.push({
    id: 'references-basic',
    input: makeComplex({
      references: [
        { type: 'document', id: 'doc-001', ref: 'https://example.com/doc' },
        { type: 'actor', id: 'author-001' },
      ],
    }),
  });

  // Unicode normalization: composed vs decomposed
  inputs.push({
    id: 'unicode-composed',
    input: makeSem('real', 'statement', 'say', {
      content: { type: 'literal', value: 'éèêë', language: 'fr' },
    }),
    surfaceText: 'éèêë',
  });
  inputs.push({
    id: 'unicode-decomposed',
    input: makeSem('real', 'statement', 'say', {
      content: { type: 'literal', value: 'éèêë', language: 'fr' },
    }),
    surfaceText: 'éèêë',
  });

  // Fullwidth characters (NFKC folds these)
  inputs.push({
    id: 'unicode-fullwidth',
    input: makeSem('real', 'statement', 'say', {
      content: { type: 'literal', value: 'Ｈｅｌｌｏ', language: 'en' },
    }),
    surfaceText: 'Ｈｅｌｌｏ',
  });

  // Empty-ish values
  inputs.push({
    id: 'empty-string-value',
    input: makeSem('real', 'statement', 'describe', {
      content: { type: 'literal', value: '', language: 'en' },
    }),
  });

  // Numeric and boolean term values
  inputs.push({
    id: 'numeric-value',
    input: makeSem('real', 'measurement', 'measure', {
      instrument: { type: 'sensor', id: 'thermometer' },
      result: 42.5,
    }),
  });
  inputs.push({
    id: 'boolean-value',
    input: makeSem('real', 'state', 'is', {
      subject: { type: 'system', id: 'server' },
      property: true,
    }),
  });
  inputs.push({
    id: 'null-value',
    input: makeSem('real', 'state', 'is', {
      subject: { type: 'system', id: 'server' },
      property: null,
    }),
  });

  // Deeply nested annotations
  inputs.push({
    id: 'deep-nesting',
    input: makeComplex({
      annotations: {
        level1: {
          level2: {
            level3: {
              value: 'deep',
              count: 3,
            },
          },
        },
      },
    }),
  });

  // Multiple roles with sorted key order
  inputs.push({
    id: 'role-ordering',
    input: makeSem('real', 'action', 'transfer', {
      zebra: { type: 'actor', id: 'z-user' },
      alpha: { type: 'actor', id: 'a-user' },
      middle: { type: 'object', id: 'm-item' },
    }),
  });

  // World variants
  for (const world of ['real', 'hypothetical', 'fictional', 'simulated']) {
    inputs.push({
      id: `world-${world}`,
      input: makeSem(world, 'statement', 'assert', {
        agent: { type: 'actor', id: 'narrator' },
      }),
    });
  }

  // Kind variants
  for (const kind of ['preference', 'statement', 'question', 'command', 'exclamation']) {
    inputs.push({
      id: `kind-${kind}`,
      input: makeSem('real', kind, 'express', {
        speaker: { type: 'actor', id: 'user' },
      }),
    });
  }

  // Clause annotations
  inputs.push({
    id: 'clause-annotations',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [{
        predicate: 'claim',
        roles: { agent: { type: 'actor', id: 'user' } },
        negated: false,
        annotations: { confidence: 0.8, source: 'inference' },
      }],
    },
  });

  // Complex multi-role multi-clause
  inputs.push({
    id: 'complex-multi',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'narrative',
      clauses: [
        {
          predicate: 'observe',
          roles: {
            observer: { type: 'actor', id: 'scientist' },
            phenomenon: { type: 'event', id: 'eclipse' },
            location: { type: 'place', id: 'observatory' },
          },
          negated: false,
        },
        {
          predicate: 'record',
          roles: {
            agent: { type: 'actor', id: 'scientist' },
            data: { type: 'dataset', id: 'measurements' },
          },
          negated: false,
          time: { type: 'temporal', id: '2026-03-15T14:30:00Z' },
        },
      ],
      provenance: { method: 'direct_observation', instrument: 'telescope_4m' },
      annotations: { priority: 'high', reviewed: true },
    },
  });

  // Special characters in identifiers
  inputs.push({
    id: 'special-chars-id',
    input: makeSem('real', 'statement', 'describe', {
      subject: { type: 'entity', id: 'item with spaces' },
    }),
  });

  // Array term values
  inputs.push({
    id: 'array-term',
    input: makeSem('real', 'collection', 'list', {
      items: [{ type: 'item', id: 'a' }, { type: 'item', id: 'b' }, { type: 'item', id: 'c' }],
    }),
  });

  // Extra unknown fields on terms (should be preserved via canonicalUnknown)
  inputs.push({
    id: 'extra-term-fields',
    input: makeSem('real', 'statement', 'describe', {
      subject: { type: 'entity', id: 'thing', customProp: 'custom_value', count: 7 },
    }),
  });

  // Combinatorial: predicate × role count
  const predicates = ['buy', 'sell', 'give', 'take', 'send', 'receive', 'create', 'delete', 'move', 'copy'];
  for (const pred of predicates) {
    inputs.push({
      id: `pred-${pred}-1role`,
      input: makeSem('real', 'action', pred, {
        agent: { type: 'actor', id: 'user' },
      }),
    });
    inputs.push({
      id: `pred-${pred}-2role`,
      input: makeSem('real', 'action', pred, {
        agent: { type: 'actor', id: 'user' },
        patient: { type: 'object', id: `item_${pred}` },
      }),
    });
  }

  // Nested conditions depth variants
  inputs.push({
    id: 'nested-cond-2',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'hypothetical',
      kind: 'rule',
      clauses: [{
        predicate: 'trigger',
        roles: { agent: { type: 'system', id: 'monitor' } },
        negated: false,
        conditions: [{
          predicate: 'detect',
          roles: { theme: { type: 'signal', id: 'anomaly' } },
          negated: false,
          conditions: [{
            predicate: 'exceed',
            roles: { metric: { type: 'measure', id: 'cpu' }, limit: 95 },
            negated: false,
          }],
        }],
      }],
    },
  });

  // Mixed negation in multi-clause
  inputs.push({
    id: 'mixed-negation',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'compound',
      clauses: [
        { predicate: 'like', roles: { theme: { type: 'concept', id: 'coffee' } }, negated: false },
        { predicate: 'like', roles: { theme: { type: 'concept', id: 'tea' } }, negated: true },
        { predicate: 'prefer', roles: { theme: { type: 'concept', id: 'water' } }, negated: false },
      ],
    },
  });

  // Surface text edge cases
  const surfaceEdgeCases: [string, string][] = [
    ['surface-empty', ''],
    ['surface-single-char', 'x'],
    ['surface-digits', '12345'],
    ['surface-punctuation', '!@#$%^&*()'],
    ['surface-emoji', '😀🎉🚀'],
    ['surface-long', 'a'.repeat(1000)],
    ['surface-unicode-math', '∑∫∂∇'],
    ['surface-cjk-mix', 'Hello你好こんにちは'],
  ];
  for (const [id, text] of surfaceEdgeCases) {
    inputs.push({
      id,
      input: makeSem('real', 'statement', 'say', {
        content: { type: 'literal', value: text, language: 'und' },
      }),
      surfaceText: text,
    });
  }

  // Ref field on terms
  inputs.push({
    id: 'term-ref',
    input: makeSem('real', 'reference', 'cite', {
      source: { type: 'document', id: 'paper-001', ref: 'https://example.com/paper' },
    }),
  });

  // Multiple references at top level
  inputs.push({
    id: 'multi-refs',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'citation',
      clauses: [{ predicate: 'cite', roles: { agent: { type: 'actor', id: 'author' } }, negated: false }],
      references: [
        { type: 'source', id: 'ref-a', ref: 'urn:isbn:123' },
        { type: 'source', id: 'ref-b', ref: 'urn:isbn:456' },
        { type: 'source', id: 'ref-c', ref: 'urn:isbn:789' },
      ],
    },
  });

  // Consequences chain
  inputs.push({
    id: 'consequence-chain',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'hypothetical',
      kind: 'causal',
      clauses: [{
        predicate: 'cause',
        roles: { agent: { type: 'event', id: 'rainfall' } },
        negated: false,
        consequences: [
          { predicate: 'flood', roles: { location: { type: 'place', id: 'valley' } }, negated: false },
          { predicate: 'evacuate', roles: { patient: { type: 'group', id: 'residents' } }, negated: false },
        ],
      }],
    },
  });

  // Type/id with NFKC-collapsible chars (e.g., ligatures)
  inputs.push({
    id: 'nfkc-ligature',
    input: makeSem('real', 'statement', 'describe', {
      subject: { type: 'entity', id: 'ﬁnd' }, // ﬁnd → find under NFKC
    }),
  });

  // Numeric edge: zero, negative, float precision
  inputs.push({
    id: 'num-zero',
    input: makeSem('real', 'measurement', 'measure', { result: 0 }),
  });
  inputs.push({
    id: 'num-negative',
    input: makeSem('real', 'measurement', 'measure', { result: -42 }),
  });
  inputs.push({
    id: 'num-float-precision',
    input: makeSem('real', 'measurement', 'measure', { result: 0.1 + 0.2 }),
  });
  inputs.push({
    id: 'num-large',
    input: makeSem('real', 'measurement', 'measure', { result: 999999999999 }),
  });

  // Boolean false at top level
  inputs.push({
    id: 'bool-false-term',
    input: makeSem('real', 'state', 'is', {
      subject: { type: 'flag', id: 'enabled' },
      value: false,
    }),
  });

  // Deeply nested array terms
  inputs.push({
    id: 'nested-array-terms',
    input: makeSem('real', 'collection', 'group', {
      items: [
        [{ type: 'item', id: 'a1' }, { type: 'item', id: 'a2' }],
        [{ type: 'item', id: 'b1' }],
      ],
    }),
  });

  // Empty annotations object (should be omitted in canonical form)
  inputs.push({
    id: 'empty-annotations',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'test', roles: { a: { type: 'x', id: 'y' } }, negated: false }],
      annotations: {},
    },
  });

  // Empty provenance (should be omitted)
  inputs.push({
    id: 'empty-provenance',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'test', roles: { a: { type: 'x', id: 'y' } }, negated: false }],
      provenance: {},
    },
  });

  // All modality variants
  for (const mod of ['must', 'should', 'might', 'can', 'will', 'would']) {
    inputs.push({
      id: `mod-${mod}`,
      input: {
        schema: 'lunum-sem/0.1-draft',
        world: 'hypothetical',
        kind: 'modal',
        clauses: [{
          predicate: 'happen',
          roles: { event: { type: 'event', id: 'change' } },
          negated: false,
          modality: mod,
        }],
      },
    });
  }

  return inputs;
}

export function generateGoldenVectors(commitHash: string): GoldenVectorBundle {
  const inputs = generateTestInputs();
  const vectors: GoldenVector[] = [];

  for (const { id, input, surfaceText } of inputs) {
    const canonical = canonicalizeSem(input);
    const canonicalBytes = stableStringify(canonical);
    const canonicalSha256 = createHash('sha256').update(canonicalBytes).digest('hex');
    const fp = fingerprintSem(input);

    const vector: GoldenVector = { id, input, canonicalBytes, canonicalSha256, fingerprint: fp };
    if (surfaceText != null) {
      vector.surfaceText = surfaceText;
      vector.surfaceFingerprint = surfaceFingerprint(surfaceText);
    }
    vectors.push(vector);
  }

  return {
    schema: 'openlunum-golden-vectors/0.1',
    version: VERIFIER_VERSION,
    generatedAt: new Date().toISOString(),
    generatorCommit: commitHash,
    fpVersion: '0.1',
    semSchema: 'lunum-sem/0.1-draft',
    vectors,
  };
}

export function validateGoldenVectorBundle(bundle: GoldenVectorBundle): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (bundle.schema !== 'openlunum-golden-vectors/0.1') errors.push('invalid schema');
  if (bundle.vectors.length < 100) errors.push(`need >=100 vectors, got ${bundle.vectors.length}`);
  const ids = new Set<string>();
  for (const v of bundle.vectors) {
    if (ids.has(v.id)) errors.push(`duplicate id: ${v.id}`);
    ids.add(v.id);
    if (!v.canonicalBytes) errors.push(`${v.id}: empty canonicalBytes`);
    if (!/^[a-f0-9]{64}$/u.test(v.canonicalSha256)) errors.push(`${v.id}: invalid sha256`);
    if (!/^lfp:0\.1:sha256:[a-f0-9]+$/u.test(v.fingerprint)) errors.push(`${v.id}: invalid fingerprint format`);
  }
  return { ok: errors.length === 0, errors };
}

export function crossVerifyVector(vector: GoldenVector): VerifierDiscrepancy[] {
  const discrepancies: VerifierDiscrepancy[] = [];
  const canonical = canonicalizeSem(vector.input);
  const actualBytes = stableStringify(canonical);
  const actualSha256 = createHash('sha256').update(actualBytes).digest('hex');
  const actualFp = fingerprintSem(vector.input);

  if (actualBytes !== vector.canonicalBytes) {
    discrepancies.push({ vectorId: vector.id, field: 'canonicalBytes', expected: vector.canonicalBytes, actual: actualBytes });
  }
  if (actualSha256 !== vector.canonicalSha256) {
    discrepancies.push({ vectorId: vector.id, field: 'canonicalSha256', expected: vector.canonicalSha256, actual: actualSha256 });
  }
  if (actualFp !== vector.fingerprint) {
    discrepancies.push({ vectorId: vector.id, field: 'fingerprint', expected: vector.fingerprint, actual: actualFp });
  }
  if (vector.surfaceText != null && vector.surfaceFingerprint != null) {
    const actualSfp = surfaceFingerprint(vector.surfaceText);
    if (actualSfp !== vector.surfaceFingerprint) {
      discrepancies.push({ vectorId: vector.id, field: 'surfaceFingerprint', expected: vector.surfaceFingerprint, actual: actualSfp });
    }
  }
  return discrepancies;
}

export function verifyBundle(bundle: GoldenVectorBundle): VerifierResult {
  const discrepancies: VerifierDiscrepancy[] = [];
  for (const v of bundle.vectors) {
    discrepancies.push(...crossVerifyVector(v));
  }
  return {
    schema: 'openlunum-verifier-result/0.1',
    version: VERIFIER_VERSION,
    verifiedAt: new Date().toISOString(),
    totalVectors: bundle.vectors.length,
    passCount: bundle.vectors.length - new Set(discrepancies.map(d => d.vectorId)).size,
    failCount: new Set(discrepancies.map(d => d.vectorId)).size,
    discrepancies,
  };
}
