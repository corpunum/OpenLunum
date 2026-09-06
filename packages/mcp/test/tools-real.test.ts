import { test } from 'node:test';
import assert from 'node:assert';
import { createBlindEvaluationTools, lunumTools } from '../src/tools.js';

const find = (name: string) => {
  const tool = lunumTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool;
};

function getText(result: { content: Array<{ text?: string }> }): string {
  return result.content[0]?.text ?? '';
}

test('lunumTools has the real agent-native tools', () => {
  assert.strictEqual(lunumTools.length, 10);
  const names = lunumTools.map((t) => t.name);
  assert.ok(names.includes('lunum_derive'));
  assert.ok(names.includes('lunum_compile_context'));
  assert.ok(names.includes('lunum_fingerprint'));
  assert.ok(names.includes('lunum_validate'));
  assert.ok(names.includes('lunum_render'));
  assert.ok(names.includes('lunum_compare'));
  assert.ok(names.includes('lunum_classify'));
  assert.ok(names.includes('lunum_get_extraction_contract'));
  assert.ok(names.includes('lunum_submit_candidate'));
  assert.ok(names.includes('lunum_build_candidate'));
});

test('lunum_build_candidate returns a candidate without certifying it', async () => {
  const data = JSON.parse(getText(await find('lunum_build_candidate').handler({
    world: 'real', kind: 'preference', predicate: 'prefer',
    roles: { experiencer: { type: 'actor', id: 'maria' }, theme: { type: 'concept', id: 'quiet_mode' } },
  })));
  assert.equal(data.success, true);
  assert.equal(data.candidate.schema, 'lunum-sem/0.1-draft');
  assert.ok(data.frame);
  assert.equal(data.promotable, undefined);
});

test('lunum_get_extraction_contract returns registry-derived hashes and frames', async () => {
  const data = JSON.parse(getText(await find('lunum_get_extraction_contract').handler({})));
  assert.equal(data.success, true);
  assert.ok(data.contract.frames.framedPredicates.includes('prefer'));
  assert.match(data.contract.frames.registryHash, /^[0-9a-f]{64}$/u);
});

test('lunum_submit_candidate contains an untrusted candidate', async () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference',
    clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'maria' }, theme: { type: 'concept', id: 'quiet_mode' } }, negated: false }]
  };
  const data = JSON.parse(getText(await find('lunum_submit_candidate').handler({
    sourceText: 'Maria prefers quiet mode.', candidateSem: sem, provenance: { extractorType: 'codex_agent' }
  })));
  assert.equal(data.success, true);
  assert.equal(data.submission.candidateIdentityAvailable, true);
  assert.equal(data.submission.promotable, false);
  assert.equal(data.submission.trust.promoted, false);
});

test('lunum_submit_candidate contains structured grounding proposals without granting identity', async () => {
  const sem = {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference',
    clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'maria' }, theme: { type: 'concept', id: 'blue_folder' } }, negated: false }]
  };
  const data = JSON.parse(getText(await find('lunum_submit_candidate').handler({
    sourceText: 'Maria prefers a blue folder.', candidateSem: sem, provenance: { extractorType: 'codex_agent' },
    grounding: [{ path: 'clauses[0].roles.theme', termType: 'concept', head: { kind: 'symbol', namespace: 'open-concept', key: 'folder' }, modifiers: [{ relation: { kind: 'symbol', namespace: 'open-concept-relation', key: 'color' }, value: { kind: 'symbol', namespace: 'controlled-value', key: 'blue' } }] }],
  })));
  assert.equal(data.success, true);
  assert.equal(data.submission.grounding.status, 'pending');
  assert.equal(data.submission.candidateIdentityAvailable, false);
  assert.equal(data.submission.semanticFingerprint, null);
});

test('lunum_submit_candidate accepts explicit null abstention consistently with its schema', async () => {
  const data = JSON.parse(getText(await find('lunum_submit_candidate').handler({
    sourceText: 'The concept is unsupported.', candidateSem: null, provenance: { extractorType: 'codex_agent' },
  })));
  assert.equal(data.success, true);
  assert.equal(data.submission.candidateIdentityAvailable, false);
  assert.equal(data.submission.promotable, false);
});

test('blind eval_next strips evaluator-private fields at the MCP boundary', async () => {
  const tools = createBlindEvaluationTools({
    next: () => ({ runId: 'run', itemId: 'item', sourceLanguage: 'en', sourceText: 'source', contractVersion: 'v', contractHash: 'h', goldSem: { secret: true }, expectedFingerprint: 'secret', scoring: { answer: true } }),
    submit: async () => undefined,
  });
  const data = JSON.parse(getText(await tools[0]!.handler({})));
  assert.equal(data.success, true);
  assert.equal(data.item.goldSem, undefined);
  assert.equal(data.item.expectedFingerprint, undefined);
  assert.equal(data.item.scoring, undefined);
  assert.equal(data.item.sourceText, 'source');
});

test('lunum_derive returns real sidecar from text', async () => {
  const tool = find('lunum_derive');
  const result = await tool.handler({ text: 'The quick brown fox jumps over the lazy dog' });
  assert.strictEqual(result.isError, undefined);
  const data = JSON.parse(getText(result));
  assert.strictEqual(data.success, true);
  assert.ok(data.sidecar);
  assert.ok(data.sidecar.lunumCode);
  assert.ok(data.sidecar.lunumSem);
  assert.ok(data.sidecar.lunumFp);
  assert.ok(data.sidecar.lunumMeta);
});

test('lunum_derive with empty text returns error', async () => {
  const tool = find('lunum_derive');
  const result = await tool.handler({ text: '' });
  assert.strictEqual(result.isError, true);
});

test('lunum_compile_context compiles messages', async () => {
  const tool = find('lunum_compile_context');
  const messages = [
    { role: 'user', content: 'Hello world, this is a test message' },
    { role: 'assistant', content: 'Greetings, I am ready to help you' },
  ];
  const result = await tool.handler({ messages });
  const data = JSON.parse(getText(result));
  assert.strictEqual(data.success, true);
  assert.ok(typeof data.naturalTokens === 'number');
  assert.ok(typeof data.ratio === 'number');
  assert.strictEqual(data.messageCount, 2);
});

test('lunum_fingerprint produces real lfp digest', async () => {
  const tool = find('lunum_fingerprint');
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'factual_claim',
    clauses: [{ predicate: 'state', roles: { theme: { type: 'text', value: 'sky' }, attribute: { type: 'text', value: 'blue' } }, negated: false }],
  };
  const result = await tool.handler({ sem });
  const data = JSON.parse(getText(result));
  assert.strictEqual(data.success, true);
  assert.ok(data.fingerprint.startsWith('lfp:'));
  assert.ok(data.fingerprint.includes('sha256:'));
});

test('lunum_fingerprint is deterministic', async () => {
  const tool = find('lunum_fingerprint');
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'factual_claim',
    clauses: [{ predicate: 'state', roles: { theme: { type: 'text', value: 'test' } }, negated: false }],
  };
  const r1 = JSON.parse(getText(await tool.handler({ sem })));
  const r2 = JSON.parse(getText(await tool.handler({ sem })));
  assert.strictEqual(r1.fingerprint, r2.fingerprint);
});

test('lunum_validate accepts valid sem', async () => {
  const tool = find('lunum_validate');
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'factual_claim',
    clauses: [{ predicate: 'state', roles: { theme: 'sky' }, negated: false }],
  };
  const result = await tool.handler({ sem });
  const data = JSON.parse(getText(result));
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.valid, true);
  assert.strictEqual(data.errors.length, 0);
});

test('lunum_validate rejects invalid sem', async () => {
  const tool = find('lunum_validate');
  const result = await tool.handler({ sem: { bad: true } });
  const data = JSON.parse(getText(result));
  assert.strictEqual(data.valid, false);
  assert.ok(data.errors.length > 0);
});

test('lunum_render produces compact code', async () => {
  const tool = find('lunum_render');
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'factual_claim',
    clauses: [{ predicate: 'state', roles: { theme: { type: 'text', value: 'sky' }, attribute: { type: 'text', value: 'blue' } }, negated: false }],
  };
  const result = await tool.handler({ sem });
  const data = JSON.parse(getText(result));
  assert.strictEqual(data.success, true);
  assert.ok(data.code);
  assert.strictEqual(data.semantic, true);
});

test('lunum_compare detects identical sems', async () => {
  const tool = find('lunum_compare');
  const sem = {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'factual_claim',
    clauses: [{ predicate: 'state', roles: { theme: 'sky' }, negated: false }],
  };
  const result = await tool.handler({ expected: sem, actual: sem });
  const data = JSON.parse(getText(result));
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.comparison.exactCanonical, true);
  assert.strictEqual(data.comparison.featureRecall, 1);
});

test('lunum_classify returns eligibility decision', async () => {
  const tool = find('lunum_classify');
  const result = await tool.handler({ category: 'factual_claim', confidence: 0.9 });
  const data = JSON.parse(getText(result));
  assert.strictEqual(data.success, true);
  assert.ok('eligible' in data.decision);
});

test('blind evaluator factory exposes source-only next and forwards opaque submission', async () => {
  const seen: unknown[] = [];
  const tools = createBlindEvaluationTools({
    next: () => ({ runId: 'r', itemId: 'i', sourceLanguage: 'en', sourceText: 'source only', contractVersion: 'v', contractHash: 'h' }),
    submit: async (input) => { seen.push(input); return { status: 'passed', semanticIdentityExact: true }; },
  });
  const next = await tools[0]!.handler({});
  assert.equal(JSON.parse(next.content[0]!.text!).item.sourceText, 'source only');
  const submitted = await tools[1]!.handler({ runId: 'r', itemId: 'i', candidateSem: { schema: 'candidate' }, provenance: { extractorType: 'codex_agent' } });
  assert.equal(JSON.parse(submitted.content[0]!.text!).receipt.accepted, true);
  assert.deepEqual(seen, [{ runId: 'r', itemId: 'i', candidateSem: { schema: 'candidate' }, provenance: { extractorType: 'codex_agent' } }]);
});

test('blind evaluator factory permits explicit null abstention', async () => {
  let received: unknown;
  const tools = createBlindEvaluationTools({
    next: () => null,
    submit: async (input) => { received = input.candidateSem; return { status: 'passed' }; },
  });
  const result = await tools[1]!.handler({ runId: 'r', itemId: 'i', candidateSem: null, provenance: { extractorType: 'codex_agent' } });
  assert.equal(JSON.parse(result.content[0]!.text!).receipt.accepted, true);
  assert.equal(received, null);
});
