import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSem } from '../src/render.js';

// generic-en-pivot/0.2 (decisions/0009): lossless where 0.1 drops information.
test('renderer 0.2 keeps the root action of a conditional, units, role names and time', () => {
  const conditional = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'conditional_instruction', clauses: [{
    predicate: 'enable', modality: 'obligation', roles: { agent: { type: 'system', id: 'S-11' }, theme: { type: 'feature', id: 'F-11' } },
    conditions: [{ predicate: 'below', roles: { subject: { type: 'metric', id: 'B-11' }, value: { type: 'quantity', value: 20, unit: 'percent' } } }],
    consequences: [{ predicate: 'send', modality: 'obligation', roles: { agent: { type: 'system', id: 'S-11' }, object: { type: 'document', id: 'N-11' }, recipient: { type: 'actor', id: 'O-11' } } }],
  }] } as never;
  assert.equal(renderSem(conditional, { profile: 'generic-en-pivot/0.2' }).code,
    'R if below(subject=b-11, value=20 percent) then must enable(agent=s-11, theme=f-11) ; must send(agent=s-11, recipient=o-11, object=n-11)');
  // 0.1 is unchanged, including its known loss of the root action.
  assert.equal(renderSem(conditional).code, 'R if below b-11 20 then obligation send s-11 o-11 n-11');
  const retry = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'event', clauses: [{ predicate: 'retry',
    roles: { agent: { type: 'actor', id: 'Rhea' }, theme: { type: 'task', id: 'U-31' }, count: { type: 'quantity', value: 7, unit: 'times' } },
    time: { type: 'date', value: '2027-01-14' } }] } as never;
  assert.equal(renderSem(retry, { profile: 'generic-en-pivot/0.2' }).code, 'R retry(agent=rhea, theme=u-31, count=7 times) @2027-01-14');
  const allow = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'event', clauses: [{ predicate: 'allow', negated: true,
    roles: { agent: { type: 'actor', id: 'Lena' }, recipient: { type: 'actor', id: 'Tomas' }, action: 'update' } }] } as never;
  assert.equal(renderSem(allow, { profile: 'generic-en-pivot/0.2' }).code, 'R not allow(agent=lena, recipient=tomas, action=update)');
});

// generic-en-pivot/0.3 (decisions/0031): 0.2 plus mood from kind.
test('renderer 0.3 shows interrogative and imperative mood; other kinds render as 0.2', async () => {
  const { MOOD_RENDERER } = await import('../src/render.js');
  const sem = (kind: string, roles: Record<string, unknown>) => ({ schema: 'lunum-sem/0.1-draft', world: 'real', kind, clauses: [{ predicate: 'assert', roles }] }) as never;
  const r = (s: never) => renderSem(s, { profile: MOOD_RENDERER }).code;
  assert.equal(MOOD_RENDERER, 'generic-en-pivot/0.3');
  assert.equal(r(sem('question', { subject: 'you', manner: 'at all', action: 'sleep' })), 'R question: assert(subject=you, manner=at all, action=sleep)?');
  assert.equal(r(sem('instruction', { object: 'looking at me', action: 'stop' })), 'R imperative to you: assert(object=looking at me, action=stop)');
  assert.equal(r(sem('command', { agent: 'ops', action: 'stop' })), 'R imperative: assert(agent=ops, action=stop)');
  assert.equal(r(sem('Instruction ', { Subject: 'you', action: 'stop' })), 'R imperative: assert(subject=you, action=stop)');
  for (const kind of ['event', 'simple_fact', 'conditional_instruction', 'directive']) {
    const s = sem(kind, { subject: 'Tom', action: 'left' });
    assert.equal(r(s), renderSem(s, { profile: 'generic-en-pivot/0.2' }).code, kind);
  }
  assert.equal(renderSem(sem('question', { subject: 'you', action: 'sleep' }), { profile: 'generic-en-pivot/0.2' }).code, 'R assert(subject=you, action=sleep)', '0.2 is unchanged');
});
