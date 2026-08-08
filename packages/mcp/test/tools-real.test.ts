import { test } from 'node:test';
import assert from 'node:assert';
import { lunumTools } from '../src/tools.js';

const find = (name: string) => {
  const tool = lunumTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool;
};

function getText(result: { content: Array<{ text?: string }> }): string {
  return result.content[0]?.text ?? '';
}

test('lunumTools has 7 real tools', () => {
  assert.strictEqual(lunumTools.length, 7);
  const names = lunumTools.map((t) => t.name);
  assert.ok(names.includes('lunum_derive'));
  assert.ok(names.includes('lunum_compile_context'));
  assert.ok(names.includes('lunum_fingerprint'));
  assert.ok(names.includes('lunum_validate'));
  assert.ok(names.includes('lunum_render'));
  assert.ok(names.includes('lunum_compare'));
  assert.ok(names.includes('lunum_classify'));
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
