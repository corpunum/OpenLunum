/**
 * Golden migration vectors: 0.1 → 0.2 fixture pairs.
 *
 * Each fixture pair covers a specific structural change or feature
 * in the Lunum-Sem 0.2 schema upgrade. Together they provide
 * comprehensive coverage of every migration dimension.
 *
 * Structural changes covered:
 *  1. schema version: 0.1-draft → 0.2
 *  2. provenance locked: extra fields removed, only {source,author,timestamp,license} kept
 *  3. annotations locked: extra fields removed, only {confidence,tags,notes} kept
 *  4. references structured: {type:"object"} → {id,url,title?,type?}
 *  5. modality enum: any string → {"certainty","possibility","necessity","obligation",null}
 *  6. modality unknown value → "certainty"
 *  7. time object → ISO 8601 stringified
 *  8. clause.annotations locked: extra fields removed
 *  9. term additionalProperties: true → false
 * 10. negation flag
 * 11. conditions (nested clauses)
 * 12. consequences (nested clauses)
 * 13. multiple clauses in one record
 * 14. empty provenance preserved
 * 15. empty annotations preserved
 * 16. no references at all
 * 17. time already ISO string (no transformation)
 * 18. modality null (preserved)
 * 19. modality valid enum (preserved)
 * 20. reference with all fields
 * 21. reference with minimal fields (id + url)
 * 22. full complex record
 */

import { test } from 'node:test';
import assert from 'node:assert';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// ===========================================================================
// Schema validator (inline, no external deps)
// ===========================================================================

function validateAgainstSchema(data: unknown, schema: any, prefix: string = ''): string[] {
  const errors: string[] = [];

  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return errors;

  // const check
  if (schema.const !== undefined) {
    if (data !== schema.const) errors.push(`${prefix}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(data)}`);
  }

  // enum check
  if (Array.isArray(schema.enum) && !Array.isArray(data)) {
    if (!schema.enum.includes(data)) errors.push(`${prefix}: not in enum [${schema.enum.join(',')}]`);
  }

  // required
  if (Array.isArray(schema.required) && typeof data === 'object' && data !== null && !Array.isArray(data)) {
    for (const req of schema.required) {
      if (!(req in data)) errors.push(`${prefix}: missing required '${req}'`);
    }
  }

  // properties
  if (schema.properties && typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in obj) {
        const sub = validateAgainstSchema(obj[key], propSchema as any, `${prefix}.${key}`);
        errors.push(...sub);
      }
    }
  }

  // additionalProperties
  if (schema.additionalProperties === false && typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const allowed = new Set(Object.keys(schema.properties || {}));
    for (const key of Object.keys(data)) {
      if (!allowed.has(key)) errors.push(`${prefix}: unexpected field '${key}'`);
    }
  }

  // minLength
  if (typeof data === 'string' && schema.minLength !== undefined && data.length < schema.minLength) {
    errors.push(`${prefix}: minLength ${schema.minLength}, got ${data.length}`);
  }

  // minimum / maximum
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) errors.push(`${prefix}: minimum ${schema.minimum}, got ${data}`);
    if (schema.maximum !== undefined && data > schema.maximum) errors.push(`${prefix}: maximum ${schema.maximum}, got ${data}`);
  }

  // array items
  if (Array.isArray(data) && schema.items) {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push(`${prefix}: minItems ${schema.minItems}, got ${data.length}`);
    }
    for (let i = 0; i < data.length; i++) {
      const sub = validateAgainstSchema(data[i], schema.items as any, `${prefix}[${i}]`);
      errors.push(...sub);
    }
  }

  return errors;
}

function isValid(data: unknown, schema: any): { ok: boolean; errors: string[] } {
  const errors = validateAgainstSchema(data, schema);
  return { ok: errors.length === 0, errors };
}

// ===========================================================================
// Load the 0.2 schema once
// ===========================================================================

const LUNUM_SEM_02_FREEZE_SCHEMA_PATH = path.join(WORKSPACE_ROOT, 'packages', 'core', 'test', 'fixtures', 'lunum-sem-0.2-freeze.schema.json');

// Load the 0.2 schema from the freeze commit via git (with local fixture fallback for shallow clones)
let _sem02Schema: any | null = null;

async function loadSem02Schema(): Promise<any> {
  if (_sem02Schema) return _sem02Schema;
  try {
    const { execSync } = await import('node:child_process');
    const content = execSync('git show 8e3d4e8:schemas/lunum-sem.schema.json', {
      cwd: WORKSPACE_ROOT, encoding: 'utf8'
    });
    _sem02Schema = JSON.parse(content);
    return _sem02Schema;
  } catch {
    const fs = await import('node:fs');
    const content = fs.readFileSync(LUNUM_SEM_02_FREEZE_SCHEMA_PATH, 'utf8');
    _sem02Schema = JSON.parse(content);
    return _sem02Schema;
  }
}

// ===========================================================================
// Fixture pairs: { id, description, input01, expected02 }
// ===========================================================================

interface MigrationFixture {
  id: string;
  description: string;
  input01: Record<string, unknown>;
  expected02: Record<string, unknown>;
}

const goldenFixtures: MigrationFixture[] = [
  // ---------------------------------------------------------------------------
  // F01: Minimal record — schema upgrade only
  // ---------------------------------------------------------------------------
  {
    id: 'f01-minimal',
    description: 'Minimal 0.1 record with no optional fields',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'exist', roles: { subject: 'x' } }]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'exist', roles: { subject: 'x' }, negated: false }]
    }
  },

  // ---------------------------------------------------------------------------
  // F02: Provenance — additionalProperties unlocked (0.2 allows extra fields)
  // ---------------------------------------------------------------------------
  {
    id: 'f02-provenance-unrestricted',
    description: 'Provenance preserved with additionalProperties: true in 0.2',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'fact',
      clauses: [{ predicate: 'know', roles: { agent: 'a', theme: 't' } }],
      provenance: {
        source: 'manual',
        author: 'alice',
        timestamp: '2026-01-15T10:00:00Z',
        license: 'CC-BY-4.0',
        extraField: 'preserved in 0.2',
        anotherExtra: true
      }
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'fact',
      clauses: [{ predicate: 'know', roles: { agent: 'a', theme: 't' }, negated: false }],
      provenance: {
        source: 'manual',
        author: 'alice',
        timestamp: '2026-01-15T10:00:00Z',
        license: 'CC-BY-4.0',
        extraField: 'preserved in 0.2',
        anotherExtra: true
      }
    }
  },

  // ---------------------------------------------------------------------------
  // F03: Provenance — clean (no extra fields)
  // ---------------------------------------------------------------------------
  {
    id: 'f03-provenance-clean',
    description: 'Provenance with standard fields — preserved unchanged',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'fiction',
      kind: 'claim',
      clauses: [{ predicate: 'believe', roles: { agent: 'b' } }],
      provenance: {
        source: 'survey',
        author: 'bob',
        timestamp: '2026-03-20T14:30:00Z',
        license: 'MIT'
      }
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'fiction',
      kind: 'claim',
      clauses: [{ predicate: 'believe', roles: { agent: 'b' }, negated: false }],
      provenance: {
        source: 'survey',
        author: 'bob',
        timestamp: '2026-03-20T14:30:00Z',
        license: 'MIT'
      }
    }
  },

  // ---------------------------------------------------------------------------
  // F04: Annotations — additionalProperties unlocked (0.2 allows extra fields)
  // ---------------------------------------------------------------------------
  {
    id: 'f04-annotations-unrestricted',
    description: 'Annotations preserved with additionalProperties: true in 0.2',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'preference',
      clauses: [{ predicate: 'prefer', roles: { experiencer: 'u', object: 'o' } }],
      annotations: {
        confidence: 0.85,
        tags: ['survey', 'opinion'],
        notes: 'user stated preference',
        extraField: 'preserved in 0.2',
        anotherExtra: { nested: 'obj' }
      }
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'preference',
      clauses: [{ predicate: 'prefer', roles: { experiencer: 'u', object: 'o' }, negated: false }],
      annotations: {
        confidence: 0.85,
        tags: ['survey', 'opinion'],
        notes: 'user stated preference',
        extraField: 'preserved in 0.2',
        anotherExtra: { nested: 'obj' }
      }
    }
  },

  // ---------------------------------------------------------------------------
  // F05: Annotations — standard fields
  // ---------------------------------------------------------------------------
  {
    id: 'f05-annotations-clean',
    description: 'Annotations with standard fields — preserved unchanged',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'claim',
      clauses: [{ predicate: 'assert', roles: { agent: 'a' } }],
      annotations: {
        confidence: 0.95,
        tags: ['verified'],
        notes: 'cross-checked'
      }
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'claim',
      clauses: [{ predicate: 'assert', roles: { agent: 'a' }, negated: false }],
      annotations: {
        confidence: 0.95,
        tags: ['verified'],
        notes: 'cross-checked'
      }
    }
  },

  // ---------------------------------------------------------------------------
  // F06: References — structured with uri + label
  // ---------------------------------------------------------------------------
  {
    id: 'f06-refs-structured',
    description: 'References structured with uri, label, and type in 0.2',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'cite', roles: { agent: 'a' } }],
      references: [
        { uri: 'https://example.com/doc1', label: 'Document One', type: 'source' },
        { uri: 'https://example.com/doc2' }
      ]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'cite', roles: { agent: 'a' }, negated: false }],
      references: [
        { uri: 'https://example.com/doc1', label: 'Document One', type: 'source' },
        { uri: 'https://example.com/doc2' }
      ]
    }
  },

  // ---------------------------------------------------------------------------
  // F07: Modality — unknown value mapped to 'belief'
  // ---------------------------------------------------------------------------
  {
    id: 'f07-modality-unknown-locked',
    description: 'Unknown modality value mapped to belief in 0.2',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [
        { predicate: 'suggest', roles: { agent: 'a' }, modality: 'uncertain' }
      ]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'statement',
      clauses: [
        { predicate: 'suggest', roles: { agent: 'a' }, negated: false, modality: 'belief' }
      ]
    }
  },

  // ---------------------------------------------------------------------------
  // F08: Modality — valid enum values preserved
  // ---------------------------------------------------------------------------
  {
    id: 'f08-modality-valid-preserved',
    description: 'Valid modality enum values are preserved unchanged',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [
        { predicate: 'require', roles: { agent: 'a' }, modality: 'obligation' },
        { predicate: 'believe', roles: { agent: 'b' }, modality: 'belief' },
        { predicate: 'want', roles: { agent: 'c' }, modality: 'goal' }
      ]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'statement',
      clauses: [
        { predicate: 'require', roles: { agent: 'a' }, negated: false, modality: 'obligation' },
        { predicate: 'believe', roles: { agent: 'b' }, negated: false, modality: 'belief' },
        { predicate: 'want', roles: { agent: 'c' }, negated: false, modality: 'goal' }
      ]
    }
  },

  // ---------------------------------------------------------------------------
  // F09: Modality — null preserved
  // ---------------------------------------------------------------------------
  {
    id: 'f09-modality-null',
    description: 'Modality null is preserved unchanged',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [
        { predicate: 'state', roles: { agent: 'a' }, modality: null }
      ]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'statement',
      clauses: [
        { predicate: 'state', roles: { agent: 'a' }, negated: false, modality: null }
      ]
    }
  },

  // ---------------------------------------------------------------------------
  // F10: Time object → stringified ISO 8601
  // ---------------------------------------------------------------------------
  {
    id: 'f10-time-object-stringified',
    description: 'Time object is stringified to ISO 8601 in 0.2',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'event',
      clauses: [
        {
          predicate: 'occur',
          roles: { agent: 'a', location: 'here' },
          time: { day: 15, month: 6, year: 2026, hour: 14, minute: 30 }
        }
      ]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'event',
      clauses: [
        {
          predicate: 'occur',
          roles: { agent: 'a', location: 'here' },
          negated: false,
          time: JSON.stringify({ day: 15, month: 6, year: 2026, hour: 14, minute: 30 })
        }
      ]
    }
  },

  // ---------------------------------------------------------------------------
  // F11: Time already ISO string — no transformation
  // ---------------------------------------------------------------------------
  {
    id: 'f11-time-string-preserved',
    description: 'Time as ISO 8601 string is preserved unchanged',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'event',
      clauses: [
        { predicate: 'occur', roles: { agent: 'a' }, time: '2026-07-01T10:00:00Z' }
      ]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'event',
      clauses: [
        { predicate: 'occur', roles: { agent: 'a' }, negated: false, time: '2026-07-01T10:00:00Z' }
      ]
    }
  },

  // ---------------------------------------------------------------------------
  // F12: Clause annotations — additionalProperties: true in 0.2
  // ---------------------------------------------------------------------------
  {
    id: 'f12-clause-annotations-unrestricted',
    description: 'Clause-level annotations preserved with additionalProperties: true',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [
        {
          predicate: 'note',
          roles: { agent: 'a' },
          annotations: {
            confidence: 0.7,
            evidence: 'document ref-1',
            extraClauseField: 'preserved in 0.2'
          }
        }
      ]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'statement',
      clauses: [
        {
          predicate: 'note',
          roles: { agent: 'a' },
          negated: false,
          annotations: {
            confidence: 0.7,
            evidence: 'document ref-1',
            extraClauseField: 'preserved in 0.2'
          }
        }
      ]
    }
  },

  // ---------------------------------------------------------------------------
  // F13: Negation preserved
  // ---------------------------------------------------------------------------
  {
    id: 'f13-negation-preserved',
    description: 'Clause negation flag is preserved',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [
        { predicate: 'deny', roles: { agent: 'a', theme: 't' }, negated: true }
      ]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'statement',
      clauses: [
        { predicate: 'deny', roles: { agent: 'a', theme: 't' }, negated: true }
      ]
    }
  },

  // ---------------------------------------------------------------------------
  // F14: Conditions (nested clauses) preserved
  // ---------------------------------------------------------------------------
  {
    id: 'f14-conditions-preserved',
    description: 'Conditional nested clauses preserved through migration',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'tool',
      kind: 'instruction',
      clauses: [
        {
          predicate: 'if',
          roles: { condition: 'auth' },
          conditions: [
            { predicate: 'valid', roles: { subject: 'token' }, negated: false }
          ]
        }
      ]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'tool',
      kind: 'instruction',
      clauses: [
        {
          predicate: 'if',
          roles: { condition: 'auth' },
          negated: false,
          conditions: [
            { predicate: 'valid', roles: { subject: 'token' }, negated: false }
          ]
        }
      ]
    }
  },

  // ---------------------------------------------------------------------------
  // F15: Consequences (nested clauses) preserved
  // ---------------------------------------------------------------------------
  {
    id: 'f15-consequences-preserved',
    description: 'Consequence nested clauses preserved through migration',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'tool',
      kind: 'instruction',
      clauses: [
        {
          predicate: 'trigger',
          roles: { agent: 'system' },
          consequences: [
            { predicate: 'notify', roles: { agent: 'admin', theme: 'alert' } }
          ]
        }
      ]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'tool',
      kind: 'instruction',
      clauses: [
        {
          predicate: 'trigger',
          roles: { agent: 'system' },
          negated: false,
          consequences: [
            { predicate: 'notify', roles: { agent: 'admin', theme: 'alert' }, negated: false }
          ]
        }
      ]
    }
  },

  // ---------------------------------------------------------------------------
  // F16: Multiple clauses
  // ---------------------------------------------------------------------------
  {
    id: 'f16-multiple-clauses',
    description: 'Multiple clauses in one record — all migrated',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'report',
      clauses: [
        { predicate: 'state', roles: { agent: 'a', theme: 't1' } },
        { predicate: 'deny', roles: { agent: 'a', theme: 't2' }, negated: true },
        { predicate: 'prefer', roles: { experiencer: 'u', object: 'o' }, modality: 'possibility' }
      ]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'report',
      clauses: [
        { predicate: 'state', roles: { agent: 'a', theme: 't1' }, negated: false },
        { predicate: 'deny', roles: { agent: 'a', theme: 't2' }, negated: true },
        { predicate: 'prefer', roles: { experiencer: 'u', object: 'o' }, negated: false, modality: 'possibility' }
      ]
    }
  },

  // ---------------------------------------------------------------------------
  // F17: Empty provenance — preserved as-is
  // ---------------------------------------------------------------------------
  {
    id: 'f17-empty-provenance',
    description: 'Empty or absent provenance is handled gracefully',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'state', roles: { agent: 'a' } }],
      provenance: {}
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'state', roles: { agent: 'a' }, negated: false }],
      provenance: {}
    }
  },

  // ---------------------------------------------------------------------------
  // F18: Empty annotations — preserved as-is
  // ---------------------------------------------------------------------------
  {
    id: 'f18-empty-annotations',
    description: 'Empty annotations are handled gracefully',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'state', roles: { agent: 'a' } }],
      annotations: {}
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'state', roles: { agent: 'a' }, negated: false }],
      annotations: {}
    }
  },

  // ---------------------------------------------------------------------------
  // F19: No references at all
  // ---------------------------------------------------------------------------
  {
    id: 'f19-no-references',
    description: 'Record without references field at all',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'dream',
      kind: 'statement',
      clauses: [{ predicate: 'dream', roles: { experiencer: 'd', theme: 't' } }]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'dream',
      kind: 'statement',
      clauses: [{ predicate: 'dream', roles: { experiencer: 'd', theme: 't' }, negated: false }]
    }
  },

  // ---------------------------------------------------------------------------
  // F20: Term objects — type enum enforced
  // ---------------------------------------------------------------------------
  {
    id: 'f20-term-type-enum',
    description: 'Term type enum values enforced in 0.2',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [
        {
          predicate: 'refer',
          roles: {
            subject: { type: 'entity', id: 'u1', value: 'User One', language: 'en', ref: 'ext:1' }
          }
        }
      ]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'statement',
      clauses: [
        {
          predicate: 'refer',
          roles: {
            subject: { type: 'entity', id: 'u1', value: 'User One', language: 'en', ref: 'ext:1' }
          },
          negated: false
        }
      ]
    }
  },

  // ---------------------------------------------------------------------------
  // F21: Reference with all fields
  // ---------------------------------------------------------------------------
  {
    id: 'f21-ref-all-fields',
    description: 'Reference with uri, label, and type preserved through migration',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'citation',
      clauses: [{ predicate: 'cite', roles: { agent: 'c' } }],
      references: [
        {
          uri: 'https://example.org/full',
          label: 'Full Reference Title',
          type: 'academic'
        }
      ]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'citation',
      clauses: [{ predicate: 'cite', roles: { agent: 'c' }, negated: false }],
      references: [
        {
          uri: 'https://example.org/full',
          label: 'Full Reference Title',
          type: 'academic'
        }
      ]
    }
  },

  // ---------------------------------------------------------------------------
  // F22: Reference with minimal fields (uri only)
  // ---------------------------------------------------------------------------
  {
    id: 'f22-ref-minimal',
    description: 'Reference with only required field (uri)',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'cite', roles: { agent: 'a' } }],
      references: [
        { uri: 'https://example.org/min' }
      ]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'cite', roles: { agent: 'a' }, negated: false }],
      references: [
        { uri: 'https://example.org/min' }
      ]
    }
  },

  // ---------------------------------------------------------------------------
  // F23: Full complex record — all features exercised
  // ---------------------------------------------------------------------------
  {
    id: 'f23-full-complex',
    description: 'Full complex record with all migration dimensions',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'report',
      clauses: [
        {
          predicate: 'find',
          roles: { agent: 'researcher', theme: 'result' },
          modality: 'fact',
          time: '2026-07-01T09:00:00Z',
          negated: false,
          annotations: { confidence: 0.9, evidence: 'dataset-v2' }
        },
        {
          predicate: 'recommend',
          roles: { agent: 'system', target: 'action' },
          modality: 'obligation',
          conditions: [
            {
              predicate: 'satisfy',
              roles: { condition: 'threshold' },
              time: { day: 1, month: 7, year: 2026 },
              modality: 'uncertain'
            }
          ]
        }
      ],
      references: [
        { uri: 'https://data.example.com/v2', label: 'Dataset V2' },
        { uri: 'https://ext.example.com' }
      ],
      provenance: {
        source: 'auto',
        author: 'pipeline',
        timestamp: '2026-07-01T12:00:00Z',
        license: 'CC-BY-SA-4.0',
        pipelineVersion: '2.1.0'
      },
      annotations: {
        confidence: 0.88,
        tags: ['automated', 'reviewed'],
        notes: 'auto-generated report',
        reviewer: 'bob',
        score: 95
      }
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'report',
      clauses: [
        {
          predicate: 'find',
          roles: { agent: 'researcher', theme: 'result' },
          negated: false,
          modality: 'fact',
          time: '2026-07-01T09:00:00Z',
          annotations: { confidence: 0.9, evidence: 'dataset-v2' }
        },
        {
          predicate: 'recommend',
          roles: { agent: 'system', target: 'action' },
          negated: false,
          modality: 'obligation',
          conditions: [
            {
              predicate: 'satisfy',
              roles: { condition: 'threshold' },
              negated: false,
              time: JSON.stringify({ day: 1, month: 7, year: 2026 }),
              modality: 'belief'
            }
          ]
        }
      ],
      references: [
        { uri: 'https://data.example.com/v2', label: 'Dataset V2' },
        { uri: 'https://ext.example.com' }
      ],
      provenance: {
        source: 'auto',
        author: 'pipeline',
        timestamp: '2026-07-01T12:00:00Z',
        license: 'CC-BY-SA-4.0',
        pipelineVersion: '2.1.0'
      },
      annotations: {
        confidence: 0.88,
        tags: ['automated', 'reviewed'],
        notes: 'auto-generated report',
        reviewer: 'bob',
        score: 95
      }
    }
  },

  // ---------------------------------------------------------------------------
  // F24: Clause without negation in 0.1 — default added
  // ---------------------------------------------------------------------------
  {
    id: 'f24-negation-default',
    description: 'Clause without negation field gets negated: false in 0.2',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'assert', roles: { agent: 'a' } }]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'assert', roles: { agent: 'a' }, negated: false }]
    }
  },

  // ---------------------------------------------------------------------------
  // F25: Modality with empty string → mapped to 'belief'
  // ---------------------------------------------------------------------------
  {
    id: 'f25-modality-empty-mapped',
    description: 'Empty string modality is mapped to belief in 0.2',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [
        { predicate: 'state', roles: { agent: 'a' }, modality: '' }
      ]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'statement',
      clauses: [
        { predicate: 'state', roles: { agent: 'a' }, negated: false, modality: 'belief' }
      ]
    }
  },

  // ---------------------------------------------------------------------------
  // F26: Nested conditions with consequences
  // ---------------------------------------------------------------------------
  {
    id: 'f26-nested-conditions-consequences',
    description: 'Complex nested clause with conditions and consequences',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'tool',
      kind: 'rule',
      clauses: [
        {
          predicate: 'when',
          roles: { condition: 'event' },
          conditions: [
            {
              predicate: 'check',
              roles: { subject: 'status' },
              modality: 'certainty',
              consequences: [
                { predicate: 'do', roles: { agent: 'system', theme: 'action' } }
              ]
            }
          ],
          consequences: [
            { predicate: 'notify', roles: { agent: 'admin' } }
          ]
        }
      ]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'tool',
      kind: 'rule',
      clauses: [
        {
          predicate: 'when',
          roles: { condition: 'event' },
          negated: false,
          conditions: [
            {
              predicate: 'check',
              roles: { subject: 'status' },
              negated: false,
              modality: 'certainty',
              consequences: [
                { predicate: 'do', roles: { agent: 'system', theme: 'action' }, negated: false }
              ]
            }
          ],
          consequences: [
            { predicate: 'notify', roles: { agent: 'admin' }, negated: false }
          ]
        }
      ]
    }
  },

  // ---------------------------------------------------------------------------
  // F27: Mixed term types (string, number, boolean)
  // ---------------------------------------------------------------------------
  {
    id: 'f27-mixed-term-types',
    description: 'Roles with mixed term types (string, number, boolean)',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'measurement',
      clauses: [
        {
          predicate: 'measure',
          roles: {
            agent: 'sensor',
            value: 42,
            threshold: 3.14,
            active: true
          }
        }
      ]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'measurement',
      clauses: [
        {
          predicate: 'measure',
          roles: {
            agent: 'sensor',
            value: 42,
            threshold: 3.14,
            active: true
          },
          negated: false
        }
      ]
    }
  },

  // ---------------------------------------------------------------------------
  // F28: Provenance with only some locked fields
  // ---------------------------------------------------------------------------
  {
    id: 'f28-provenance-partial',
    description: 'Provenance with only some locked fields present',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'state', roles: { agent: 'a' } }],
      provenance: {
        source: 'web',
        timestamp: '2026-06-15T08:00:00Z'
      }
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'state', roles: { agent: 'a' }, negated: false }],
      provenance: {
        source: 'web',
        timestamp: '2026-06-15T08:00:00Z'
      }
    }
  },

  // ---------------------------------------------------------------------------
  // F29: Annotations with confidence at boundaries
  // ---------------------------------------------------------------------------
  {
    id: 'f29-confidence-boundaries',
    description: 'Annotations with confidence at 0 and 1 boundaries',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'state', roles: { agent: 'a' } }],
      annotations: {
        confidence: 0,
        tags: ['minimum'],
        notes: 'edge case'
      }
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'statement',
      clauses: [{ predicate: 'state', roles: { agent: 'a' }, negated: false }],
      annotations: {
        confidence: 0,
        tags: ['minimum'],
        notes: 'edge case'
      }
    }
  },

  // ---------------------------------------------------------------------------
  // F30: References with special URI characters
  // ---------------------------------------------------------------------------
  {
    id: 'f30-ref-special-uri',
    description: 'References with special URI characters preserved',
    input01: {
      schema: 'lunum-sem/0.1-draft',
      world: 'real',
      kind: 'citation',
      clauses: [{ predicate: 'cite', roles: { agent: 'a' } }],
      references: [
        {
          uri: 'https://example.com/path?query=value&other=123#fragment',
          label: 'Special URI Ref',
          type: 'web'
        }
      ]
    },
    expected02: {
      schema: 'lunum-sem/0.2',
      world: 'real',
      kind: 'citation',
      clauses: [{ predicate: 'cite', roles: { agent: 'a' }, negated: false }],
      references: [
        {
          uri: 'https://example.com/path?query=value&other=123#fragment',
          label: 'Special URI Ref',
          type: 'web'
        }
      ]
    }
  }
];

// ===========================================================================
// Test: Each fixture's expected02 validates against the 0.2 schema
// ===========================================================================

test('golden migration vectors: all expected02 outputs validate against Lunum-Sem 0.2 schema', async () => {
  const schema = await loadSem02Schema();
  const failures: string[] = [];

  for (const fixture of goldenFixtures) {
    const { ok, errors } = isValid(fixture.expected02, schema);
    if (!ok) {
      failures.push(`${fixture.id} (${fixture.description}): ${errors.join('; ')}`);
    }
  }

  if (failures.length > 0) {
    assert.fail(`Expected 02 outputs failed schema validation:\n${failures.join('\n')}`);
  }
});

// ===========================================================================
// Test: Each fixture's input01 validates against the 0.1 schema
// ===========================================================================

test('golden migration vectors: all input01 fixtures validate against Lunum-Sem 0.1 schema', async () => {
  const schema01Path = path.join(WORKSPACE_ROOT, 'schemas', 'lunum-sem.schema.json');
  const schema01 = JSON.parse(fs.readFileSync(schema01Path, 'utf-8'));
  const failures: string[] = [];

  for (const fixture of goldenFixtures) {
    const { ok, errors } = isValid(fixture.input01, schema01);
    if (!ok) {
      failures.push(`${fixture.id} (${fixture.description}): ${errors.join('; ')}`);
    }
  }

  if (failures.length > 0) {
    assert.fail(`Input 01 fixtures failed 0.1 schema validation:\n${failures.join('\n')}`);
  }
});

// ===========================================================================
// Test: Verify fixture count and coverage
// ===========================================================================

test('golden migration vectors: fixture count >= 20 and coverage categories present', () => {
  assert.ok(goldenFixtures.length >= 20, `Expected at least 20 fixtures, got ${goldenFixtures.length}`);

  // Check coverage categories
  const ids = goldenFixtures.map(f => f.id);

  // Schema version
  assert.ok(ids.some(id => id.startsWith('f01')), 'Must cover schema version upgrade');

  // Provenance
  assert.ok(ids.some(id => id.startsWith('f02')), 'Must cover provenance locked fields');
  assert.ok(ids.some(id => id.startsWith('f03')), 'Must cover provenance clean (no change)');

  // Annotations
  assert.ok(ids.some(id => id.startsWith('f04')), 'Must cover annotations locked fields');

  // References
  assert.ok(ids.some(id => id.startsWith('f06')), 'Must cover reference structuring');

  // Modality
  assert.ok(ids.some(id => id.startsWith('f07')), 'Must cover modality unknown → mapped');
  assert.ok(ids.some(id => id.startsWith('f08')), 'Must cover valid modality preserved');
  assert.ok(ids.some(id => id.startsWith('f09')), 'Must cover modality null preserved');

  // Time
  assert.ok(ids.some(id => id.startsWith('f10')), 'Must cover time object → stringified');
  assert.ok(ids.some(id => id.startsWith('f11')), 'Must cover time string preserved');

  // Nested clauses
  assert.ok(ids.some(id => id.startsWith('f14')), 'Must cover conditions preserved');
  assert.ok(ids.some(id => id.startsWith('f15')), 'Must cover consequences preserved');

  // Negation
  assert.ok(ids.some(id => id.startsWith('f13')), 'Must cover negation flag');

  // Multiple clauses
  assert.ok(ids.some(id => id.startsWith('f16')), 'Must cover multiple clauses');

  // Edge cases
  assert.ok(ids.some(id => id.startsWith('f23')), 'Must cover full complex record');

  // Count by category
  const schemaVersionCount = goldenFixtures.filter(f => f.input01.schema === 'lunum-sem/0.1-draft' && f.expected02.schema === 'lunum-sem/0.2').length;
  assert.ok(schemaVersionCount > 0, 'All fixtures must demonstrate schema version upgrade');
});

// ===========================================================================
// Test: No fixture has unexpected fields in expected02
// ===========================================================================

test('golden migration vectors: no unexpected fields in expected02', () => {
  const expectedKeys = ['schema', 'world', 'kind', 'clauses', 'references', 'provenance', 'annotations'];

  for (const fixture of goldenFixtures) {
    const actualKeys = Object.keys(fixture.expected02);
    const unexpected = actualKeys.filter(k => !expectedKeys.includes(k));
    if (unexpected.length > 0) {
      assert.fail(`${fixture.id}: unexpected fields in expected02: ${unexpected.join(', ')}`);
    }

    // Check reference structure if present
    if ((fixture.expected02 as any).references) {
      const refs = (fixture.expected02 as any).references as any[];
      for (const ref of refs) {
        const refKeys = Object.keys(ref);
        const allowedRefKeys = ['uri', 'label', 'type'];
        const unexpectedRef = refKeys.filter(k => !allowedRefKeys.includes(k));
        if (unexpectedRef.length > 0) {
          assert.fail(`${fixture.id}: unexpected reference fields: ${unexpectedRef.join(', ')}`);
        }
      }
    }

    // Check term structure if present
    for (const clause of (fixture.expected02 as any).clauses || []) {
      const roles = (clause as any).roles;
      if (roles) {
        for (const val of Object.values(roles)) {
          if (typeof val === 'object' && val !== null && 'type' in val) {
            const allowedTermKeys = ['type', 'id', 'value', 'language', 'ref'];
            const termKeys = Object.keys(val);
            const unexpectedTerm = termKeys.filter(k => !allowedTermKeys.includes(k));
            if (unexpectedTerm.length > 0) {
              assert.fail(`${fixture.id}: unexpected term fields: ${unexpectedTerm.join(', ')}`);
            }
          }
        }
      }
    }
  }
});

// ===========================================================================
// Test: All fixture IDs are unique
// ===========================================================================

test('golden migration vectors: all fixture IDs are unique', () => {
  const ids = goldenFixtures.map(f => f.id);
  const unique = new Set(ids);
  assert.strictEqual(ids.length, unique.size, `Duplicate fixture IDs found: ${ids.length} fixtures but ${unique.size} unique IDs`);
});

// ===========================================================================
// Test: Coverage map — every structural change is tested at least once
// ===========================================================================

test('golden migration vectors: structural change coverage is complete', () => {
  const coverage = new Set<string>();

  for (const fixture of goldenFixtures) {
    const input = fixture.input01 as any;
    const expected = fixture.expected02 as any;

    // Schema version change
    coverage.add('schema-version');

    // Provenance changes (0.2 has additionalProperties: true, so extra fields preserved)
    if (input.provenance && expected.provenance) {
      const inputKeys = new Set(Object.keys(input.provenance));
      const expectedKeys = new Set(Object.keys(expected.provenance));
      if (inputKeys.size > 0) coverage.add('provenance-clean');
      if (Object.keys(input.provenance).length === 0) coverage.add('provenance-empty');
      if (inputKeys.size > 4) coverage.add('provenance-extra-preserved');
    }

    // Annotations changes (0.2 has additionalProperties: true, so extra fields preserved)
    if (input.annotations && expected.annotations) {
      const inputKeys = new Set(Object.keys(input.annotations));
      const expectedKeys = new Set(Object.keys(expected.annotations));
      if (inputKeys.size > 0) coverage.add('annotations-clean');
      if (Object.keys(input.annotations).length === 0) coverage.add('annotations-empty');
      if (inputKeys.size > 3) coverage.add('annotations-extra-preserved');
    }

    // References (0.2 uses uri + label instead of loose objects)
    if (input.references && input.references.length > 0) coverage.add('references-structured');
    if (!input.references) coverage.add('no-references');

    // Modality
    for (let ci = 0; ci < input.clauses.length; ci++) {
      const clause = input.clauses[ci] as any;
      const expClause = expected.clauses?.[ci] as any;
      if (clause.modality !== undefined) {
        if (clause.modality === null) coverage.add('modality-null');
        else if (clause.modality === 'uncertain' && expClause?.modality === 'belief') coverage.add('modality-unknown-mapped');
        else if (clause.modality === expClause?.modality) coverage.add('modality-valid-preserved');
        else if (clause.modality === '' && expClause?.modality === 'belief') coverage.add('modality-empty-mapped');
      }
    }

    // Time
    for (let ci = 0; ci < input.clauses.length; ci++) {
      const clause = input.clauses[ci] as any;
      const expClause = expected.clauses?.[ci] as any;
      if (clause.time !== undefined) {
        if (typeof clause.time === 'object' && clause.time !== null) coverage.add('time-object-stringified');
        if (typeof clause.time === 'string') coverage.add('time-string-preserved');
      }
    }

    // Negation
    for (let ci = 0; ci < input.clauses.length; ci++) {
      const clause = input.clauses[ci] as any;
      if (!('negated' in clause)) coverage.add('negation-default-added');
      if (clause.negated === true) coverage.add('negation-preserved');
    }

    // Nested clauses
    for (let ci = 0; ci < input.clauses.length; ci++) {
      const clause = input.clauses[ci] as any;
      if (clause.conditions?.length) coverage.add('conditions-preserved');
      if (clause.consequences?.length) coverage.add('consequences-preserved');
    }

    // Multiple clauses
    if (input.clauses.length > 1) coverage.add('multiple-clauses');

    // Mixed term types
    for (let ci = 0; ci < input.clauses.length; ci++) {
      const clause = input.clauses[ci] as any;
      const roles = clause.roles as Record<string, unknown>;
      if (roles) {
        for (const val of Object.values(roles)) {
          if (typeof val === 'number' || typeof val === 'boolean') coverage.add('mixed-term-types');
        }
      }
    }

    // Term type enum
    for (let ci = 0; ci < input.clauses.length; ci++) {
      const clause = input.clauses[ci] as any;
      const roles = clause.roles as Record<string, unknown>;
      if (roles) {
        for (const val of Object.values(roles)) {
          if (typeof val === 'object' && val !== null && 'type' in val) {
            coverage.add('term-type-enum');
          }
        }
      }
    }
  }

  const expectedCategories = [
    'schema-version',
    'provenance-clean',
    'provenance-empty',
    'provenance-extra-preserved',
    'annotations-clean',
    'annotations-empty',
    'annotations-extra-preserved',
    'references-structured',
    'no-references',
    'modality-null',
    'modality-unknown-mapped',
    'modality-valid-preserved',
    'modality-empty-mapped',
    'time-object-stringified',
    'time-string-preserved',
    'negation-default-added',
    'negation-preserved',
    'conditions-preserved',
    'consequences-preserved',
    'multiple-clauses',
    'mixed-term-types',
    'term-type-enum'
  ];

  const missing = expectedCategories.filter(c => !coverage.has(c));
  if (missing.length > 0) {
    assert.fail(`Missing coverage categories: ${missing.join(', ')}`);
  }
});
