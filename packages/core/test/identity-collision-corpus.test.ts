import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintSem } from '../src/fingerprint.js';
import { SEM_SCHEMA } from '../src/constants.js';
import type { LunumSem } from '../src/types.js';

// ---------------------------------------------------------------------------
// R4.3 — collision / accidental-equivalence corpus
//
// Each pair below is near-identical, differing by exactly ONE meaningful
// change (role id, negation, numeric value, predicate, modality, world,
// kind, role name, nested condition/consequence, term type, array order,
// array length, time value, quantity sign, actor vs concept, etc). This is
// a fail-closed test: if fingerprintSem ever collides for any pair, the
// test fails loudly with full detail instead of silently passing. Per the
// issue constraints, canonicalize.ts / fingerprint.ts must NOT be modified
// to "fix" a found collision — a collision is a real defect to report.
// ---------------------------------------------------------------------------

interface Pair {
  name: string;
  a: LunumSem;
  b: LunumSem;
}

function sem(overrides: Partial<LunumSem> & Pick<LunumSem, 'clauses'>): LunumSem {
  return { schema: SEM_SCHEMA, world: 'real', kind: 'preference', ...overrides };
}

const PAIRS: Pair[] = [
  {
    name: 'differing role id',
    a: sem({ clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' } } }] }),
    b: sem({ clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'admin' } } }] })
  },
  {
    name: 'differing negation',
    a: sem({ clauses: [{ predicate: 'delete', roles: { object: { type: 'concept', id: 'files' } }, negated: true }] }),
    b: sem({ clauses: [{ predicate: 'delete', roles: { object: { type: 'concept', id: 'files' } }, negated: false }] })
  },
  {
    name: 'differing numeric value',
    a: sem({ clauses: [{ predicate: 'below', roles: { value: { type: 'quantity', value: 20 } } }] }),
    b: sem({ clauses: [{ predicate: 'below', roles: { value: { type: 'quantity', value: 21 } } }] })
  },
  {
    name: 'differing predicate',
    a: sem({ clauses: [{ predicate: 'enable', roles: { theme: { type: 'feature', id: 'dark_mode' } } }] }),
    b: sem({ clauses: [{ predicate: 'disable', roles: { theme: { type: 'feature', id: 'dark_mode' } } }] })
  },
  {
    name: 'differing modality',
    a: sem({ clauses: [{ predicate: 'require', roles: { agent: { type: 'actor', id: 'system' } }, modality: 'obligation' }] }),
    b: sem({ clauses: [{ predicate: 'require', roles: { agent: { type: 'actor', id: 'system' } }, modality: 'permission' }] })
  },
  {
    name: 'differing world',
    a: sem({ world: 'real', clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' } } }] }),
    b: sem({ world: 'fiction', clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' } } }] })
  },
  {
    name: 'differing kind',
    a: sem({ kind: 'preference', clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' } } }] }),
    b: sem({ kind: 'instruction', clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' } } }] })
  },
  {
    name: 'differing role name (same value, different role key)',
    a: sem({ clauses: [{ predicate: 'notify', roles: { agent: { type: 'actor', id: 'system' } } }] }),
    b: sem({ clauses: [{ predicate: 'notify', roles: { recipient: { type: 'actor', id: 'system' } } }] })
  },
  {
    name: 'differing role term type (actor vs concept)',
    a: sem({ clauses: [{ predicate: 'notify', roles: { theme: { type: 'actor', id: 'target' } } }] }),
    b: sem({ clauses: [{ predicate: 'notify', roles: { theme: { type: 'concept', id: 'target' } } }] })
  },
  {
    name: 'differing nested condition predicate',
    a: sem({ clauses: [{ predicate: 'enable', roles: { theme: { type: 'feature', id: 'power_saving' } }, conditions: [{ predicate: 'below', roles: { subject: { type: 'metric', id: 'battery' }, value: { type: 'quantity', value: 20 } } }] }] }),
    b: sem({ clauses: [{ predicate: 'enable', roles: { theme: { type: 'feature', id: 'power_saving' } }, conditions: [{ predicate: 'above', roles: { subject: { type: 'metric', id: 'battery' }, value: { type: 'quantity', value: 20 } } }] }] })
  },
  {
    name: 'differing nested condition negation',
    a: sem({ clauses: [{ predicate: 'delete', roles: { object: { type: 'concept', id: 'files' } }, negated: true, conditions: [{ predicate: 'confirmed', roles: { agent: { type: 'actor', id: 'user' } }, negated: false }] }] }),
    b: sem({ clauses: [{ predicate: 'delete', roles: { object: { type: 'concept', id: 'files' } }, negated: true, conditions: [{ predicate: 'confirmed', roles: { agent: { type: 'actor', id: 'user' } }, negated: true }] }] })
  },
  {
    name: 'differing consequence predicate',
    a: sem({ clauses: [{ predicate: 'require', roles: { agent: { type: 'actor', id: 'system' } }, consequences: [{ predicate: 'notify', roles: { recipient: { type: 'actor', id: 'user' } } }] }] }),
    b: sem({ clauses: [{ predicate: 'require', roles: { agent: { type: 'actor', id: 'system' } }, consequences: [{ predicate: 'log', roles: { recipient: { type: 'actor', id: 'user' } } }] }] })
  },
  {
    name: 'extra clause (clause count difference)',
    a: sem({ clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' } } }] }),
    b: sem({ clauses: [
      { predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' } } },
      { predicate: 'require', roles: { agent: { type: 'actor', id: 'system' } } }
    ] })
  },
  {
    name: 'array-valued role: differing order',
    a: sem({ clauses: [{ predicate: 'prefer', roles: { theme: [{ type: 'concept', id: 'a' }, { type: 'concept', id: 'b' }] } }] }),
    b: sem({ clauses: [{ predicate: 'prefer', roles: { theme: [{ type: 'concept', id: 'b' }, { type: 'concept', id: 'a' }] } }] })
  },
  {
    name: 'array-valued role: differing length',
    a: sem({ clauses: [{ predicate: 'prefer', roles: { theme: [{ type: 'concept', id: 'a' }, { type: 'concept', id: 'b' }] } }] }),
    b: sem({ clauses: [{ predicate: 'prefer', roles: { theme: [{ type: 'concept', id: 'a' }, { type: 'concept', id: 'b' }, { type: 'concept', id: 'c' }] } }] })
  },
  {
    name: 'differing time value',
    a: sem({ clauses: [{ predicate: 'occur', roles: { subject: { type: 'event', id: 'meeting' } }, time: { type: 'instant', value: '2026-01-01' } }] }),
    b: sem({ clauses: [{ predicate: 'occur', roles: { subject: { type: 'event', id: 'meeting' } }, time: { type: 'instant', value: '2026-01-02' } }] })
  },
  {
    name: 'differing numeric sign',
    a: sem({ clauses: [{ predicate: 'below', roles: { value: { type: 'quantity', value: -5 } } }] }),
    b: sem({ clauses: [{ predicate: 'below', roles: { value: { type: 'quantity', value: 5 } } }] })
  },
  {
    name: 'differing boolean role value',
    a: sem({ clauses: [{ predicate: 'confirm', roles: { value: { type: 'flag', id: 'x', value: true } } }] }),
    b: sem({ clauses: [{ predicate: 'confirm', roles: { value: { type: 'flag', id: 'x', value: false } } }] })
  },
  {
    name: 'differing role language tag',
    a: sem({ clauses: [{ predicate: 'label', roles: { theme: { type: 'concept', id: 'x', language: 'en' } } }] }),
    b: sem({ clauses: [{ predicate: 'label', roles: { theme: { type: 'concept', id: 'x', language: 'el' } } }] })
  },
  {
    name: 'extra role in clause',
    a: sem({ clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' } } }] }),
    b: sem({ clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' }, theme: { type: 'concept', id: 'concise_answers' } } }] })
  },
  {
    name: 'differing multilingual text content (semantically distinct words, same language)',
    a: sem({ clauses: [{ predicate: 'prefer', roles: { theme: { type: 'concept', id: 'concise_answers', value: 'σύντομες απαντήσεις' } } }] }),
    b: sem({ clauses: [{ predicate: 'prefer', roles: { theme: { type: 'concept', id: 'concise_answers', value: 'μακροσκελείς απαντήσεις' } } }] })
  },
  {
    name: 'differing reference id at top level',
    a: sem({ clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' } } }], references: [{ type: 'actor', id: 'user' }] }),
    b: sem({ clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'user' } } }], references: [{ type: 'actor', id: 'admin' }] })
  },
  {
    name: 'differing quantity magnitude by one unit',
    a: sem({ clauses: [{ predicate: 'below', roles: { subject: { type: 'metric', id: 'battery' }, value: { type: 'quantity', value: 20 } } }] }),
    b: sem({ clauses: [{ predicate: 'below', roles: { subject: { type: 'metric', id: 'battery' }, value: { type: 'quantity', value: 20.001 } } }] })
  }
];

test(`collision corpus has ${PAIRS.length} pairs (>= 20 required)`, () => {
  assert.ok(PAIRS.length >= 20, `expected at least 20 pairs, got ${PAIRS.length}`);
});

for (const pair of PAIRS) {
  test(`collision corpus: "${pair.name}" fingerprints must differ`, () => {
    const fpA = fingerprintSem(pair.a);
    const fpB = fingerprintSem(pair.b);
    assert.notEqual(
      fpA, fpB,
      `COLLISION DETECTED for pair "${pair.name}":\n` +
      `  a = ${JSON.stringify(pair.a)}\n  fpA = ${fpA}\n` +
      `  b = ${JSON.stringify(pair.b)}\n  fpB = ${fpB}`
    );
  });
}

test('collision corpus: zero collisions within any pair (aggregate fail-closed check)', () => {
  // Note: this intentionally only checks WITHIN each pair (a vs b), not
  // across different pairs' fingerprints. Several pairs share an identical
  // baseline sem as their "a" side by design (e.g. "differing role id" and
  // "differing world" both start from the same prefer/user template before
  // applying their one differing change) — that shared baseline producing
  // the same fingerprint is correct behavior, not a collision.
  const collisions: string[] = [];
  for (const pair of PAIRS) {
    const fpA = fingerprintSem(pair.a);
    const fpB = fingerprintSem(pair.b);
    if (fpA === fpB) collisions.push(`"${pair.name}": a and b both hash to ${fpA}`);
  }
  assert.deepEqual(collisions, [], `Collisions found:\n${collisions.join('\n')}`);
});
