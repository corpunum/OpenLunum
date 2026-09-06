import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUNDING_CONTRACT_VERSION,
  canonicalizeGroundingProposal,
  evaluateGroundingProposals,
  materializeGroundingResolutions,
  resolveGroundingProposal,
} from '../src/grounding.js';

const sem = {
  schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'simple_fact',
  clauses: [{ predicate: 'prefer', roles: {
    theme: { type: 'concept', id: 'opaque_label' },
  }, negated: false }],
};

function proposal(key: string, surface?: string) {
  return {
    path: 'clauses[0].roles.theme', termType: 'concept',
    head: { kind: 'symbol' as const, namespace: 'open-concept', key: 'folder' },
    modifiers: [{
      relation: { kind: 'symbol' as const, namespace: 'open-concept-relation', key: 'color' },
      value: { kind: 'symbol' as const, namespace: 'controlled-value', key },
    }],
    ...(surface ? { surface, language: 'en' } : {}),
  };
}

test('structured grounding canonicalizes modifier order but excludes evidence', () => {
  const first = canonicalizeGroundingProposal(proposal('blue', 'blue folder'));
  const second = canonicalizeGroundingProposal({
    ...proposal('blue'),
    modifiers: [...proposal('blue').modifiers].reverse(),
    surface: 'folder that is blue', language: 'el',
  });
  assert.equal(first.valid, true);
  assert.equal(second.valid, true);
  assert.equal(first.canonical?.identity, second.canonical?.identity);
  assert.equal(first.canonical?.groundingFingerprint, second.canonical?.groundingFingerprint);
  assert.equal(first.canonical?.groundingFingerprint.startsWith(`gnd:${GROUNDING_CONTRACT_VERSION.slice('lunum-'.length)}`), true);
});

test('critical grounding mutations remain distinct', () => {
  const blue = canonicalizeGroundingProposal(proposal('blue'));
  const red = canonicalizeGroundingProposal(proposal('red'));
  const document = canonicalizeGroundingProposal({ ...proposal('blue'), head: { kind: 'symbol', namespace: 'open-concept', key: 'document' } });
  assert.notEqual(blue.canonical?.groundingFingerprint, red.canonical?.groundingFingerprint);
  assert.notEqual(blue.canonical?.groundingFingerprint, document.canonical?.groundingFingerprint);
});

test('malformed and duplicate grounding proposals fail closed', () => {
  const malformed = canonicalizeGroundingProposal({ ...proposal('blue'), path: 'clauses[0].roles' });
  assert.equal(malformed.valid, false);
  const duplicate = evaluateGroundingProposals(sem, [proposal('blue'), proposal('blue')]);
  assert.equal(duplicate.status, 'invalid');
  assert.equal(duplicate.exactIdentityAvailable, false);
});

test('grounding path is exact for nested clause locations and term types', () => {
  const nested = {
    ...sem,
    clauses: [{ predicate: 'prefer', roles: { theme: { type: 'concept', id: 'outer' } }, negated: false,
      conditions: [{ predicate: 'prefer', roles: { theme: { type: 'concept', id: 'inner' } }, negated: false }],
    }],
  };
  const accepted = evaluateGroundingProposals(nested, [{ ...proposal('blue'), path: 'clauses[0].conditions[0].roles.theme' }]);
  assert.equal(accepted.status, 'pending');
  assert.equal(accepted.proposals.length, 1);
  const wrongType = evaluateGroundingProposals(sem, [{ ...proposal('blue'), termType: 'actor' }]);
  assert.equal(wrongType.status, 'invalid');
  assert.equal(wrongType.exactIdentityAvailable, false);
});

test('agent grounding proposals never become lfp identity', () => {
  const result = evaluateGroundingProposals(sem, [proposal('blue')]);
  assert.equal(result.status, 'pending');
  assert.equal(result.exactIdentityAvailable, false);
  assert.match(result.proposals[0]?.groundingFingerprint ?? '', /^gnd:/u);
});

test('exact registry resolution is pinned, namespace-qualified, and deterministic', () => {
  const candidate = canonicalizeGroundingProposal(proposal('blue'));
  const registry = {
    registryId: 'dev-registry', version: '2026-09-06', snapshotHash: 'a'.repeat(64),
    lookupExact: ({ groundingFingerprint }: { groundingFingerprint: string }) => [{ groundingFingerprint, canonicalId: 'urn:dev-registry:concept:blue-folder' }],
  };
  const resolved = resolveGroundingProposal(proposal('blue'), registry);
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.canonicalId, 'urn:dev-registry:concept:blue-folder');
  const materialized = materializeGroundingResolutions(sem, [resolved]);
  assert.equal(materialized.status, 'resolved');
  assert.equal((materialized.sem?.clauses[0]?.roles.theme as { id?: string }).id, 'urn:dev-registry:concept:blue-folder');
  assert.ok(candidate.canonical?.groundingFingerprint);
});

test('registry misses, ambiguity, and fingerprint mismatch never resolve exact identity', () => {
  const base = { registryId: 'dev', version: '1', snapshotHash: 'b'.repeat(64) };
  const missing = resolveGroundingProposal(proposal('blue'), { ...base, lookupExact: () => [] });
  assert.equal(missing.status, 'unresolved');
  const ambiguous = resolveGroundingProposal(proposal('blue'), { ...base, lookupExact: ({ groundingFingerprint }: { groundingFingerprint: string }) => [
    { groundingFingerprint, canonicalId: 'urn:dev:one' }, { groundingFingerprint, canonicalId: 'urn:dev:two' },
  ] });
  assert.equal(ambiguous.status, 'ambiguous');
  const mismatch = resolveGroundingProposal(proposal('blue'), { ...base, lookupExact: () => [{ groundingFingerprint: 'gnd:wrong', canonicalId: 'urn:dev:wrong' }] });
  assert.equal(mismatch.status, 'unresolved');
  const unqualified = resolveGroundingProposal(proposal('blue'), { ...base, lookupExact: ({ groundingFingerprint }: { groundingFingerprint: string }) => [{ groundingFingerprint, canonicalId: 'blue-folder' }] });
  assert.equal(unqualified.status, 'invalid');
  const crossNamespace = resolveGroundingProposal(proposal('blue'), { ...base, lookupExact: ({ groundingFingerprint }: { groundingFingerprint: string }) => [{ groundingFingerprint, canonicalId: 'urn:attacker:blue-folder' }] });
  assert.equal(crossNamespace.status, 'invalid');
  assert.equal(materializeGroundingResolutions(sem, [missing]).sem, null);
});

test('materialization preserves role paths and rejects duplicate or conflicting fields', () => {
  const resolved = resolveGroundingProposal(proposal('blue'), {
    registryId: 'dev', version: '1', snapshotHash: 'c'.repeat(64),
    lookupExact: ({ groundingFingerprint }: { groundingFingerprint: string }) => [{ groundingFingerprint, canonicalId: 'urn:dev:blue' }],
  });
  const duplicate = materializeGroundingResolutions(sem, [resolved, resolved]);
  assert.equal(duplicate.status, 'invalid');
  const conflict = { ...sem, clauses: [{ predicate: 'prefer', roles: { theme: { type: 'concept', id: 'old', ref: 'old-ref' } }, negated: false }] };
  const rejected = materializeGroundingResolutions(conflict, [resolved]);
  assert.equal(rejected.status, 'invalid');
});

test('materialization rejects forged or cross-namespace resolver IDs', () => {
  const base = { path: 'clauses[0].roles.theme', status: 'resolved' as const, registry: { registryId: 'dev', version: '1', snapshotHash: 'a'.repeat(64) }, issues: [] };
  const forged = materializeGroundingResolutions(sem, [{ ...base, canonicalId: 'urn:attacker:wrong' }]);
  assert.equal(forged.status, 'invalid');
  assert.match(forged.issues[0]!, /outside its resolver namespace/u);
  const missingProvenance = materializeGroundingResolutions(sem, [{ path: base.path, status: 'resolved', canonicalId: 'urn:dev:ok', issues: [] }]);
  assert.equal(missingProvenance.status, 'invalid');
});
