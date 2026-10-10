import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCandidateSem } from '../src/agent-builder.js';
import { getExtractionContract, submitCandidate } from '../src/agent-native.js';
import { semanticFingerprint } from '../src/fingerprint.js';
import { SEMANTIC_FRAME_REGISTRY_VERSION, validateSemFrames } from '../src/frame-registry.js';
import { renderSem, LOSSLESS_RENDERER } from '../src/render.js';
import { SEMANTIC_PROTOCOL_VERSION } from '../src/semantic-registry.js';
import { checkSourceBound, wordTokens } from '../src/source-bound.js';
import type { CandidateBuilderInput } from '../src/agent-builder.js';

// decisions/0024: general source-bound frames (protocol 0.6, frames 0.8, contract 0.19).
const provenance = { extractorType: 'agent' as const };
const text = (value: string) => ({ type: 'text', value });
const build = (input: Partial<CandidateBuilderInput> & Pick<CandidateBuilderInput, 'predicate' | 'roles'>) =>
  buildCandidateSem({ world: 'real', kind: 'simple_fact', negated: false, modality: null, ...input }).sem;
const submit = (sourceText: string, candidateSem: unknown, sourceLanguage = 'en') => submitCandidate({ sourceText, sourceLanguage, candidateSem, provenance });
const accepted = (sourceText: string, sem: unknown) => {
  const r = submit(sourceText, sem);
  assert.equal(r.candidateIdentityAvailable, true, `${sourceText} -> ${r.failureClass}: ${r.diagnostics.join(' | ')}`);
  assert.match(String(r.semanticFingerprint), /^lfp:2\.1:sha256:[0-9a-f]{32}$/u);
  return r;
};
const refused = (sourceText: string, sem: unknown, failure: string, sourceLanguage = 'en') => {
  const r = submit(sourceText, sem, sourceLanguage);
  assert.equal(r.candidateIdentityAvailable, false, sourceText);
  assert.equal(r.semanticFingerprint, null);
  assert.equal(r.failureClass, failure, `${sourceText}: ${r.diagnostics.join(' | ')}`);
  return r;
};

test('versions and the prompt block list the seven general frames', () => {
  assert.equal(SEMANTIC_PROTOCOL_VERSION, 'lunum-protocol/0.6');
  assert.equal(SEMANTIC_FRAME_REGISTRY_VERSION, 'lunum-frame/0.8');
  const contract = getExtractionContract();
  assert.equal(contract.contractVersion, 'lunum-agent/0.19');
  for (const name of ['define', 'describe', 'assert', 'relate', 'enumerate', 'quantify', 'topic']) {
    assert.ok(contract.frames.framedPredicates.includes(name), name);
    assert.ok(contract.protocol.registry.predicates.includes(name), name);
  }
  assert.match(contract.frameFirst.framePromptBlock, /^enumerate\(items; optional: subject; items: an array of at least two terms/mu);
  assert.match(contract.frameFirst.framePromptBlock, /^assert\(action;.*action: the verb phrase as written/mu);
  assert.ok(contract.canonicalRules.some((rule) => /source-bound|bound to its source/u.test(rule)));
});

const DEFINE = 'OpenUnum is a local-first agent framework.';
const defineSem = () => build({ predicate: 'define', roles: { subject: { type: 'project', value: 'OpenUnum' }, definition: text('a local-first agent framework') } });
const DESCRIBE = 'The main model has 128 GB of unified memory.';
const describeSem = () => build({ predicate: 'describe', roles: { subject: text('The main model'), attribute: text('has 128 GB of unified memory') } });
const ASSERT = 'OpenUnum runs on your own hardware.';
const assertSem = () => build({ predicate: 'assert', roles: { subject: { type: 'project', value: 'OpenUnum' }, action: text('runs'), location: text('your own hardware') } });
const RELATE = 'OpenUnum is faster than Ollama.';
const relateSem = () => build({ predicate: 'relate', roles: { subject: { type: 'project', value: 'OpenUnum' }, relation: text('faster than'), object: { type: 'project', value: 'Ollama' } } });
const ENUMERATE = 'Linux, macOS and Windows';
const enumerateSem = () => build({ predicate: 'enumerate', roles: { items: [text('Linux'), text('macOS'), text('Windows')] } });
const QUANTIFY = 'Memory: 128 GB unified';
const quantifySem = () => build({ predicate: 'quantify', roles: { subject: text('Memory'), amount: { type: 'quantity', value: 128, unit: 'GB' }, scope: text('unified') } });
const TOPIC = 'Memory and Recall';
const topicSem = () => build({ predicate: 'topic', roles: { subject: text('Memory and Recall') } });

test('each general frame gives an exact identity to a faithful, source-bound candidate', () => {
  const cases: Array<[string, string, unknown]> = [
    ['define', DEFINE, defineSem()], ['describe', DESCRIBE, describeSem()], ['assert', ASSERT, assertSem()], ['relate', RELATE, relateSem()],
    ['enumerate', ENUMERATE, enumerateSem()], ['quantify', QUANTIFY, quantifySem()], ['topic', TOPIC, topicSem()],
  ];
  const ids = cases.map(([, source, sem]) => accepted(source, sem).semanticFingerprint);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, source, sem] of cases) assert.equal(accepted(source, sem).semanticFingerprint, semanticFingerprint(sem));
  assert.equal(validateSemFrames(defineSem() as never).valid, true);
});

test('golden lfp:2.1 vectors for the general frames', () => {
  const got = Object.fromEntries([['define', defineSem()], ['describe', describeSem()], ['assert', assertSem()], ['relate', relateSem()], ['enumerate', enumerateSem()], ['quantify', quantifySem()], ['topic', topicSem()]].map(([k, v]) => [k, semanticFingerprint(v)]));
  assert.deepEqual(got, GOLDEN);
});

test('they render with role names under the lossless profile', () => {
  assert.equal(renderSem(assertSem() as never, { profile: LOSSLESS_RENDERER }).code, 'R assert(subject=OpenUnum, location=your own hardware, action=runs)');
  assert.equal(renderSem(enumerateSem() as never, { profile: LOSSLESS_RENDERER }).code, 'R enumerate(items=[Linux, macOS, Windows])');
});

test('a candidate that drops a content word of its source gets no identity', () => {
  refused('OpenUnum only runs on your own hardware.', assertSem(), 'unbound_source_content');
  refused('OpenUnum is a local-first agent framework for developers.', defineSem(), 'unbound_source_content');
  refused('Linux, macOS and Windows or BSD', enumerateSem(), 'unbound_source_content');
});

test('a filler that is not words of the source gets no identity', () => {
  const r = refused(ASSERT, build({ predicate: 'assert', roles: { subject: { type: 'project', value: 'OpenUnum' }, action: text('runs'), location: text('the cloud') } }), 'unbound_source_content');
  assert.match(r.diagnostics.join(' '), /"the cloud" is not words of the source/u);
  assert.deepEqual(r.sourceBound?.unsourced, ['the cloud']);
});

test('negation and modality must be carried, not dropped', () => {
  const source = 'OpenUnum does not send data to the cloud.';
  const roles = { subject: { type: 'project', value: 'OpenUnum' }, action: text('send'), object: text('data'), destination: text('the cloud') };
  refused(source, build({ predicate: 'assert', roles }), 'unbound_source_content');
  accepted(source, build({ predicate: 'assert', roles, negated: true }));
  const modalSource = 'OpenUnum can run offline.';
  const modalRoles = { subject: { type: 'project', value: 'OpenUnum' }, action: text('run'), manner: text('offline') };
  refused(modalSource, build({ predicate: 'assert', roles: modalRoles }), 'unbound_source_content');
  accepted(modalSource, build({ predicate: 'assert', roles: modalRoles, modality: 'ability' }));
});

test('words that change meaning cannot hide outside a filler', () => {
  for (const word of ['also', 'every', 'all', 'more', 'or', 'because', 'if', 'when']) {
    const r = checkSourceBound(`OpenUnum ${word} runs locally.`, assertSem() as never);
    assert.equal(r.bound, false, word);
    assert.ok(r.uncovered.includes(word) || r.unsourced.length, word);
  }
  assert.deepEqual(wordTokens('Local-first, **fast**!'), ['local', 'first', 'fast']);
});

test('a topic is a label, not a sentence in disguise', () => {
  const topicOf = (value: string) => build({ predicate: 'topic', roles: { subject: text(value) } });
  accepted('Why does it matter?', topicOf('Why does it matter?'));
  accepted('The Counter: I introduced a counter.', build({ predicate: 'topic', roles: { subject: text('The Counter') }, also: [{ predicate: 'assert', roles: { subject: text('I'), action: text('introduced'), object: text('a counter') } }] }));
  accepted('Your models.', topicOf('Your models')); // a tagline may end with a full stop
  accepted('2026-10-10', topicOf('2026-10-10')); // a bare date or number shown on its own
  refused('2026-10-10', topicOf('2026-10-11'), 'unretained_source_literal');
  const text9 = 'OpenUnum runs on your own hardware every single day.';
  const sentence = refused(text9, topicOf('OpenUnum runs on your own hardware every single day'), 'unbound_source_content');
  assert.deepEqual(sentence.sourceBound?.notALabel, ['OpenUnum runs on your own hardware every single day']);
  accepted('OpenUnum runs on your own hardware', topicOf('OpenUnum runs on your own hardware')); // no sentence punctuation: a label as far as the core can tell
  const long = Array.from({ length: 21 }, (_, i) => `word${i}`).join(' ');
  refused(long, topicOf(long), 'unbound_source_content');
});

test('contractions are expanded: n\'t needs negated, \'ll and \'d need a modality, \'s \'m \'re are free', () => {
  assert.deepEqual(wordTokens("I didn't know it's the lab's rig; we'll can't won't"), ['i', 'did', 'not', 'know', 'it', 'the', 'lab', 'rig', 'we', 'will', 'cannot', 'will', 'not']);
  const roles = { subject: text('I'), action: text('stop'), object: text('at diagnosis') };
  refused("I didn't stop at diagnosis.", build({ predicate: 'assert', roles }), 'unbound_source_content');
  accepted("I didn't stop at diagnosis.", build({ predicate: 'assert', roles, negated: true }));
  accepted("I'm aware.", build({ predicate: 'describe', roles: { subject: text('I'), attribute: text('aware') } }));
});

test('pronoun fillers, copula actions and one-item lists are refused by the frame', () => {
  const pronoun = build({ predicate: 'assert', roles: { subject: text('It'), action: text('runs'), location: text('your own hardware') } });
  refused('It runs on your own hardware.', pronoun, 'unbound_source_content');
  assert.throws(() => build({ predicate: 'assert', roles: { subject: { type: 'project', value: 'OpenUnum' }, action: text('is'), object: text('fast') } }), /copula_action/u);
  const copula = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'simple_fact', clauses: [{ predicate: 'assert', roles: { subject: { type: 'project', value: 'OpenUnum' }, action: text('is'), object: text('fast') }, negated: false }] };
  assert.equal(validateSemFrames(copula as never).issues[0]?.code, 'copula_action');
  refused('OpenUnum is fast', copula, 'frame_noncanonical');
  assert.throws(() => build({ predicate: 'enumerate', roles: { items: [text('Linux')] } }), /invalid_list_role/u);
  assert.throws(() => build({ predicate: 'enumerate', roles: { items: text('Linux, macOS') } }), /invalid_list_role/u);
  assert.throws(() => build({ predicate: 'assert', roles: { action: text('runs') } }), /missing_required_role/u);
  assert.throws(() => build({ predicate: 'define', roles: { subject: text('X') } }), /missing_required_role/u);
  assert.throws(() => build({ predicate: 'quantify', roles: { subject: text('Memory'), amount: text('a lot') } }), /disallowed_term_type/u);
});

test('numbers and identifiers still need literal retention', () => {
  const dropped = build({ predicate: 'describe', roles: { subject: text('The main model'), attribute: text('has unified memory') } });
  refused(DESCRIBE, dropped, 'unretained_source_literal');
});

test('the gate is English-only and fails closed for other source languages', () => {
  refused('Το OpenUnum τρέχει τοπικά.', build({ predicate: 'topic', roles: { subject: text('Το OpenUnum τρέχει τοπικά') } }), 'unbound_source_content', 'el');
});

test('general frames nest as conditions of other frames, and legacy frames are not source-bound', () => {
  const nested = build({ predicate: 'restart', kind: 'conditional_instruction', roles: { theme: { type: 'service', id: 'router' } },
    conditions: [{ predicate: 'describe', roles: { subject: text('the router'), attribute: text('is unhealthy') } }] });
  accepted('Restart router if the router is unhealthy.', nested);
  refused('Restart router if the router is unhealthy.', build({ ...({} as object), predicate: 'restart', kind: 'conditional_instruction', roles: { theme: { type: 'service', id: 'router' } }, conditions: [{ predicate: 'describe', roles: { subject: text('the router'), attribute: text('is healthy') } }] }), 'unbound_source_content');
  const legacy = build({ predicate: 'restart', kind: 'command', roles: { theme: { type: 'service', id: 'router' } } });
  assert.equal(submit('Please, when convenient, restart router.', legacy).sourceBound, null);
  assert.equal(submit('Please, when convenient, restart router.', legacy).candidateIdentityAvailable, true);
});

test('a subordinate clause stays whole in the adjunct role it plays; leaving it out is refused', () => {
  const source = 'OpenUnum restarts the service when the probe fails.';
  const roles = { subject: { type: 'project', value: 'OpenUnum' }, action: text('restarts'), object: text('the service') };
  accepted(source, build({ predicate: 'assert', roles: { ...roles, condition: text('when the probe fails') } }));
  refused(source, build({ predicate: 'assert', roles }), 'unbound_source_content');
  const because = 'The router is slow because the cache is cold.';
  accepted(because, build({ predicate: 'describe', roles: { subject: text('The router'), attribute: text('slow'), reason: text('because the cache is cold') } }));
});

test('a compound sentence joined by "and" is one candidate with further root clauses; other connectives are refused', () => {
  const clause = (subject: string, action: string, location: string) => ({ predicate: 'assert', roles: { subject: text(subject), action: text(action), location: text(location) } });
  const compound = (source: string) => submit(source, build({ ...clause('OpenUnum', 'runs', 'your hardware'), also: [clause('Ollama', 'runs', 'the cloud')] }));
  const ok = compound('OpenUnum runs on your hardware and Ollama runs in the cloud.');
  assert.equal(ok.candidateIdentityAvailable, true, ok.diagnostics.join(' | '));
  assert.equal(ok.sem?.clauses.length, 2);
  assert.equal(compound('OpenUnum runs on your hardware but Ollama runs in the cloud.').failureClass, 'unbound_source_content');
  assert.equal(compound('OpenUnum runs on your hardware, then Ollama runs in the cloud.').failureClass, 'unbound_source_content');
  // A connective is kept as written, in the role of the clause it introduces; it then stays in the identity.
  const but = submit('OpenUnum runs on your hardware but Ollama runs in the cloud.', build({ ...clause('OpenUnum', 'runs', 'your hardware'), also: [{ ...clause('Ollama', 'runs', 'the cloud'), roles: { connective: text('but'), subject: text('Ollama'), action: text('runs'), location: text('the cloud') } }] }));
  assert.equal(but.candidateIdentityAvailable, true, but.diagnostics.join(' | '));
  assert.notEqual(but.semanticFingerprint, ok.semanticFingerprint, 'but and and are different identities');
  const punct = submit('OpenUnum runs on your hardware; Ollama runs in the cloud.', build({ ...clause('OpenUnum', 'runs', 'your hardware'), also: [clause('Ollama', 'runs', 'the cloud')] }));
  assert.equal(punct.candidateIdentityAvailable, true);
  assert.equal(punct.semanticFingerprint, ok.semanticFingerprint, 'punctuation and "and" join the same clauses');
  const lead = submit('However, OpenUnum runs on your hardware.', build({ predicate: 'assert', roles: { connective: text('However'), subject: text('OpenUnum'), action: text('runs'), location: text('your hardware') } }));
  assert.equal(lead.candidateIdentityAvailable, true, lead.diagnostics.join(' | '));
  assert.equal(submit('However, OpenUnum runs on your hardware.', build({ predicate: 'assert', roles: { subject: text('OpenUnum'), action: text('runs'), location: text('your hardware') } })).failureClass, 'unbound_source_content');
  assert.equal(renderSem(ok.sem as never, { profile: LOSSLESS_RENDERER }).code, 'R assert(subject=OpenUnum, location=your hardware, action=runs) ; assert(subject=Ollama, location=the cloud, action=runs)');
  const idOrder = semanticFingerprint(build({ ...clause('Ollama', 'runs', 'the cloud'), also: [clause('OpenUnum', 'runs', 'your hardware')] }));
  assert.notEqual(idOrder, ok.semanticFingerprint, 'clause order is significant');
});

test('"also" is bounded and clause-shaped', () => {
  const one = { predicate: 'topic', roles: { subject: text('A') } };
  assert.doesNotThrow(() => build({ predicate: 'topic', roles: { subject: text('A') }, also: [one, one, one] }));
  assert.throws(() => build({ predicate: 'topic', roles: { subject: text('A') }, also: [one, one, one, one] }), /invalid_builder_also/u);
  assert.throws(() => build({ predicate: 'topic', roles: { subject: text('A') }, also: [{ ...one, kind: 'event' } as never] }), /unknown_builder_fields/u);
  assert.throws(() => build({ predicate: 'topic', roles: { subject: text('A') }, also: [{ predicate: 'topic', roles: {} }] }), /missing_required_role/u);
});

test('golden vectors of existing frames do not move', () => {
  const old = build({ predicate: 'deploy', kind: 'event', roles: { agent: { type: 'actor', id: 'ops' }, destination: { type: 'environment', id: 'staging' } } });
  assert.equal(semanticFingerprint(old), 'lfp:2.1:sha256:f81526396304fc4433ae8b29ed3d00e2');
});

const GOLDEN: Record<string, string> = {
  define: 'lfp:2.1:sha256:2631025f7172899930a5854ddec3bb3f',
  describe: 'lfp:2.1:sha256:d0b10e421c240bee3edb02f77feabe03',
  assert: 'lfp:2.1:sha256:b2c6d39e37920000e3dd82cbd17dbe7e',
  relate: 'lfp:2.1:sha256:65ad31f7408108eadf0ab69eb6f8adc0',
  enumerate: 'lfp:2.1:sha256:1b3a147637e5ac96d19c4ef351e60e94',
  quantify: 'lfp:2.1:sha256:0195c88b8ef0c88233f2a0679193d6e3',
  topic: 'lfp:2.1:sha256:f57453e99dc2137cafb14f2d0e1a2c00',
};
