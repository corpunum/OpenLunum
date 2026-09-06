import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOmwProvider,
  createMorphologyAugmentedProvider,
  intersectGroundingCandidateSets,
  createStableEntityProvider,
  importOmwTab,
  importWnLmf,
  resolveGroundingCascade,
  toGroundingResolution,
} from '../src/grounding-provider.js';
import { submitCandidateWithGroundingProviders } from '../src/agent-native.js';
import { materializeGroundingResolutions } from '../src/grounding.js';
import type { GroundingModifier, GroundingProposal } from '../src/grounding.js';

const proposal = (head = 'folder', modifiers: readonly GroundingModifier[] = []): GroundingProposal => ({
  path: 'clauses[0].roles.theme', termType: 'concept',
  head: { kind: 'symbol' as const, namespace: 'open-concept', key: head }, modifiers,
});

const blueModifier = [{
  relation: { kind: 'symbol' as const, namespace: 'open-concept-relation', key: 'color' },
  value: { kind: 'symbol' as const, namespace: 'controlled-value', key: 'blue' },
}];

const records = [
  { language: 'en', lemma: 'folder', interlingualId: 'i123', partOfSpeech: 'noun' as const, source: 'dev-en', license: 'OPEN' },
  { language: 'el', lemma: 'φάκελος', interlingualId: 'i123', partOfSpeech: 'noun' as const, source: 'dev-el', license: 'OPEN' },
  { language: 'es', lemma: 'carpeta', interlingualId: 'i123', partOfSpeech: 'noun' as const, source: 'dev-es', license: 'OPEN' },
  { language: 'en', lemma: 'bank', interlingualId: 'i-bank-money', partOfSpeech: 'noun' as const },
  { language: 'en', lemma: 'bank', interlingualId: 'i-bank-river', partOfSpeech: 'noun' as const },
];

const provider = createOmwProvider({ version: 'omw-data/2.0-dev-fixture', records });

test('OMW provider converges exact multilingual lemmas and rejects composition overreach', () => {
  const en = provider.resolve({ proposal: proposal(), language: 'en', partOfSpeech: 'noun' });
  const el = provider.resolve({ proposal: proposal('φάκελος'), language: 'el', partOfSpeech: 'noun' });
  const es = provider.resolve({ proposal: proposal('carpeta'), language: 'es', partOfSpeech: 'noun' });
  assert.equal(en.status, 'resolved_exact');
  assert.equal(el.status, 'resolved_exact');
  assert.equal(es.status, 'resolved_exact');
  assert.equal(en.candidates[0]?.externalId, el.candidates[0]?.externalId);
  assert.equal(el.candidates[0]?.externalId, es.candidates[0]?.externalId);
  const composed = provider.resolve({ proposal: proposal('folder', blueModifier), language: 'en', partOfSpeech: 'noun' });
  assert.equal(composed.status, 'unresolved');
});

test('OMW provider fails closed for polysemy, missing language, and wrong POS', () => {
  assert.equal(provider.resolve({ proposal: proposal('bank'), language: 'en', partOfSpeech: 'noun' }).status, 'ambiguous');
  assert.equal(provider.resolve({ proposal: proposal(), language: 'fr', partOfSpeech: 'noun' }).status, 'unresolved');
  assert.equal(provider.resolve({ proposal: proposal(), language: 'en', partOfSpeech: 'verb' }).status, 'unresolved');
});

test('morphology augmentation is candidate generation, exact only after unique provider resolution', () => {
  const analyzer = {
    analyzer: 'fixture-morphology', analyzerVersion: '1', snapshotHash: 'e'.repeat(64),
    analyze: ({ surface }: { surface: string }) => surface === 'running'
      ? [{ lemma: 'run', partOfSpeech: 'verb' as const, evidence: ['fixture:inflection'] }]
      : surface === 'banking'
        ? [{ lemma: 'bank', partOfSpeech: 'noun' as const, evidence: ['fixture:derivation'] }]
        : [],
  };
  const base = createOmwProvider({ version: 'morph-base', records: [
    { language: 'en', lemma: 'run', interlingualId: 'i-run', partOfSpeech: 'verb' },
    { language: 'en', lemma: 'bank', interlingualId: 'i-bank-money', partOfSpeech: 'noun' },
    { language: 'en', lemma: 'bank', interlingualId: 'i-bank-river', partOfSpeech: 'noun' },
  ] });
  const augmented = createMorphologyAugmentedProvider({ base, analyzer });
  const running = augmented.resolve({ proposal: proposal('running'), language: 'en', partOfSpeech: 'verb' });
  assert.equal(running.status, 'resolved_exact');
  assert.equal(running.candidates[0]?.externalId, 'ili:i-run');
  assert.equal(augmented.resolve({ proposal: proposal('banking'), language: 'en', partOfSpeech: 'noun' }).status, 'ambiguous');
  assert.equal(augmented.resolve({ proposal: proposal('unknown'), language: 'en', partOfSpeech: 'noun' }).status, 'unresolved');
});

test('candidate-set intersection narrows only explicit shared evidence', () => {
  const result = intersectGroundingCandidateSets([
    { status: 'ambiguous', provider: 'a', providerVersion: '1', snapshotHash: 'a'.repeat(64), language: 'en', candidates: [{ externalId: 'ili:i1', evidence: [] }, { externalId: 'ili:i2', evidence: [] }], diagnostics: [] },
    { status: 'resolved_exact', provider: 'b', providerVersion: '1', snapshotHash: 'b'.repeat(64), language: 'el', candidates: [{ externalId: 'ili:i1', evidence: [] }], diagnostics: [] },
  ], { relation: 'same-translation' });
  assert.equal(result.status, 'candidate_narrowed');
  assert.equal(result.candidates[0]?.externalId, 'ili:i1');
  assert.match(result.diagnostics[0]!, /provider-owned exact resolution/u);
  assert.equal(intersectGroundingCandidateSets([{ status: 'ambiguous', provider: 'a', providerVersion: '1', snapshotHash: 'a'.repeat(64), language: 'en', candidates: [{ externalId: 'ili:i1', evidence: [] }, { externalId: 'ili:i2', evidence: [] }], diagnostics: [] }], { relation: 'same-concept' }).status, 'ambiguous');
  assert.equal(intersectGroundingCandidateSets([{ status: 'ambiguous', provider: 'a', providerVersion: '1', snapshotHash: 'a'.repeat(64), language: 'en', candidates: [{ externalId: 'ili:i1', evidence: [] }], diagnostics: [] }, { status: 'ambiguous', provider: 'b', providerVersion: '1', snapshotHash: 'b'.repeat(64), language: 'el', candidates: [{ externalId: 'Q1', evidence: [] }], diagnostics: [] }], { relation: 'same-translation' }).status, 'unresolved');
  assert.match(intersectGroundingCandidateSets([], { relation: 'same-concept' }).diagnostics[0]!, /no provider/u);
  assert.match(intersectGroundingCandidateSets([], undefined as never).diagnostics[0]!, /explicit semantic relation/u);
  assert.equal(intersectGroundingCandidateSets([
    { status: 'unresolved', provider: 'a', providerVersion: '1', snapshotHash: 'a'.repeat(64), language: 'en', candidates: [{ externalId: 'ili:i1', evidence: [] }], diagnostics: [] },
    { status: 'resolved_exact', provider: 'b', providerVersion: '1', snapshotHash: 'b'.repeat(64), language: 'el', candidates: [{ externalId: 'ili:i1', evidence: [] }], diagnostics: [] },
  ], { relation: 'same-translation' }).status, 'unresolved');
  assert.equal(intersectGroundingCandidateSets([
    { status: 'ambiguous', provider: 'same', providerVersion: '1', snapshotHash: 'a'.repeat(64), language: 'en', candidates: [{ externalId: 'ili:i1', evidence: [] }], diagnostics: [] },
    { status: 'ambiguous', provider: 'same', providerVersion: '1', snapshotHash: 'a'.repeat(64), language: 'el', candidates: [{ externalId: 'ili:i1', evidence: [] }], diagnostics: [] },
  ], { relation: 'same-translation' }).status, 'unresolved');
});

test('morphology cannot override an explicit POS and analyzer failures fail closed', () => {
  const base = createOmwProvider({ version: 'morph-pos', records: [{ language: 'en', lemma: 'run', interlingualId: 'i-run', partOfSpeech: 'verb' }] });
  const wrongPos = createMorphologyAugmentedProvider({ base, analyzer: { analyzer: 'bad-pos', analyzerVersion: '1', snapshotHash: 'f'.repeat(64), analyze: () => [{ lemma: 'run', partOfSpeech: 'verb', evidence: [] }] } });
  assert.equal(wrongPos.resolve({ proposal: proposal('running'), language: 'en', partOfSpeech: 'noun' }).status, 'unresolved');
  const throwing = createMorphologyAugmentedProvider({ base, analyzer: { analyzer: 'throwing', analyzerVersion: '1', snapshotHash: 'f'.repeat(64), analyze: () => { throw new Error('offline'); } } });
  assert.equal(throwing.resolve({ proposal: proposal('running'), language: 'en', partOfSpeech: 'verb' }).status, 'provider_error');
});

test('stable entity provider accepts only exact prevalidated IDs and deduplicates', () => {
  const entity = createStableEntityProvider({
    provider: 'wikidata', providerVersion: 'snapshot-fixture', snapshotHash: 'a'.repeat(64),
    resolveExact: () => [{ externalId: 'Q42', label: 'Douglas Adams', evidence: ['description:writer'] }, { externalId: 'Q42', label: 'Douglas Adams', evidence: ['alias'] }],
  });
  const result = entity.resolve({ proposal: proposal('douglas_adams'), language: 'en' });
  assert.equal(result.status, 'resolved_exact');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.externalId, 'Q42');
});

test('stable entity provider rejects malformed IDs and resolver failures', () => {
  const malformed = createStableEntityProvider({ provider: 'wikidata', providerVersion: '1', snapshotHash: 'a'.repeat(64), resolveExact: () => [{ externalId: '', evidence: [] }] });
  assert.equal(malformed.resolve({ proposal: proposal('x'), language: 'en' }).status, 'provider_error');
  const throwing = createStableEntityProvider({ provider: 'wikidata', providerVersion: '1', snapshotHash: 'a'.repeat(64), resolveExact: () => { throw new Error('offline'); } });
  assert.equal(throwing.resolve({ proposal: proposal('x'), language: 'en' }).status, 'provider_error');
});

test('cascade does not majority-vote provider disagreement', () => {
  const first = createStableEntityProvider({ provider: 'omw-cili', providerVersion: '1', snapshotHash: 'b'.repeat(64), resolveExact: () => [{ externalId: 'ili:i1', evidence: [] }] });
  const second = createStableEntityProvider({ provider: 'wikidata', providerVersion: '1', snapshotHash: 'c'.repeat(64), resolveExact: () => [{ externalId: 'Q1', evidence: [] }] });
  const result = resolveGroundingCascade({ proposal: proposal(), language: 'en' }, [first, second]);
  assert.equal(result.status, 'ambiguous');
});

test('cascade does not equate identical bare IDs across namespaces', () => {
  const first = createStableEntityProvider({ provider: 'wikidata', providerVersion: '1', snapshotHash: 'b'.repeat(64), resolveExact: () => [{ externalId: 'Q1', evidence: [] }] });
  const second = createStableEntityProvider({ provider: 'other', providerVersion: '1', snapshotHash: 'c'.repeat(64), resolveExact: () => [{ externalId: 'Q1', evidence: [] }] });
  assert.equal(resolveGroundingCascade({ proposal: proposal(), language: 'en' }, [first, second]).status, 'ambiguous');
});

test('cascade contains malformed arbitrary provider results', () => {
  const malformed = {
    provider: 'malformed', providerVersion: '1', snapshotHash: 'd'.repeat(64),
    resolve: () => ({ status: 'resolved_exact', provider: 'malformed', providerVersion: '1', snapshotHash: 'd'.repeat(64), language: 'en', candidates: [{ externalId: '', evidence: [] }], diagnostics: [] }),
    explain: () => [],
  } as unknown as import('../src/grounding-provider.js').GroundingProvider;
  const result = resolveGroundingCascade({ proposal: proposal(), language: 'en' }, [malformed]);
  assert.equal(result.status, 'provider_error');
  assert.equal(result.candidate, undefined);
});

test('cascade binds provider metadata and validates later comparisons', () => {
  const trusted = createStableEntityProvider({ provider: 'trusted', providerVersion: '1', snapshotHash: 'e'.repeat(64), resolveExact: () => [{ externalId: 'Q1', evidence: [] }] });
  const impersonating = {
    provider: 'untrusted', providerVersion: '1', snapshotHash: 'f'.repeat(64),
    resolve: () => ({ status: 'resolved_exact', provider: 'trusted', providerVersion: '1', snapshotHash: 'e'.repeat(64), language: 'en', candidates: [{ externalId: 'Q1', evidence: [] }], diagnostics: [] }),
    explain: () => [],
  } as unknown as import('../src/grounding-provider.js').GroundingProvider;
  assert.equal(resolveGroundingCascade({ proposal: proposal(), language: 'en' }, [impersonating]).status, 'provider_error');
  const malformedLater = {
    provider: 'later', providerVersion: '1', snapshotHash: 'f'.repeat(64),
    resolve: () => ({ status: 'resolved_exact', provider: 'later', providerVersion: '1', snapshotHash: 'f'.repeat(64), language: 'en', candidates: [{ externalId: 'Q1' }], diagnostics: [] }),
    explain: () => [],
  } as unknown as import('../src/grounding-provider.js').GroundingProvider;
  const first = createStableEntityProvider({ provider: 'first', providerVersion: '1', snapshotHash: 'e'.repeat(64), resolveExact: () => [{ externalId: 'Q1', evidence: [] }] });
  const result = resolveGroundingCascade({ proposal: proposal(), language: 'en' }, [first, malformedLater]);
  assert.equal(result.status, 'resolved_exact');
  assert.equal(result.results.at(-1)?.status, 'provider_error');
});

test('provider resolution materializes a versioned Lunum namespace ID', () => {
  const result = provider.resolve({ proposal: proposal(), language: 'en', partOfSpeech: 'noun' });
  const resolution = toGroundingResolution(proposal(), result);
  assert.equal(resolution.status, 'resolved');
  assert.equal(resolution.canonicalId, 'urn:omw-cili:ili:i123');
  const sem = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'simple_fact', clauses: [{ predicate: 'prefer', roles: { theme: { type: 'concept', id: 'opaque' } }, negated: false }] };
  const materialized = materializeGroundingResolutions(sem, [resolution], [proposal()]);
  assert.equal(materialized.status, 'resolved');
  assert.equal((materialized.sem?.clauses[0]?.roles.theme as { id?: string }).id, 'urn:omw-cili:ili:i123');
});

test('provider failure degrades without guessing', () => {
  const broken = createStableEntityProvider({ provider: 'broken', providerVersion: '1', snapshotHash: 'd'.repeat(64), resolveExact: () => { throw new Error('offline'); } });
  const result = resolveGroundingCascade({ proposal: proposal(), language: 'en' }, [broken]);
  assert.equal(result.status, 'provider_error');
  assert.equal(result.candidate, undefined);
});

test('malformed pinned snapshots are rejected instead of partially indexed', () => {
  assert.throws(() => createOmwProvider({ version: 'bad', records: [{ language: 'en', lemma: 'folder', interlingualId: '' }] }), /invalid interlingual ID/u);
});

test('OMW tab importer maps only explicit CILI synsets and reports gaps', () => {
  const imported = importOmwTab('# header\n00000001-n\teng:lemma\tfolder\n00000002-n\teng:lemma\tfolder\n00000003-v\teng:lemma\tfile\nnot-a-record', {
    language: 'en', source: 'omw-en/2.0', license: 'OPEN',
    synsetToInterlingualId: new Map([['00000001-n', 'i123'], ['00000003-v', 'i456']]),
  });
  assert.equal(imported.records.length, 2);
  assert.equal(imported.records[0]?.lemma, 'folder');
  assert.deepEqual(imported.unmappedSynsets, ['00000002-n']);
  assert.deepEqual(imported.malformedLines, [5]);
  assert.deepEqual(imported.invalidMappings, []);
});

test('OMW tab importer classifies malformed mapped and unmapped rows before coverage gaps', () => {
  const imported = importOmwTab('00000001-n\teng:lemma\t\n00000002-n\tbad\tterm\n00000003-n\teng:lemma\tterm', {
    language: 'en', source: 'fixture', synsetToInterlingualId: new Map([['00000001-n', 'i1'], ['00000003-n', 'i3']]),
  });
  assert.deepEqual(imported.malformedLines, [1, 2]);
  assert.deepEqual(imported.unmappedSynsets, []);
  assert.equal(imported.records.length, 1);
});

test('OMW tab importer supports Wordnet Bahasa language-filtered rows', () => {
  const imported = importOmwTab('00000001-n\tB\tY\tfolder\n00000001-n\tI\tY\tfolder\n00000002-n\tI\tX\tother', {
    language: 'id', format: 'wordnet-bahasa', languageColumnValue: 'I',
    synsetToInterlingualId: new Map([['00000001-n', 'i123'], ['00000002-n', 'i456']]),
  });
  assert.equal(imported.records.length, 2);
  assert.equal(imported.records[0]?.language, 'id');
  assert.equal(imported.records[0]?.lemma, 'folder');
  assert.deepEqual(imported.invalidMappings, []);
});

test('WN-LMF importer preserves only explicit non-proposed ILI mappings', () => {
  const xml = `<LexicalResource><Lexicon language="de"><LexicalEntry id="w1"><Lemma writtenForm="Kernspaltung" partOfSpeech="n"/><Sense synset="odenet-1-n"/></LexicalEntry><LexicalEntry id="w2"><Lemma writtenForm="Atomspaltung" partOfSpeech="n"/><Sense synset="odenet-2-n"/></LexicalEntry><Synset id="odenet-1-n" ili="i123" partOfSpeech="n"/><Synset id="odenet-2-n" ili="" partOfSpeech="n"/></Lexicon></LexicalResource>`;
  const imported = importWnLmf(xml, { language: 'de', source: 'odenet:1.4', license: 'CC BY-SA 4.0' });
  assert.equal(imported.records.length, 1);
  assert.equal(imported.records[0]?.lemma, 'Kernspaltung');
  assert.equal(imported.records[0]?.interlingualId, 'i123');
  assert.deepEqual(imported.unmappedSynsets, ['odenet-2-n']);
  assert.deepEqual(imported.invalidMappings, []);
});

test('WN-LMF importer counts truncated lexical entries as malformed', () => {
  const xml = '<LexicalResource><Lexicon><LexicalEntry id="w1"><Lemma writtenForm="broken" partOfSpeech="n"/></Lexicon></LexicalResource>';
  const imported = importWnLmf(xml, { language: 'de' });
  assert.equal(imported.records.length, 0);
  assert.equal(imported.malformedEntries, 1);
});

test('importers quarantine malformed interlingual IDs', () => {
  const imported = importOmwTab('00000001-n\teng:lemma\tfolder', {
    language: 'en', synsetToInterlingualId: new Map([['00000001-n', 'not-a-cili-id']]),
  });
  assert.equal(imported.records.length, 0);
  assert.deepEqual(imported.invalidMappings, [1]);
});

test('OMW exact lookup requires POS and normalizes phrase separators conservatively', () => {
  const provider = createOmwProvider({ version: 'test', records: [{ language: 'en', lemma: 'blue folder', interlingualId: 'i123', partOfSpeech: 'noun' }] });
  const proposal = (key: string): GroundingProposal => ({ path: 'clauses[0].roles.theme', termType: 'concept', head: { kind: 'symbol', namespace: 'lex', key }, modifiers: [] });
  assert.equal(provider.resolve({ proposal: proposal('blue_folder'), language: 'en' }).status, 'unresolved');
  assert.equal(provider.resolve({ proposal: proposal('blue  folder'), language: 'en', partOfSpeech: 'noun' }).status, 'resolved_exact');
  assert.equal(provider.resolve({ proposal: proposal('blue\tfolder'), language: 'en', partOfSpeech: 'noun' }).status, 'resolved_exact');
});

test('OMW indexed lookup preserves duplicate-sense ambiguity and exact results', () => {
  const indexed = createOmwProvider({ version: 'indexed-fixture', records: [
    { language: 'en', lemma: 'bank', interlingualId: 'i-money', partOfSpeech: 'noun' },
    { language: 'en', lemma: 'bank', interlingualId: 'i-river', partOfSpeech: 'noun' },
    { language: 'en', lemma: 'bank', interlingualId: 'i-bank-verb', partOfSpeech: 'verb' },
  ] });
  assert.equal(indexed.resolve({ proposal: proposal('bank'), language: 'en', partOfSpeech: 'noun' }).status, 'ambiguous');
  assert.equal(indexed.resolve({ proposal: proposal('bank'), language: 'en', partOfSpeech: 'verb' }).status, 'resolved_exact');
  assert.equal(indexed.resolve({ proposal: proposal('bank'), language: 'en', partOfSpeech: 'adjective' }).status, 'unresolved');
});

test('provider-backed submission materializes only exact grounding evidence', () => {
  const sem = { schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference', clauses: [{ predicate: 'prefer', roles: { experiencer: { type: 'actor', id: 'mira' }, theme: { type: 'concept', id: 'folder' } }, negated: false }] };
  const grounded = submitCandidateWithGroundingProviders({
    sourceText: 'A folder is preferred.', sourceLanguage: 'en', candidateSem: sem,
    provenance: { extractorType: 'codex_agent' },
    grounding: [{ ...proposal('folder'), language: 'en', partOfSpeech: 'noun' }],
  }, [provider]);
  assert.equal(grounded.candidateIdentityAvailable, true);
  assert.match(grounded.semanticFingerprint ?? '', /^lfp:2\.1:/u);
  assert.equal((grounded.sem?.clauses[0]?.roles.theme as { id?: string }).id, 'urn:omw-cili:ili:i123');
  assert.equal(grounded.providerResults[0]?.status, 'resolved_exact');
  const unresolved = submitCandidateWithGroundingProviders({
    sourceText: 'A blue folder is preferred.', sourceLanguage: 'en', candidateSem: sem,
    provenance: { extractorType: 'codex_agent' }, grounding: [{ ...proposal('folder', blueModifier), language: 'en', partOfSpeech: 'noun' }],
  }, [provider]);
  assert.equal(unresolved.candidateIdentityAvailable, false);
  assert.equal(unresolved.failureClass, 'grounding_unresolved');
});
